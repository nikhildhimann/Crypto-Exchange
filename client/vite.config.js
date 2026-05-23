import { defineConfig, loadEnv } from 'vite'
import path from 'path'
import { fileURLToPath } from 'url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '')
  const devPort = 3000
  const hmrHost = env.VITE_HMR_HOST || ''
  const hmrClientPort = Number(env.VITE_HMR_CLIENT_PORT || devPort)
  const hmrProtocol = env.VITE_HMR_PROTOCOL || 'ws'

  return {
    plugins: [
      react(),
      tailwindcss(),
    ],
    build: {
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) {
              return undefined
            }

            if (id.includes('/@mui/') || id.includes('/@emotion/')) {
              return 'vendor-mui'
            }

            if (id.includes('/@radix-ui/')) {
              return 'vendor-radix'
            }

            if (id.includes('/react') || id.includes('/scheduler/')) {
              return 'vendor-react'
            }

            if (
              id.includes('/@reduxjs/') ||
              id.includes('/react-redux/') ||
              id.includes('/redux-persist/') ||
              id.includes('/redux-thunk/') ||
              id.includes('/immer/')
            ) {
              return 'vendor-state'
            }

            if (
              id.includes('/recharts/') ||
              id.includes('/d3-') ||
              id.includes('/victory-vendor/')
            ) {
              return 'vendor-charts'
            }

            return undefined
          },
        },
      },
    },
    esbuild: {
      loader: "jsx",
      include: /src\/.*\.js$/,
      exclude: [],
    },
    optimizeDeps: {
      esbuildOptions: {
        loader: {
          '.js': 'jsx',
        },
      },
    },
    server: {
      port: devPort,
      host: '0.0.0.0',
      strictPort: true,
      hmr: hmrHost
        ? {
            host: hmrHost,
            clientPort:
              Number.isFinite(hmrClientPort) && hmrClientPort > 0
                ? hmrClientPort
                : devPort,
            protocol: hmrProtocol,
          }
        : undefined,
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    assetsInclude: ['**/*.svg', '**/*.csv'],
  }
})
