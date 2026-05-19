import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.VITE_API_ADMIN_BASE_URL || 'http://127.0.0.1:3002';
  return {
    plugins: [vue()],
    server: {
      port: 5174,
      proxy: {
        '/__proxy_admin_api': {
          target,
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/__proxy_admin_api/, ''),
        },
      },
    },
  };
});
