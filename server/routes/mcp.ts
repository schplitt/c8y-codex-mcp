import { eventHandler, toWebRequest } from 'h3'
import { respondWithSdkMcp } from '../utils/mcp/other'

export default eventHandler((event) => {
  const request = toWebRequest(event)

  return respondWithSdkMcp(request)
})
