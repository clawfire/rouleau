import { defineConfig } from 'vite';

// Relative base so the build works from any sub-path (GitHub Pages, YunoHost, a USB stick…).
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
  },
  server: {
    proxy: {
      // Google Calendar iCal feeds (secret address), same reason: /gcal/calendar/ical/... → https://calendar.google.com/calendar/ical/...
      '/gcal': {
        target: 'https://calendar.google.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/gcal/, ''),
      },
      // Hevy API without CORS headaches in dev: /hevy/v1/... → https://api.hevyapp.com/v1/...
      '/hevy': {
        target: 'https://api.hevyapp.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/hevy/, ''),
      },
    },
  },
});
