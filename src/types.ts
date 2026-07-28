// ─── Public types ─────────────────────────────────────────────────────────────

export type OutputLanguage = 'ts' | 'js'

/** Static route metadata read from page modules / Vue `<route>` blocks. */
export type RouteMeta = Record<string, unknown>

/** React Router 7 route module exports detected at scan time. */
export interface RouteModuleExports {
  loader?: boolean
  action?: boolean
  ErrorBoundary?: boolean
  HydrateFallback?: boolean
  shouldRevalidate?: boolean
  handle?: boolean
  middleware?: boolean
}

/** Overrides from Vue `<route>` custom block. */
export interface VueRouteBlockOverride {
  path?: string
  name?: string
  alias?: string | string[]
  meta?: RouteMeta
  props?: boolean | Record<string, unknown>
}

export interface RouteNode {
  /** Stable generator identity relative to `pagesDir`. */
  routeId: string
  /** Route segment relative to parent (`null` for layout roots / groups). */
  path: string | null
  /** Full URL path used for diagnostics and typed routes. */
  urlPath: string
  /** Absolute path to the page component file, if any. */
  filePath: string | null
  /** Absolute path to `_layout` in this directory, if present. */
  layoutPath: string | null
  /** Absolute path to `loading` module in this directory. */
  loadingPath: string | null
  /** Absolute path to `error` module in this directory. */
  errorPath: string | null
  /** Whether the page/layout file has `export default`. */
  hasDefaultExport: boolean
  /** Whether the directory loading module has a default export. */
  loadingHasDefaultExport?: boolean
  /** Whether the directory error module has a default export. */
  errorHasDefaultExport?: boolean
  /** Source read/parse failure captured during scanning. */
  scanError?: string
  /** Static metadata extracted from the page file. */
  meta?: RouteMeta
  /** Page-level React Router module exports. */
  moduleExports?: RouteModuleExports
  /** `_layout` module exports in this directory. */
  layoutModuleExports?: RouteModuleExports
  /** Per-file import override for the directory layout. */
  layoutImportOverride?: 'sync' | 'lazy'
  /** Vue `<route>` block overrides. */
  routeBlock?: VueRouteBlockOverride
  /** True for 404 / not-found catch-all pages. */
  isNotFound?: boolean
  /** Route group — URL segment omitted. Convention: `(groupName)/`. */
  isGroup: boolean
  groupName: string | null
  /**
   * Per-file import override from `.sync` / `.lazy` suffix.
   * @see https://github.com/hannoeru/vite-plugin-pages — importMode per route
   */
  importOverride?: 'sync' | 'lazy'
  children: RouteNode[]
}

export interface RouteDiagnostic {
  level: 'warning' | 'error'
  code:
    | 'duplicate-route'
    | 'optional-route-overlap'
    | 'scan-error'
    | 'missing-default-export'
    | 'invalid-route-block'
    | 'conflicting-route-export'
  message: string
  routes: string[]
}

export type Framework = 'react' | 'vue'

export interface FileRouterOptions {
  /**
   * Pages directory relative to Vite project root.
   * @default 'src/pages'
   */
  pagesDir?: string
  /**
   * Generated routes file path relative to project root.
   * Use `.ts` (default), `.js`, or `.mjs`; generated client route modules are ESM.
   * @default 'src/routes.ts'
   */
  outFile?: string
  /**
   * Force generated routes syntax. Defaults to inferring from `outFile` extension.
   */
  outputLanguage?: OutputLanguage
  /**
   * Target router framework — controls emitted route array shape.
   * @default 'react'
   */
  framework?: Framework
  /**
   * File extensions to treat as pages (without leading dot).
   * Defaults to `['tsx','ts','jsx','js']` for react, `['vue']` for vue.
   */
  extensions?: string[]
  /**
   * Glob-like exclude patterns relative to pagesDir.
   * Supports `**` and `*` wildcards.
   * @default []
   */
  exclude?: string[]
  /**
   * Base path prefix prepended to every route URL.
   * @default ''
   */
  baseRoute?: string
  /**
   * Default component import strategy.
   * - `lazy`: `lazy: () => import(...)` (React) / dynamic `import()` (Vue)
   * - `sync`: static `import` at top of routes file
   * @default 'lazy'
   */
  importMode?: 'lazy' | 'sync'
  /**
   * Post-scan hook to adjust the route tree before code generation.
   * Return a new root node or mutate in place.
   */
  transformRoutes?: (root: RouteNode) => RouteNode | void
  /**
   * Debounce window (ms) for coalescing rapid `pages/` file changes before regen.
   * @default 50
   */
  regenDebounceMs?: number
  /**
   * Log route diagnostics to the console.
   * @default true
   */
  logDiagnostics?: boolean
  /** Stop generation when route diagnostics contain errors. @default true */
  failOnRouteError?: boolean
  /**
   * Generate a `RoutePaths` union type in the routes file for type-safe
   * navigation (e.g. `<Link to={'/about' satisfies RoutePaths}>`).
   * Only applies to TypeScript output (`.ts` outFile); ignored for `.js`/`.mjs`.
   * @default false
   */
  typedRoutes?: boolean
}

export interface GenerateContext {
  root: string
  pagesDir: string
  outFile: string
  framework: Framework
  importMode: 'lazy' | 'sync'
  baseRoute: string
  /** @default 'ts' */
  outputLanguage?: OutputLanguage
  /** Absolute path to pages/loading.* when present at the scan root. */
  globalLoadingPath?: string | null
  /** Absolute path to pages/error.* when present at the scan root. */
  globalErrorPath?: string | null
  /** Whether to emit a `RoutePaths` union type. @default false */
  typedRoutes?: boolean
}
