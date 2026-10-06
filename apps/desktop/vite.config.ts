import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const host = process.env['TAURI_DEV_HOST'];

// Tauri expects a fixed port and must not have its output cleared.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host ?? false,
    ...(host ? { hmr: { protocol: 'ws', host, port: 1421 } } : {}),
    watch: { ignored: ['**/src-tauri/**'] },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  build: {
    target: process.env['TAURI_ENV_PLATFORM'] === 'windows' ? 'chrome105' : 'safari13',
    minify: process.env['TAURI_ENV_DEBUG'] ? false : 'oxc',
    sourcemap: Boolean(process.env['TAURI_ENV_DEBUG']),
  },
});
