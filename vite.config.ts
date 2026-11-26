import { defineConfig } from 'vite';

// `base: './'` keeps every asset path relative, so the build works at
// https://<user>.github.io/<repo>/ without knowing the repo name.
export default defineConfig({
  base: './',
  // A build stamp, so browsers never run a stale sim.wasm.
  define: { __BUILD__: JSON.stringify(String(Date.now())) },
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 800,
    rollupOptions: { input: { main: 'index.html', elements: 'elements.html' } },
  },
});
