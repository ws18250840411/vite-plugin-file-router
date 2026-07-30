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

/** A modal route detected from `+filename` convention. */
export interface ModalRouteNode {
  /** Stable identity. */
  routeId: string
  /** Modal path (e.g. "/login" from `+login.tsx`). */
  path: string
  /** Absolute path to the modal component file. */
  filePath: string
  /** Whether the file has a default export. */
  hasDefaultExport: boolean
  /** Static metadata. */
  meta?: RouteMeta
  /** Import mode override. */
  importOverride?: 'sync' | 'lazy'
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
  /** Declared search params schema from `export const searchParams = {...}`. */
  searchParams?: Record<string, string>
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
  /** Modal routes (`+filename`) found in this directory. */
  modals?: ModalRouteNode[]
  /** Parallel route slots (`@slotName/` directories). */
  slots?: Record<string, RouteNode>
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

/**
 * A virtual route definition that bypasses filesystem scanning.
 * Virtual routes are merged with filesystem routes during code generation.
 */
export interface VirtualRoute {
  /** URL path for this route (e.g. "/settings", "/admin/:section"). */
  path: string
  /** Absolute or relative (to project root) path to the component file. */
  component: string
  /** Optional nested children. */
  children?: VirtualRoute[]
  /** Route metadata. */
  meta?: RouteMeta
  /** Import mode override for this virtual route. */
  importMode?: 'lazy' | 'sync'
}

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
  /**
   * Virtual routes that bypass filesystem scanning.
   * These are merged with filesystem-scanned routes during generation.
   * Useful for routes that don't follow the filesystem convention.
   * @default []
   */
  virtualRoutes?: VirtualRoute[]
  /**
   * Automatic code-splitting strategy.
   * - `true` / `'route'`: every route is lazy-loaded (equivalent to `importMode: 'lazy'`)
   * - `'layout'`: layouts are sync-imported, pages are lazy (optimal for initial load)
   * - `false`: respect `importMode` setting as-is
   * @default false
   */
  autoCodeSplitting?: boolean | 'route' | 'layout'
  /**
   * Generate `route-manifest.json` alongside `routes.ts` for SSR / preloading.
   * The manifest maps each route path to its component file, enabling
   * server-side frameworks to preload or statically analyze route chunks.
   * @default false
   */
  ssrManifest?: boolean
  /**
   * i18n routing configuration.
   * When provided, generates locale-prefixed copies of all routes.
   * @example { locales: ['en', 'zh'], defaultLocale: 'en' }
   */
  i18n?: {
    /** Supported locale codes (e.g. ['en', 'zh', 'ja']). */
    locales: string[]
    /** Default locale — its routes have no prefix. */
    defaultLocale: string
    /** Prefix strategy for the default locale.
     * - `'never'`: default locale has no prefix (e.g. `/about`)
     * - `'always'`: all locales get prefix (e.g. `/en/about`)
     * @default 'never'
     */
    strategy?: 'never' | 'always'
  }
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
  /** @default false */
  autoCodeSplitting?: boolean | 'route' | 'layout'
  /** i18n configuration for locale-aware type generation. */
  i18n?: FileRouterOptions['i18n']
}
