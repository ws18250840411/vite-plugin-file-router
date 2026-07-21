import { collectRuntimeExports, parseModule } from './module-ast'
import type { RouteModuleExports } from '../types'

const MODULE_EXPORT_NAMES = [
  'loader',
  'action',
  'ErrorBoundary',
  'HydrateFallback',
  'shouldRevalidate',
  'handle',
  'middleware',
] as const

/**
 * Detect React Router route module exports via static analysis.
 * @see https://reactrouter.com/start/framework/route-module
 */
export function readRouteModuleExports(source: string): RouteModuleExports | undefined {
  const runtimeExports = collectRuntimeExports(parseModule(source))
  const exports: RouteModuleExports = {}

  for (const name of MODULE_EXPORT_NAMES) {
    if (runtimeExports.has(name)) exports[name] = true
  }

  return Object.keys(exports).length > 0 ? exports : undefined
}
