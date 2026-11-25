import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';

function getApiPort() {
  if (process.env.PORT !== undefined) return process.env.PORT;

  // Match the Nest ConfigModule's environment file order.
  for (const filename of ['.env.local', '.env']) {
    const envPath = path.resolve(import.meta.dirname, '../server', filename);
    if (!existsSync(envPath)) continue;

    const { PORT } = parseEnv(readFileSync(envPath, 'utf8'));
    if (PORT !== undefined) return PORT;
  }

  return '3001';
}

export default defineConfig(({ command }) => ({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: `http://localhost:${command === 'serve' ? getApiPort() : '3001'}`,
        changeOrigin: true,
      },
    },
  },
}));
