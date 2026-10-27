import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
  },
  build: {
    /* Modern syntax only: the app targets current evergreen browsers, so
       shipped code skips downlevel helpers and stays smaller. */
    target: 'es2022',
    cssTarget: 'chrome111',
    reportCompressedSize: false,
    rollupOptions: {
      output: {
        /* React and the router change far less often than app code, so they
           get their own long-cached chunks. Route chunks stay small. */
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('react-router') || id.includes('@remix-run')) return 'router';
          if (/node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'react';
          return undefined;
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: false,
  },
});
