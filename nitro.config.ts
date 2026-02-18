import { wasm } from '@rollup/plugin-wasm';
import { defineNitroConfig } from "nitropack/config"
// https://nitro.build/config
export default defineNitroConfig({
  compatibilityDate: "latest",
  srcDir: "server",
  preset: "cloudflare-module",
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
      ],
      compatibility_flags: [
        "nodejs_compat"
      ]
    }
  }
});
