import { maskNonCode } from './source-analysis'

/** Route module exports detected in page files (React Router 7 data APIs). */
export interface RouteModuleExports {
  loader?: boolean
  action?: boolean
  ErrorBoundary?: boolean
  shouldRevalidate?: boolean
  handle?: boolean
}

const MODULE_EXPORT_NAMES = [
  'loader',
  'action',
  'ErrorBoundary',
  'shouldRevalidate',
  'handle',
] as const

/**
 * Detect React Router route module exports via static analysis.
 * @see https://reactrouter.com/start/framework/route-module
 */
export function readRouteModuleExports(source: string): RouteModuleExports | undefined {
  const masked = maskNonCode(source)
  const exports: RouteModuleExports = {}

  for (const name of MODULE_EXPORT_NAMES) {
    const re = name === 'ErrorBoundary'
      ? /\bexport\s+(?:const|function|class|let|var)\s+ErrorBoundary\b/
      : new RegExp(`\\bexport\\s+(?:const|function|async\\s+function|let|var)\\s+${name}\\b`)
    if (re.test(masked)) {
      exports[name] = true
    }
  }

  return Object.keys(exports).length > 0 ? exports : undefined
}

/** Build lazy route return object fields for detected module exports. */
export function reactLazyReturnFields(exports: RouteModuleExports | undefined, pad: string): string[] {
  if (!exports) return []
  const lines: string[] = []
  for (const name of MODULE_EXPORT_NAMES) {
    if (exports[name]) {
      lines.push(`${pad}${name}: mod.${name},`)
    }
  }
  return lines
}
