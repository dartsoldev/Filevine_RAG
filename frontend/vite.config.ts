import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In development the app calls /api/* and Vite forwards it to the backend.
// This keeps the browser on one origin, so local work needs no CORS changes.
const BACKEND = 'https://filevine-rag.onrender.com'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: BACKEND,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
