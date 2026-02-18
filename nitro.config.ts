import { defineNitroConfig } from "nitropack/config"
// https://nitro.build/config
export default defineNitroConfig({
  compatibilityDate: "latest",
  srcDir: "server",
  imports: false,
  storage: {
    cache: {
      driver: "cloudflare-kv-binding",
      binding: "CACHE",
    }
  },
  cloudflare: {
    deployConfig: true,
    wrangler: {
      kv_namespaces: [
        {
          binding: "CACHE",
          id: "4c5baf90254446f08fe2f88c15a00a76"
        }
      ]
    }
  }
});
