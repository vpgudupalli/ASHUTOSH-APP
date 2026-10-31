import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const API = 'http://localhost:3000';

export default defineConfig({
  base: '/app/', // the public website lives at /, the app at /app
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    fs: { allow: ['..'] },
    proxy: {
      '/api': API,
      '/socket.io': { target: API, ws: true },
    },
  },
});
