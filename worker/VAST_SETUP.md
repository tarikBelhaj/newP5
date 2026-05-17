# Vast.ai — Procédure complète

Prépare tout localement d'abord. Loue le GPU seulement à l'étape 3.

---

## Étape 1 — Préparer l'app localement (sans GPU)

```bash
# Vérifier que tous les fichiers sont présents
npm run preflight:vast

# Vérifier que l'app compile
npm run build
```

Résultat attendu de `preflight:vast` :
```
✓ scripts/vast-setup.sh
✓ scripts/vast-test-gpu.sh
✓ scripts/vast-stop.sh
✓ scripts/test-models.sh
✓ worker/scripts/download-models.sh
✓ worker/workflows/wan22_animate_replace_api.json
✓ worker/MODELS.md
✓ .env.local exists
✓ package.json — all vast commands present
⚠ VAST_API_KEY not set (expected — fill after renting)
```

Tout doit être vert avant de passer à l'étape 2.

---

## Étape 2 — Pousser le projet sur GitHub

```bash
git add -A
git commit -m "chore: prepare for Vast.ai GPU validation"
git push origin main
```

Le script `vast:setup` clone ce repo sur l'instance. Si tu n'as pas de remote
GitHub, le script utilise `rsync` pour copier les fichiers directement via SSH.
Les deux fonctionnent.

---

## Étape 3 — Louer l'instance Vast.ai

**Ne fais cette étape que quand les étapes 1 et 2 sont terminées.**
Le GPU coûte ~$0.35-0.60/hr — chaque minute compte.

### Via l'interface web

1. Aller sur https://cloud.vast.ai/
2. **Instances** → **+ Rent**
3. Filtres :
   - GPU : **RTX 4090** (24 GB VRAM)
   - Type : **On-demand** (pas interruptible)
   - Disk : **150 GB minimum**
4. Template : `pytorch/pytorch:2.4.1-cuda12.4-cudnn9-devel`
   (ou `runpod/pytorch:2.4.0-py3.11-cuda12.4.1-devel-ubuntu22.04`)
5. Cliquer **Rent**
6. Attendre 1-3 minutes que l'instance démarre

### Via CLI Vast.ai

```bash
pip install vastai
vastai set api-key YOUR_API_KEY

# Chercher RTX 4090 disponible
vastai search offers 'gpu_name=RTX_4090 disk_space>=100 num_gpus=1' --type on-demand

# Louer (remplacer OFFER_ID par l'id trouvé)
vastai create instance OFFER_ID \
    --image pytorch/pytorch:2.4.1-cuda12.4-cudnn9-devel \
    --disk 150
```

---

## Étape 4 — Remplir .env.local

Une fois l'instance démarrée, dans la console Vast.ai :
- Cliquer sur l'instance → **Connect**
- Copier le host SSH et le port

Remplir `.env.local` :

```env
VAST_API_KEY=votre_cle_api_vast
VAST_INSTANCE_ID=123456
VAST_SSH_HOST=ssh1234.vast.ai
VAST_SSH_PORT=12345
VAST_SSH_USER=root
VAST_WORKDIR=/workspace/motion-avatar
TEST_QUALITY=fast
```

Relancer le preflight pour vérifier :

```bash
npm run preflight:vast
# Doit maintenant afficher : ✓ VAST_API_KEY set
```

---

## Étape 5 — Setup de l'instance

```bash
npm run vast:setup
```

Ce script (en ~40 minutes, surtout le téléchargement des modèles) :

1. Vérifie SSH et GPU
2. Installe ffmpeg, git, rsync
3. Copie les fichiers du projet via rsync
4. Installe ComfyUI à `/comfyui`
5. Installe les 4 custom nodes :
   - ComfyUI-WanVideoWrapper
   - ComfyUI-WanAnimatePreprocess
   - ComfyUI-VideoHelperSuite
   - ComfyUI-segment-anything-2
6. Télécharge les 7 modèles (~22 GB) :

   | Modèle | Taille |
   |--------|--------|
   | Wan2.2-Animate-14B fp8 | ~14 GB |
   | VAE bf16 | ~1.5 GB |
   | UMT5-XXL text encoder | ~5 GB |
   | CLIP Vision H | ~600 MB |
   | YOLOv10m ONNX | ~32 MB |
   | ViTPose-L ONNX | ~200 MB |
   | SAM2 hiera large | ~900 MB |

En cas d'interruption, relancer `npm run vast:setup` — les fichiers existants
sont ignorés.

---

## Étape 6 — Lancer le test GPU

```bash
npm run vast:test-gpu
```

Ce script fait en séquence :

1. **SSH** — vérifie la connexion
2. **GPU** — `nvidia-smi`, vérifie VRAM ≥ 16 GB
3. **Modèles** — vérifie les 7 fichiers dans `/comfyui/models`
4. **ComfyUI nodes** — démarre ComfyUI, vérifie `/object_info` pour 15 nodes requis
5. **Inférence réelle** — soumet le workflow Wan2.2-Animate avec vidéo test + image test
6. **Validation** — `ffprobe` : durée > 0, codec h264, résolution présente

**Durée attendue : 5-15 minutes (quality=fast, RTX 4090)**

Sortie si succès :
```
  ✓ GPU: NVIDIA GeForce RTX 4090, 24576 MiB
  ✓ All 7 model directories present
  ✓ All 15 required nodes loaded
  ✓ Generation complete in 187s
  ✓ Duration > 0
  ✓ Codec: h264 | Resolution: 480x854

  ✅ VAST.AI GPU TEST PASSED
  Output: /tmp/vast-gpu-test/vast_output_XXXXXXXXXX.mp4
```

---

## Étape 7 — Arrêter l'instance

**Dès que le test est terminé, arrêter immédiatement.**

```bash
# Option A : Stop (données conservées, petit coût storage continue)
npm run vast:stop

# Option B : Destroy (tout supprimé, facturation arrêtée complètement)
npm run vast:stop -- --destroy
```

**Stop vs Destroy :**
- Stop : données conservées (~$0.002/GB/hr de storage). Utile si tu veux relancer.
- Destroy : tout supprimé, facturation 100% arrêtée. Recommandé si les modèles
  sont sur un volume séparé ou si tu peux les retélécharger.

---

## Éviter de repayer le téléchargement des modèles

Les modèles font 22 GB. Re-télécharger coûte ~30 minutes de GPU.

**Solution : Vast.ai Network Volume**

1. Console Vast.ai → **Storage** → **+ New Volume**
2. Nom : `wan-models`, Taille : **50 GB**
3. Région : même que ton instance prévue
4. Lors de la création de l'instance, attacher ce volume à `/comfyui/models`

Les modèles persistent entre les sessions. Tu ne les télécharges qu'une fois.

---

## Erreurs fréquentes

| Erreur | Cause | Solution |
|--------|-------|----------|
| `SSH not reachable` | Instance encore en démarrage | Attendre 2-3 min et réessayer |
| `CUDA out of memory` | VRAM insuffisant | Vérifier RTX 4090, utiliser `TEST_QUALITY=fast` |
| `node not found` | Custom node non installé | Relancer `npm run vast:setup` |
| `ComfyUI crashed` | Dépendance Python manquante | SSH + `python3 /comfyui/main.py 2>&1 \| head -30` |
| `model not found` | Download interrompu | `bash /workspace/motion-avatar/worker/scripts/download-models.sh /comfyui/models` |
| `Duration is 0` | Inférence terminée sans output | SSH + vérifier logs ComfyUI |
| SSH host change après restart | Vast.ai réassigne le port | Mettre à jour `VAST_SSH_HOST` et `VAST_SSH_PORT` dans `.env.local` |

---

## Checklist complète avant de louer

Lancer `npm run preflight:vast` et vérifier :

- [ ] Tous les scripts présents et exécutables
- [ ] `worker/workflows/wan22_animate_replace_api.json` présent
- [ ] `worker/scripts/download-models.sh` présent
- [ ] `npm run build` passe sans erreur
- [ ] `.env.local` créé (même sans les clés Vast.ai)
- [ ] Projet pushé sur GitHub (ou prêt à rsync)

Ensuite seulement → louer l'instance.
