import { defineConfig } from 'vite';

// Relative base so the build works from any sub-path (GitHub Pages, YunoHost, a USB stick…).
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
  },
});
