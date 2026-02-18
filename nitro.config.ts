import { wasm } from '@rollup/plugin-wasm';
import { defineNitroConfig } from "nitropack/config"
// https://nitro.build/config
export default defineNitroConfig({
  compatibilityDate: "2026-01-01",
  srcDir: "server",
  preset: "cloudflare_module",
  imports: false,
  rollupConfig: {
    plugins: [wasm()]
  },
  storage: {
    cache: {
      driver: "cloudflare-kv-binding",
      binding: "CACHE",
    }
  },
  cloudflare: {
    deployConfig: true,
    nodeCompat: true,
    wrangler: {
      name: "c8y-codex-mcp",
      kv_namespaces: [
        {
          binding: "CACHE",
          id: "4c5baf90254446f08fe2f88c15a00a76"
        }
      ]
    }
  }
});
