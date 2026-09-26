import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  build: { chunkSizeWarningLimit: 1600 }, // Phaser は約1.2MB（バトル画面を開いたときだけ読む）
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      useCredentials: true, // Cloudflare Access の裏でも manifest を読めるようにする
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'まなびサバイバー',
        short_name: 'まなびサバイバー',
        lang: 'ja',
        display: 'fullscreen',
        orientation: 'any',
        background_color: '#fff7e6',
        theme_color: '#fff7e6',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,json,webp}'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        runtimeCaching: [{
          urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/,
          handler: 'CacheFirst',
          options: { cacheName: 'google-fonts', expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 } },
        }],
      },
    }),
  ],
});
