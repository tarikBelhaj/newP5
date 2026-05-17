/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['var(--font-display)', 'serif'],
        body: ['var(--font-body)', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      colors: {
        ink: {
          950: '#0A0A0F',
          900: '#0F0F1A',
          800: '#1A1A2E',
          700: '#252542',
          600: '#333358',
        },
        volt: {
          DEFAULT: '#C8FF00',
          50: '#F5FFB3',
          100: '#EEFF80',
          400: '#D4FF33',
          500: '#C8FF00',
          600: '#A3CC00',
        },
        plasma: {
          DEFAULT: '#FF3DFF',
          400: '#FF6DFF',
          500: '#FF3DFF',
          600: '#CC00CC',
        },
        ice: {
          DEFAULT: '#00F5FF',
          400: '#40F7FF',
          500: '#00F5FF',
          600: '#00C2CC',
        },
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'float': 'float 6s ease-in-out infinite',
        'scan': 'scan 2s linear infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-12px)' },
        },
        scan: {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100vh)' },
        },
        glow: {
          '0%': { boxShadow: '0 0 20px rgba(200,255,0,0.3)' },
          '100%': { boxShadow: '0 0 40px rgba(200,255,0,0.7), 0 0 80px rgba(200,255,0,0.3)' },
        },
      },
      backgroundImage: {
        'grid-volt': 'linear-gradient(rgba(200,255,0,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(200,255,0,0.05) 1px, transparent 1px)',
        'noise': "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.05'/%3E%3C/svg%3E\")",
      },
    },
  },
  plugins: [],
}
