import { defineConfig } from 'vite';

// Игра публикуется как подраздел GitHub Pages, поэтому все пути идут с префиксом.
export default defineConfig({
  base: '/diplodok-kladoiskatel/',
  server: { host: true },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 2000,
  },
});
