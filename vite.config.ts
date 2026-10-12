import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { host: '0.0.0.0', proxy: { '/api': 'http://127.0.0.1:3001' } },
  build: { rollupOptions: { output: { manualChunks: {
    physics: ['@dimforge/rapier3d-compat'], three: ['three'], ui: ['react', 'react-dom'],
  } } } },
});
