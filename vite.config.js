import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Versión de la app = fecha y hora UTC del build (AAAAMMDDHHmm). Viaja en cada
// llamada a Supabase (x-app-version) y la base rechaza escrituras de versiones
// anteriores a sistema_parametros.app_version_minima (version_app_minima.sql).
const APP_VERSION = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12)

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },
  build: {
    rollupOptions: {
      output: {
        // Aísla recharts en su propio chunk: no infla el bundle inicial
        // (importa para la app móvil de fuerza de ventas).
        manualChunks: {
          recharts: ['recharts'],
        },
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      // 'prompt': la versión nueva espera a que el usuario recargue desde el aviso
      // (AvisoNuevaVersion). Con 'autoUpdate' una pestaña abierta seguía con el
      // código viejo sin enterarse (NE-001226).
      registerType: 'prompt',
      includeAssets: ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png'],
      manifest: {
        // Marca soma ops (familia SOMA): src/components/MarcaSoma.jsx
        name: 'soma ops',
        short_name: 'soma ops',
        description: 'Del pedido al cobro, en un solo lugar.',
        theme_color: '#0F1F3D',
        background_color: '#0F1F3D',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            // Sin esquinas redondeadas: Android aplica su propia máscara
            src: 'icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // recharts es pesado; sube el límite para que el chunk se precachee igual
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        // Cachea todos los assets de la app
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Sin fallback de navegación al index.html precacheado: si esa entrada
        // faltaba en la caché (tras un despliegue), workbox la pedía a la red como
        // /index.html, Cloudflare Pages responde 308 → / y el navegador rechaza
        // una navegación redirigida: refrescar /ventas daba "no se puede acceder
        // al sitio" mientras / sí cargaba. Las navegaciones van a la red (Pages
        // sirve el index.html en cualquier ruta) y solo sin conexión usan la caché.
        navigateFallback: null,
        // Cachea las llamadas a Supabase para offline
        runtimeCaching: [
          {
            // Tipografía Inter de Google Fonts: que la marca se vea igual sin conexión
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'fuentes',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'paginas',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 30 },
            },
          },
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24, // 24 horas
              },
            },
          },
        ],
      },
    }),
  ],
})