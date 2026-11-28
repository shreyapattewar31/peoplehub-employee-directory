import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.VITE_API_PROXY_TARGET || 'http://localhost:4000';

  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: true,
      allowedHosts: [
        'customs-cricket-unaligned.ngrok-free.dev',
        'cgplk-103-97-104-46.free.pinggy.net',
        'smhft-103-97-104-46.run.pinggy-free.link',
      ],
      proxy: {
        '/api': {
          target,
          changeOrigin: true,
        },
      },
    },
  };
});
