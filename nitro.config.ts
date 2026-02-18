import { wasm } from '@rollup/plugin-wasm'
import { defineNitroConfig } from 'nitropack/config'
// https://nitro.build/config
export default defineNitroConfig({
  compatibilityDate: 'latest',
  srcDir: 'server',
  preset: 'cloudflare-module',
  imports: false,
  rollupConfig: {
    plugins: [wasm({
      targetEnv: 'browser',
    })],
    treeshake: true,
  },

  storage: {
    cache: {
      driver: 'cloudflare-kv-binding',
      binding: 'CACHE',
    },
  },
  alias: {
    fs: 'node:fs',
    path: 'node:path',
  },
  cloudflare: {
    deployConfig: true,
    nodeCompat: true,
    wrangler: {
      name: 'c8y-codex-mcp',
      kv_namespaces: [
        {
          binding: 'CACHE',
        },
      ],
    },
  },
})
