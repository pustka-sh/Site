import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Clean URLs (pustka.sh/docs/relay). scripts/postbuild.mjs writes an HTML file
// for every route, so any static host serves them without rewrite rules.
export default defineConfig({
  base: '/',
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (/node_modules\/(react|react-dom|scheduler|react-router|react-router-dom|cookie|set-cookie-parser)\//.test(id)) return 'react';
          if (/node_modules\/(motion|framer-motion|motion-dom|motion-utils)\//.test(id)) return 'motion';
        },
      },
    },
  },
});
