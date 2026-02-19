import { createCachedFunction } from './cache-fn'
import { fetchParseAndEnrichCodexLlms } from './c8y'

export const useCodexContext = createCachedFunction(
  () => fetchParseAndEnrichCodexLlms(),
  {
    key: 'codexContext-cache',
    maxAge: 60 * 60 * 24, // 24 hours
  },
)
