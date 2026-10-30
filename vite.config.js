import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5190, strictPort: true },
  // one scene, one bundle: three.js is most of it (~210 kB gzipped)
  build: { chunkSizeWarningLimit: 900 },
});
