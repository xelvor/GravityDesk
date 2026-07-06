import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import electron from 'vite-plugin-electron/simple';
import path from 'path';

export default defineConfig(() => {
  const isElectron = process.env.ELECTRON === 'true';

  return {
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    plugins: [
      vue(),
      isElectron &&
        electron({
          main: {
            entry: 'electron/main.ts',
            vite: {
              build: {
                rollupOptions: {
                  external: ['node-pty', 'better-sqlite3', 'sql.js', 'sqlite3', 'electron', '@napi-rs/keyring'],
                },
              },
            },
          },
          preload: {
            input: 'electron/preload.ts',
          },
          renderer: {},
        }),
    ].filter(Boolean),
    server: {
      port: 5173,
    },
  };
});
