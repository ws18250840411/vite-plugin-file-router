export { default } from './plugin'
export type {
  FileRouterOptions,
  Framework,
  ModalRouteNode,
  RouteDiagnostic,
  RouteMeta,
  RouteNode,
  VirtualRoute,
} from './types'
export { scanPages, resolveOptions, runGeneration, generateRouteFiles } from './generate'
export { collectRouteDiagnostics, collectUrlPaths, scanDir } from './core/scanner'
export { generateReactRoutes, generateVueRoutes } from './emit/codegen'
export { inspectRoutes } from './inspect'
export { generateSitemap } from './sitemap'
export type { SitemapOptions } from './sitemap'
