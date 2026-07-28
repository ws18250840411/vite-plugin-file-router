/**
 * React Router route-module export names detected at scan time.
 *
 * Shared by the scanner, code generator, and route-module reader so that
 * adding a new export (e.g. when React Router gains a new convention) only
 * requires updating this single source of truth.
 *
 * @see https://reactrouter.com/start/framework/route-module
 */
export const ROUTE_MODULE_EXPORT_NAMES = [
  'loader',
  'action',
  'ErrorBoundary',
  'HydrateFallback',
  'shouldRevalidate',
  'handle',
  'middleware',
] as const
