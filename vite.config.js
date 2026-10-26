import { defineConfig } from 'vite';

// Relative base so the build works from any sub-path (GitHub Pages, YunoHost, a USB stick…).
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
  },
  server: {
    proxy: {
      // Hevy API without CORS headaches in dev: /hevy/v1/... → https://api.hevyapp.com/v1/...
      '/hevy': {
        target: 'https://api.hevyapp.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/hevy/, ''),
      },
    },
  },
});
