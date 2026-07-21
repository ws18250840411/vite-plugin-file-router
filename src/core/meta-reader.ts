import type { RouteMeta } from '../types'
import { collectRuntimeExports, parseModule, readStaticMetaFromAst } from './module-ast'

/**
 * Extract static `export const meta = { ... }` or `export const meta = pageMeta({ ... })`.
 * Only primitive object fields are supported — sufficient for title / auth / anim.
 */
export function readStaticMeta(source: string): RouteMeta | undefined {
  return readStaticMetaFromAst(parseModule(source))
}

export function hasDefaultExport(source: string): boolean {
  return collectRuntimeExports(parseModule(source)).has('default')
}
