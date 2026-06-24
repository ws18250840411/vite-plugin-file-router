export { default } from './plugin'
export type {
  FileRouterOptions,
  Framework,
  RouteDiagnostic,
  RouteMeta,
  RouteNode,
} from './types'
export { scanPages, resolveOptions, runGeneration, generateRouteFiles } from './generate'
export { collectRouteDiagnostics, collectUrlPaths, scanDir } from './core/scanner'
export { generateReactRoutes, generateVueRoutes } from './emit/codegen'
