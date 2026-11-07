import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 5173,
    // Arena serves the app through a proxy host; allow it plus local dev hosts.
    allowedHosts: ['.e2b.app', 'localhost', '.localhost'],
    // keep HMR working through the preview proxy
    hmr: { clientPort: 443, protocol: 'wss' },
  },
  preview: { host: '0.0.0.0', port: 5173, allowedHosts: ['.e2b.app', 'localhost'] },
  build: { chunkSizeWarningLimit: 1200 },
});
