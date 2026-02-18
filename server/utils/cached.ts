import { defineCachedFunction } from 'nitropack/runtime'
import { fetchParseAndEnrichCodexLlms } from './c8y'

export const useCodexContext = defineCachedFunction(async () => {
  return await fetchParseAndEnrichCodexLlms()
}, {
  maxAge: 60 * 60 * 24, // 24 hours
})
