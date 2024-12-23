import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const backend = process.env.VITE_BACKEND_URL || 'http://localhost:3001';

// The UI talks to the backend through relative URLs; in dev the proxy forwards them.
const proxy = {
  '/api': backend,
  '/socket.io': { target: backend, ws: true },
};

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy },
  preview: { port: 4173, proxy },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
  },
});
