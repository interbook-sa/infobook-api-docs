import { defineConfig } from 'vite';

export default defineConfig({
  // Rutas relativas: GitHub Pages sirve el sitio bajo /<repositorio>/.
  base: './',
  server: {
    port: 4173,
    strictPort: true
  },
  preview: {
    port: 4173,
    strictPort: true
  }
});
