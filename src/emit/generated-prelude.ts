/** Minimal type prelude for generated routes.ts (no router package imports). */

export const REACT_TYPES = `export type RouteMeta = Record<string, string | number | boolean | undefined>

export type FileRoute = {
  path?: string
  index?: boolean
  lazy?: () => Promise<unknown>
  Component?: unknown
  loader?: unknown
  action?: unknown
  ErrorBoundary?: unknown
  shouldRevalidate?: unknown
  handle?: RouteMeta
  children?: FileRoute[]
}`

export const VUE_TYPES = `export type RouteMeta = Record<string, string | number | boolean | undefined>

export type FileRoute = {
  path?: string
  name?: string
  alias?: string | string[]
  props?: boolean | Record<string, unknown>
  meta?: RouteMeta
  component?: unknown
  children?: FileRoute[]
}`
