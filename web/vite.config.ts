import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig(({ mode }) => ({
  plugins: [vue()],
  define: { __PET_INTERNAL_DEBUG__: JSON.stringify(mode === 'internal-debug' || process.env.KGC_RELEASE_CHANNEL === 'internal-debug') },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8321',
      '/ws': { target: 'ws://localhost:8321', ws: true },
    },
  },
}));
