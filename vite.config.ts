import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages serves this project from https://<user>.github.io/scripture-typing/
const base = '/scripture-typing/'

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Scripture Typer',
        short_name: 'Scripture Typer',
        description: 'Learn the scriptures and improve your typing by typing them.',
        theme_color: '#1f3a5f',
        background_color: '#f4ecd8',
        display: 'standalone',
        scope: base,
        start_url: base,
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'pwa-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // App shell + the library index are precached. Book files are large,
        // so they are cached the first time each one is opened.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}', 'texts/index.json'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.pathname.startsWith(`${base}texts/`) && url.pathname.endsWith('.json'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'scripture-texts',
              expiration: { maxEntries: 500 },
            },
          },
        ],
      },
    }),
  ],
})
