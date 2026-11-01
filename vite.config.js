import { defineConfig } from 'vite';
import { VintedFetchError, fetchListing } from './src/vinted/fetch-core.js';

// Dev-only twin of netlify/functions/vinted.mjs, so `npm run dev:vite` can import Vinted listings too.
const vintedDev = {
  name: 'rouleau-vinted-dev',
  configureServer(server) {
    server.middlewares.use('/api/vinted', async (req, res) => {
      const q = new URL(req.url, 'http://localhost').searchParams;
      const send = (status, data) => {
        res.statusCode = status;
        res.setHeader('content-type', 'application/json; charset=utf-8');
        res.end(JSON.stringify(data));
      };
      try {
        send(200, await fetchListing({ id: q.get('id'), host: q.get('host') }));
      } catch (err) {
        const e = err instanceof VintedFetchError ? err : new VintedFetchError('network', 'Erreur inattendue côté serveur.');
        send(e.code === 'bad-request' ? 400 : 502, { error: { code: e.code, message: e.message } });
      }
    });
  },
};

// Relative base so the build works from any sub-path (GitHub Pages, YunoHost, a USB stick…).
export default defineConfig({
  base: './',
  plugins: [vintedDev],
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
