import { defineConfig } from 'vite';

// `base: './'` keeps every asset path relative, so the build works at
// https://<user>.github.io/<repo>/ without knowing the repo name.
export default defineConfig({
  base: './',
  worker: { format: 'es' },
  build: { target: 'es2022', chunkSizeWarningLimit: 800 },
});
