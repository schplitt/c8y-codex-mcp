import { createApp, createRouter, toWebHandler } from 'h3'
import indexRoute from './routes/index'
import mcpRoute from './routes/mcp'

const app = createApp()
const router = createRouter()
app.use(router)

router.get('/', indexRoute)
router.use('/mcp', mcpRoute)

const handler = toWebHandler(app)

export default {
  async fetch(request: any, env: any, ctx: any) {
    return handler(request, {
      cloudflare: { env, ctx },
    })
  },
}
