import type { RouteMeta } from '../types'

/**
 * Parsed `<route>` custom block from Vue SFC files.
 * @see https://uvr.esm.is/guide/extending-routes#route-blocks
 * @see https://github.com/hannoeru/vite-plugin-pages#sfc-route-configuration-blocks
 */
export interface VueRouteBlock {
  path?: string
  name?: string
  alias?: string | string[]
  meta?: RouteMeta
  props?: boolean | Record<string, unknown>
}

const ROUTE_BLOCK_RE = /<route(?:\s[^>]*)?>([\s\S]*?)<\/route>/i

export function readVueRouteBlock(source: string): VueRouteBlock | undefined {
  const match = ROUTE_BLOCK_RE.exec(source)
  if (!match?.[1]) return undefined

  const body = match[1].trim()
  if (!body) return undefined

  try {
    const parsed = JSON.parse(body) as VueRouteBlock
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined
    return parsed
  } catch {
    return undefined
  }
}

export function mergeRouteMeta(
  fromExport?: RouteMeta,
  fromBlock?: RouteMeta,
): RouteMeta | undefined {
  if (!fromExport && !fromBlock) return undefined
  return { ...fromExport, ...fromBlock }
}
