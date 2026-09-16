import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Load the same PORT value used by the Express server so the dev proxy
  // cannot drift out of sync when PORT changes in .env.
  const env = loadEnv(mode, process.cwd(), '');
  const backendPort = env.PORT || '3001';

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: `http://127.0.0.1:${backendPort}`,
          changeOrigin: true,
        },
      },
    },
    build: { outDir: 'dist' },
  };
});
