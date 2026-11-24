import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: true,
    port: 5173,
    fs: { allow: ['..'] }, // ../shared/rules.js
    proxy: {
      '/socket.io': { target: 'http://localhost:3001', ws: true },
      '/api': 'http://localhost:3001'
    }
  },
  build: { target: 'es2020' }
});
