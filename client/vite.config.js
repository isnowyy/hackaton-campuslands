import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// En desarrollo, Vite reenvía /api al servidor Express (puerto 3000), así la
// interfaz y la API comparten origen y no hace falta habilitar CORS.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': `http://127.0.0.1:${process.env.API_PORT || 3000}` },
  },
});
