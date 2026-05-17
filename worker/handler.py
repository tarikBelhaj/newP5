"""
RunPod Worker — Wan2.2-Animate Character Replacement (ComfyUI self-hosted)
==========================================================================

Pipeline:
  1. Download user_video_url → /tmp/input_video.mp4
  2. Download character_image_url → /tmp/character.png
  3. Load workflow JSON from WAN_WORKFLOW_PATH
  4. Patch all PATCH: placeholders with real paths and model names
  5. Submit patched workflow to ComfyUI /prompt
  6. Poll /history/{prompt_id} until completed
  7. Merge original audio with ffmpeg (if keep_original_audio=true)
  8. Upload to Supabase Storage (or save locally if LOCAL_TEST=true)
  9. Return { output_video_url, execution_time_ms }

Environment variables:
  COMFYUI_HOST          http://127.0.0.1:8188  (default)
  COMFYUI_OUTPUT_DIR    /comfyui/output         (default)
  WAN_WORKFLOW_PATH     /app/workflows/wan22_animate_replace_api.json  (default)
  LOCAL_TEST            true|false  — skip upload, save to /tmp
  SUPABASE_URL          required unless LOCAL_TEST=true
  SUPABASE_SERVICE_KEY  required unless LOCAL_TEST=true

  Model name env vars (optional overrides, auto-detected from disk if not set):
  WAN_DIFFUSION_MODEL   Wan2_2-Animate-14B_fp8_e4m3fn_scaled_KJ.safetensors
  WAN_VAE_MODEL         Wan2_1_VAE_bf16.safetensors
  WAN_TEXT_ENCODER      umt5-xxl-enc-bf16.safetensors
  WAN_CLIP_VISION       clip_vision_h.safetensors
  WAN_YOLO_MODEL        yolov10m.onnx
  WAN_VITPOSE_MODEL     vitpose-l-wholebody.onnx
  WAN_SAM2_MODEL        sam2_hiera_large.safetensors
  WAN_LORA_MODEL        (optional) lightx2v_I2V_14B_480p_cfg_step_distill_rank64_bf16.safetensors
"""

import runpod
import os, json, time, uuid, shutil, subprocess, tempfile
import urllib.request, urllib.error

# ─── Constants ────────────────────────────────────────────────────────────────

COMFYUI_HOST   = os.environ.get("COMFYUI_HOST",       "http://127.0.0.1:8188")
COMFYUI_OUTPUT = os.environ.get("COMFYUI_OUTPUT_DIR", "/comfyui/output")
WORKFLOW_PATH  = os.environ.get("WAN_WORKFLOW_PATH",   "/app/workflows/wan22_animate_replace_api.json")
LOCAL_TEST     = os.environ.get("LOCAL_TEST",         "false").lower() == "true"

# ComfyUI model directory paths
MODELS_BASE  = os.environ.get("COMFYUI_MODELS", "/comfyui/models")


def _model_dir(sub: str) -> str:
    return os.path.join(MODELS_BASE, sub)


# ─── Model auto-detection ─────────────────────────────────────────────────────

def find_model(directory: str, patterns: list[str], required: bool = True) -> str | None:
    """Find first existing model file matching any pattern in a directory."""
    full_dir = _model_dir(directory)
    if not os.path.exists(full_dir):
        if required:
            raise RuntimeError(
                f"Model directory not found: {full_dir}\n"
                f"  See worker/MODELS.md for download instructions."
            )
        return None

    for pattern in patterns:
        for root, _, files in os.walk(full_dir):
            for f in files:
                if pattern.lower() in f.lower():
                    return f
    if required:
        raise RuntimeError(
            f"No model matching {patterns} found in {full_dir}\n"
            f"  See worker/MODELS.md for download instructions."
        )
    return None


def resolve_models() -> dict:
    """Resolve all required model filenames from env vars or filesystem."""
    return {
        "diffusion_model": os.environ.get("WAN_DIFFUSION_MODEL") or find_model(
            "diffusion_models/WanVideo",
            ["wan2_2-animate", "wan22animate", "wan2.2_animate"],
            required=True
        ),
        "vae_model": os.environ.get("WAN_VAE_MODEL") or find_model(
            "vae", ["wan2_1_vae", "wan_vae"], required=True
        ),
        "text_encoder": os.environ.get("WAN_TEXT_ENCODER") or find_model(
            "text_encoders", ["umt5", "umt5-xxl"], required=True
        ),
        "clip_vision": os.environ.get("WAN_CLIP_VISION") or find_model(
            "clip_vision", ["clip_vision_h"], required=True
        ),
        "yolo_model": os.environ.get("WAN_YOLO_MODEL") or find_model(
            "detection", ["yolov10"], required=True
        ),
        "vitpose_model": os.environ.get("WAN_VITPOSE_MODEL") or find_model(
            "detection", ["vitpose"], required=True
        ),
        "sam2_model": os.environ.get("WAN_SAM2_MODEL") or find_model(
            "sam2", ["sam2"], required=True
        ),
        "lora_model": os.environ.get("WAN_LORA_MODEL") or find_model(
            "loras/WanVideo/Lightx2v", ["lightx2v"], required=False
        ),
    }


# ─── Startup checks ───────────────────────────────────────────────────────────

def check_environment():
    errors = []

    if shutil.which("ffmpeg") is None:
        errors.append("ffmpeg not found in PATH")

    if not os.path.exists(WORKFLOW_PATH):
        errors.append(f"Workflow file not found: {WORKFLOW_PATH}")

    if not LOCAL_TEST:
        if not os.environ.get("SUPABASE_URL"):
            errors.append("SUPABASE_URL not set (required unless LOCAL_TEST=true)")
        if not os.environ.get("SUPABASE_SERVICE_KEY"):
            errors.append("SUPABASE_SERVICE_KEY not set (required unless LOCAL_TEST=true)")

    if errors:
        msg = "Startup check FAILED:\n" + "\n".join(f"  ✗ {e}" for e in errors)
        print(f"[handler] {msg}")
        if not LOCAL_TEST:
            raise RuntimeError(msg)

    print(f"[handler] Startup OK (LOCAL_TEST={LOCAL_TEST})")

    # Verify models exist (log warnings, don't fail — ComfyUI will fail if missing)
    try:
        models = resolve_models()
        for k, v in models.items():
            status = "✓" if v else "⚠ (missing)"
            print(f"[handler]   {status} {k}: {v}")
    except RuntimeError as e:
        print(f"[handler] Model check warning: {e}")


# ─── Workflow patching ────────────────────────────────────────────────────────

def patch_workflow(
    workflow: dict,
    user_video_path: str,
    character_image_path: str,
    quality: str,
    mode: str,
    models: dict,
    width: int = 480,
    height: int = 854,
    num_frames: int = 81,
) -> dict:
    """
    Replace all PATCH: placeholders in the workflow with real values.

    Steps map (node ID → class_type → what we patch):
      1  VHS_LoadVideo              → video path
      2  LoadImage                  → character image path
      10 WanVideoModelLoader        → diffusion model name
      11 WanVideoVAELoader          → VAE name
      12 WanVideoTextEncodeCached   → text encoder name + prompt
      13 CLIPVisionLoader           → clip vision name
      20 OnnxDetectionModelLoader   → YOLO model name
      21 OnnxPoseModelLoader        → ViTPose model name
      22 PoseAndFaceDetection       → width, height
      25 SAM2ModelLoader            → SAM2 model name
      27 WanVideoAnimateEmbeds      → width, height, num_frames, mode
      28 WanVideoSampler            → steps (quality-dependent)
    """
    import copy
    wf = copy.deepcopy(workflow)

    # Remove metadata node (not a real ComfyUI node)
    wf.pop("_info", None)

    steps = 4 if quality == "fast" else 20
    positive_prompt = (
        "A realistic face-camera video. Clear facial features, natural movement. "
        "High quality, sharp details. The character speaks and moves naturally."
    )
    if mode == "animation":
        positive_prompt = (
            "Character animation, smooth motion, natural movement. "
            "High quality video, clear details."
        )

    patches = {
        "PATCH:user_video_path":     user_video_path,
        "PATCH:character_image_path": character_image_path,
        "PATCH:diffusion_model_name": models["diffusion_model"] or "",
        "PATCH:vae_model_name":       models["vae_model"] or "",
        "PATCH:text_encoder_name":    models["text_encoder"] or "",
        "PATCH:clip_vision_name":     models["clip_vision"] or "",
        "PATCH:yolo_model_name":      models["yolo_model"] or "",
        "PATCH:vitpose_model_name":   models["vitpose_model"] or "",
        "PATCH:sam2_model_name":      models["sam2_model"] or "",
        "PATCH:positive_prompt":      positive_prompt,
        "PATCH:width":                width,
        "PATCH:height":               height,
        "PATCH:num_frames":           num_frames,
        "PATCH:steps":                steps,
    }

    def apply_patches(obj):
        if isinstance(obj, str) and obj in patches:
            return patches[obj]
        if isinstance(obj, dict):
            return {k: apply_patches(v) for k, v in obj.items()}
        if isinstance(obj, list):
            return [apply_patches(v) for v in obj]
        return obj

    wf = apply_patches(wf)

    # If no LoRA model found, remove the LoRA nodes (they are optional)
    if not models.get("lora_model"):
        for node_id in list(wf.keys()):
            if wf[node_id].get("class_type") in ("WanVideoLoraSelectMulti", "WanVideoSetLoRAs"):
                del wf[node_id]

    # Update mode in WanVideoAnimateEmbeds
    for node in wf.values():
        if node.get("class_type") == "WanVideoAnimateEmbeds":
            node["inputs"]["mode"] = mode

    return wf


def get_video_info(video_path: str) -> tuple[int, int, int]:
    """Return (width, height, num_frames) from a video file using ffprobe."""
    try:
        result = subprocess.run(
            ["ffprobe", "-v", "quiet", "-print_format", "json",
             "-show_streams", video_path],
            capture_output=True, text=True, timeout=30
        )
        data = json.loads(result.stdout)
        for stream in data.get("streams", []):
            if stream.get("codec_type") == "video":
                w = int(stream.get("width", 480))
                h = int(stream.get("height", 854))
                # Snap to multiples of 16 (required by Wan VAE)
                w = (w // 16) * 16
                h = (h // 16) * 16
                # Cap at 854 height for VRAM safety
                if h > 854:
                    scale = 854 / h
                    h = 854
                    w = int(w * scale // 16) * 16
                r_str = stream.get("r_frame_rate", "24/1")
                num, den = r_str.split("/")
                fps = float(num) / float(den)
                duration = float(stream.get("duration", "5"))
                num_frames = min(int(fps * duration), 161)  # Wan max is 161 frames
                num_frames = max(num_frames, 17)            # Wan min is 17 frames
                print(f"[handler] Video info: {w}x{h} @ {fps:.1f}fps → {num_frames} frames")
                return w, h, num_frames
    except Exception as e:
        print(f"[handler] ffprobe failed ({e}) — using defaults 480x854x81")
    return 480, 854, 81


# ─── ComfyUI API ──────────────────────────────────────────────────────────────

def download_file(url: str, dest: str, label: str = "file") -> None:
    print(f"[handler] Downloading {label}: {url}")
    req = urllib.request.Request(
        url, headers={"User-Agent": "WanWorker/1.0 (ComfyUI)"}
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            with open(dest, "wb") as f:
                shutil.copyfileobj(resp, f)
        size_mb = os.path.getsize(dest) / 1024 / 1024
        print(f"[handler] Downloaded {label}: {size_mb:.1f}MB → {dest}")
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"HTTP {e.code} downloading {label}: {url}") from e
    except Exception as e:
        raise RuntimeError(f"Failed to download {label}: {e}") from e


def submit_prompt(workflow: dict, client_id: str) -> str:
    payload = json.dumps({"prompt": workflow, "client_id": client_id}).encode()
    req = urllib.request.Request(
        f"{COMFYUI_HOST}/prompt", data=payload,
        headers={"Content-Type": "application/json"}, method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(
            f"ComfyUI rejected workflow (HTTP {e.code}):\n{body}\n"
            f"Check that all required custom nodes are installed."
        )
    except urllib.error.URLError as e:
        raise RuntimeError(
            f"Cannot reach ComfyUI at {COMFYUI_HOST}: {e.reason}\n"
            "Is ComfyUI running? Check start.sh logs."
        )

    prompt_id = result.get("prompt_id")
    if not prompt_id:
        node_errors = result.get("node_errors", {})
        if node_errors:
            missing = [
                f"  Node {nid} ({nd.get('class_type','?')}): {nd.get('errors', [])}"
                for nid, nd in node_errors.items()
            ]
            raise RuntimeError(
                "ComfyUI workflow has missing/invalid nodes:\n"
                + "\n".join(missing) + "\n"
                "Ensure all custom nodes from worker/MODELS.md are installed."
            )
        raise RuntimeError(f"ComfyUI returned no prompt_id: {result}")

    print(f"[handler] ComfyUI prompt submitted: {prompt_id}")
    return prompt_id


def poll_comfyui(prompt_id: str, timeout: int = 540) -> str:
    """Poll /history until done. Returns local path of output video."""
    start = time.time()
    print(f"[handler] Polling ComfyUI for {prompt_id} (timeout={timeout}s)...")

    while time.time() - start < timeout:
        time.sleep(4)
        elapsed = int(time.time() - start)

        try:
            with urllib.request.urlopen(
                f"{COMFYUI_HOST}/history/{prompt_id}", timeout=10
            ) as resp:
                history = json.loads(resp.read())
        except Exception as e:
            print(f"[handler] [{elapsed}s] Poll error (retrying): {e}")
            continue

        if prompt_id not in history:
            print(f"[handler] [{elapsed}s] Waiting...")
            continue

        entry  = history[prompt_id]
        status = entry.get("status", {})
        status_str = status.get("status_str", "unknown")
        print(f"[handler] [{elapsed}s] ComfyUI: {status_str}")

        if status_str == "error":
            msgs = status.get("messages", [])
            raise RuntimeError(f"ComfyUI workflow error: {msgs}")

        outputs = entry.get("outputs", {})
        for node_id, node_out in outputs.items():
            for video_info in node_out.get("gifs", []):
                filename  = video_info.get("filename", "")
                subfolder = video_info.get("subfolder", "")
                if not filename:
                    continue
                video_path = os.path.join(COMFYUI_OUTPUT, subfolder, filename)
                if os.path.exists(video_path):
                    size_mb = os.path.getsize(video_path) / 1024 / 1024
                    print(f"[handler] Output video: {video_path} ({size_mb:.1f}MB)")
                    return video_path
                print(f"[handler] Listed but not on disk: {video_path}")

        if outputs:
            time.sleep(2)

    raise RuntimeError(
        f"ComfyUI did not produce output within {timeout}s.\n"
        "Common causes:\n"
        "  - Model weights missing (check MODELS.md)\n"
        "  - CUDA out of memory (need ≥16GB VRAM for Wan2.2-Animate-14B)\n"
        "  - Custom node not loaded (check ComfyUI startup logs)\n"
        "  - Invalid video resolution (must be multiples of 16)"
    )


# ─── Audio merge ──────────────────────────────────────────────────────────────

def merge_audio(generated_video: str, source_video: str, output_path: str) -> str:
    if not shutil.which("ffmpeg"):
        print("[handler] ffmpeg not found — skipping audio merge")
        return generated_video

    result = subprocess.run(
        ["ffmpeg", "-y",
         "-i", generated_video,
         "-i", source_video,
         "-map", "0:v:0",
         "-map", "1:a:0?",
         "-c:v", "copy", "-c:a", "aac", "-b:a", "128k",
         "-shortest", "-movflags", "+faststart",
         output_path],
        capture_output=True, text=True, timeout=120
    )
    if result.returncode == 0 and os.path.exists(output_path):
        print(f"[handler] Audio merged OK")
        return output_path
    print(f"[handler] Audio merge failed (non-fatal): {result.stderr[:300]}")
    return generated_video


# ─── Storage ──────────────────────────────────────────────────────────────────

def save_local(video_path: str, job_id: str) -> str:
    dest = f"/tmp/wan_output_{job_id}.mp4"
    shutil.copy2(video_path, dest)
    print(f"[handler] Saved locally: {dest}")
    return f"file://{dest}"


def upload_supabase(video_path: str, job_id: str) -> str:
    url     = os.environ["SUPABASE_URL"].rstrip("/")
    key     = os.environ["SUPABASE_SERVICE_KEY"]
    bucket  = "output-videos"
    obj     = f"runpod/{job_id}.mp4"
    endpoint = f"{url}/storage/v1/object/{bucket}/{obj}"

    with open(video_path, "rb") as f:
        data = f.read()

    req = urllib.request.Request(
        endpoint, data=data,
        headers={
            "Authorization": f"Bearer {key}",
            "apikey": key,
            "Content-Type": "video/mp4",
            "x-upsert": "true",
        },
        method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            resp.read()
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Supabase upload failed (HTTP {e.code}): {body}")

    public_url = f"{url}/storage/v1/object/public/{bucket}/{obj}"
    print(f"[handler] Uploaded: {public_url}")
    return public_url


# ─── Main handler ─────────────────────────────────────────────────────────────

def handler(job: dict) -> dict:
    t0     = time.time()
    job_id = job.get("id") or str(uuid.uuid4())
    inp    = job.get("input", {})

    print(f"\n[handler] ═══ Job {job_id} ═══")

    # Validate input
    user_video_url      = inp.get("user_video_url",      "").strip()
    character_image_url = inp.get("character_image_url", "").strip()
    quality             = inp.get("quality",             "standard")
    mode                = inp.get("mode",                "replacement")
    keep_audio          = bool(inp.get("keep_original_audio", True))

    if not user_video_url:
        return {"error": "Missing input: user_video_url"}
    if not character_image_url:
        return {"error": "Missing input: character_image_url"}
    if quality not in ("fast", "standard"):
        return {"error": f"Invalid quality: {quality!r}"}
    if mode not in ("replacement", "animation"):
        return {"error": f"Invalid mode: {mode!r}"}

    # Normalize mode for workflow
    comfyui_mode = "replace" if mode == "replacement" else "move"

    tmpdir = tempfile.mkdtemp(prefix=f"wan_{job_id}_")
    try:
        video_path = os.path.join(tmpdir, "input_video.mp4")
        image_path = os.path.join(tmpdir, "character.png")

        # Download inputs
        try:
            download_file(user_video_url,      video_path, "user video")
            download_file(character_image_url, image_path, "character image")
        except RuntimeError as e:
            return {"error": str(e)}

        # Detect video dimensions
        width, height, num_frames = get_video_info(video_path)

        # Copy inputs to ComfyUI input dir (ComfyUI needs files in its input dir)
        comfyui_input = "/comfyui/input"
        os.makedirs(comfyui_input, exist_ok=True)
        local_video_name = f"job_{job_id}_video.mp4"
        local_image_name = f"job_{job_id}_image.png"
        shutil.copy2(video_path, os.path.join(comfyui_input, local_video_name))
        shutil.copy2(image_path, os.path.join(comfyui_input, local_image_name))

        # Resolve models
        try:
            models = resolve_models()
        except RuntimeError as e:
            return {"error": f"Model resolution failed: {e}"}

        # Load and patch workflow
        try:
            with open(WORKFLOW_PATH) as f:
                workflow = json.load(f)
        except Exception as e:
            return {"error": f"Cannot load workflow: {e}"}

        workflow = patch_workflow(
            workflow,
            user_video_path=local_video_name,
            character_image_path=local_image_name,
            quality=quality,
            mode=comfyui_mode,
            models=models,
            width=width,
            height=height,
            num_frames=num_frames,
        )

        # Submit to ComfyUI
        client_id = str(uuid.uuid4())
        try:
            prompt_id = submit_prompt(workflow, client_id)
        except RuntimeError as e:
            return {"error": str(e)}

        # Wait for output
        try:
            generated_video = poll_comfyui(prompt_id, timeout=480)
        except RuntimeError as e:
            return {"error": str(e)}

        # Merge audio
        final_video = generated_video
        if keep_audio:
            merged = os.path.join(tmpdir, "output_with_audio.mp4")
            final_video = merge_audio(generated_video, video_path, merged)

        # Store output
        if LOCAL_TEST:
            output_url = save_local(final_video, job_id)
        else:
            try:
                output_url = upload_supabase(final_video, job_id)
            except RuntimeError as e:
                return {"error": str(e)}

        elapsed_ms = int((time.time() - t0) * 1000)
        print(f"[handler] ═══ Done in {elapsed_ms}ms → {output_url} ═══")
        return {"output_video_url": output_url, "execution_time_ms": elapsed_ms}

    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)
        # Clean up ComfyUI input files
        for name in [f"job_{job_id}_video.mp4", f"job_{job_id}_image.png"]:
            try:
                os.remove(os.path.join("/comfyui/input", name))
            except FileNotFoundError:
                pass


check_environment()
runpod.serverless.start({"handler": handler})
