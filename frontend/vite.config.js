import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')
  const apiTarget = env.VITE_API_TARGET || 'http://127.0.0.1:8000'
  const proxy = {
    '/api': {
      target: apiTarget,
      changeOrigin: true,
      ws: true,
    },
    '/health': {
      target: apiTarget,
      changeOrigin: true,
    },
  }

  return {
    plugins: [react(), tailwindcss()],
    server: {
      host: '0.0.0.0',
      port: 5173,
      proxy,
    },
    preview: {
      host: '0.0.0.0',
      port: 4173,
      proxy,
    },
    build: {
      target: 'es2022',
      cssCodeSplit: true,
      minify: 'esbuild',
      sourcemap: false,
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          manualChunks(id) {
            const normalizedId = id.replace(/\\/g, '/')
            if (!normalizedId.includes('/node_modules/')) {
              return undefined
            }
            if (
              normalizedId.includes('/react-router') ||
              normalizedId.includes('/@remix-run/')
            ) {
              return 'router-vendor'
            }
            if (
              normalizedId.includes('/react-dom/') ||
              normalizedId.includes('/react/') ||
              normalizedId.includes('/scheduler/')
            ) {
              return 'react-vendor'
            }
            if (normalizedId.includes('/lucide-react/')) {
              return 'icons-vendor'
            }
            if (normalizedId.includes('/axios/')) {
              return 'http-vendor'
            }
            if (normalizedId.includes('/@supabase/')) {
              return 'supabase-vendor'
            }
            return undefined
          },
        },
      },
    },
  }
})
