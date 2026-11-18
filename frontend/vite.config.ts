import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'

// Cada build lleva su id; la PWA lo compara con /version.json y se recarga sola.
const BUILD_ID = process.env.BUILD_ID || Date.now().toString(36)

/** PWA: version.json en el build e icono de Apple incrustado (iOS pide el
 *  apple-touch-icon tarde y acaba poniendo una letra si no está en el HTML). */
function pwa(): Plugin {
  return {
    name: 'fm-pwa',
    transformIndexHtml(html) {
      const png = fs.readFileSync(path.resolve(__dirname, 'public/apple-touch-icon-180x180.png')).toString('base64')
      return html.replace('__APPLE_TOUCH_ICON__', `data:image/png;base64,${png}`)
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ buildId: BUILD_ID }) })
    },
  }
}

export default defineConfig({
  plugins: [react(), pwa()],
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
