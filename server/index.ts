import { createApp, createRouter, toWebHandler } from 'h3'
import indexRoute from './routes/index'
import mcpRoute from './routes/mcp'
import { CodexMcpAgent } from './utils/mcp/agent'

const app = createApp()
const router = createRouter()
app.use(router)

router.get('/', indexRoute)
router.use('/mcp', mcpRoute)

const handler = toWebHandler(app)

export { CodexMcpAgent }

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return handler(request, {
      cloudflare: { env, ctx },
    })
  },
}
