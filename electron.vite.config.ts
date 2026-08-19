import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    build: {
      externalizeDeps: {
        exclude: [
          '@kowork/client-settings',
          '@kowork/contracts',
          '@kowork/core',
          '@kowork/design-system'
        ]
      },
      rollupOptions: {
        input: {
          index: resolve('src/main/index.ts'),
          core: resolve('src/core/index.ts')
        },
        output: {
          entryFileNames: '[name].js'
        }
      }
    }
  },
  preload: {
    build: {
      externalizeDeps: false
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react(), tailwindcss()]
  }
})
