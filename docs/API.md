# API Reference

Complete reference for all public exports of `vite-plugin-file-router`.

## Default Export

### `fileRouter(options?)`

Vite plugin factory function. Returns a Vite plugin instance.

```ts
import fileRouter from 'vite-plugin-file-router'

export default defineConfig({
  plugins: [fileRouter({ framework: 'react' })],
})
```

**Parameters:**
- `options` — [`FileRouterOptions`](#filerouteroptions) (optional)

**Returns:** Vite `Plugin` object

---

## Functions

### `resolveOptions(root, options?)`

Resolves user options into a fully normalized `ResolvedOptions` object. Validates configuration and throws `TypeError` for invalid setups.

```ts
import { resolveOptions } from 'vite-plugin-file-router'

const resolved = resolveOptions(process.cwd(), { framework: 'react', typedRoutes: true })
```

**Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `root` | `string` | Absolute path to the project root |
| `options` | `FileRouterOptions` | Plugin options (optional) |

**Returns:** [`ResolvedOptions`](#resolvedoptions)

**Throws:**
- `TypeError` if `outFile` is inside `pagesDir`
- `TypeError` if `outFile` has `.cjs` extension

---

### `scanPages(resolved)`

Scans the filesystem and builds the route tree. Merges virtual routes and applies `transformRoutes` hook.

```ts
import { resolveOptions, scanPages } from 'vite-plugin-file-router'

const resolved = resolveOptions(process.cwd(), { framework: 'react' })
const tree = scanPages(resolved)
```

**Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `resolved` | `ResolvedOptions` | Output of `resolveOptions()` |

**Returns:** [`RouteNode`](#routenode) — Root of the route tree

---

### `scanDir(pagesDir, baseRoute, options)`

Low-level filesystem scanner. Used internally by `scanPages`. Prefer `scanPages` for most use cases.

```ts
import { scanDir } from 'vite-plugin-file-router'

const tree = scanDir('/abs/path/to/pages', '', {
  extensions: ['tsx', 'ts'],
  exclude: ['**/_components/**'],
  baseRoute: '',
})
```

**Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `pagesDir` | `string` | Absolute path to pages directory |
| `baseRoute` | `string` | Route prefix |
| `options.extensions` | `string[]` | File extensions to scan |
| `options.exclude` | `string[]` | Glob patterns to exclude |
| `options.baseRoute` | `string` | Route prefix for URL paths |

**Returns:** [`RouteNode`](#routenode)

---

### `generateRouteFiles(resolved, rootNode)`

Generates route file content from a route tree. Does not write to disk.

```ts
import { resolveOptions, scanPages, generateRouteFiles } from 'vite-plugin-file-router'

const resolved = resolveOptions(process.cwd(), { framework: 'react' })
const tree = scanPages(resolved)
const { routesContent } = generateRouteFiles(resolved, tree)
```

**Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `resolved` | `ResolvedOptions` | Resolved options |
| `rootNode` | `RouteNode` | Route tree root |

**Returns:** `{ routesContent: string }` — Generated source code

---

### `generateReactRoutes(root, ctx)`

Low-level React route code generator. Use `generateRouteFiles` for most cases.

```ts
import { generateReactRoutes } from 'vite-plugin-file-router'
```

**Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `root` | `RouteNode` | Route tree |
| `ctx` | `GenerateContext` | Generation context |

**Returns:** `string` — Complete React routes file content

---

### `generateVueRoutes(root, ctx)`

Low-level Vue route code generator. Use `generateRouteFiles` for most cases.

```ts
import { generateVueRoutes } from 'vite-plugin-file-router'
```

**Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `root` | `RouteNode` | Route tree |
| `ctx` | `GenerateContext` | Generation context |

**Returns:** `string` — Complete Vue routes file content

---

### `runGeneration(resolved)`

Full generation pipeline: scan → generate → merge → write. Used internally by the Vite plugin.

```ts
import { resolveOptions, runGeneration } from 'vite-plugin-file-router'

const resolved = resolveOptions(process.cwd(), { framework: 'react' })
const result = runGeneration(resolved)
// result.changed — whether the output file was modified
```

**Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `resolved` | `ResolvedOptions` | Resolved options |

**Returns:** `{ changed: boolean; diagnostics: RouteDiagnostic[] }`

---

### `collectRouteDiagnostics(root)`

Analyzes a route tree and returns all diagnostic messages (duplicate routes, missing exports, etc.).

```ts
import { scanPages, resolveOptions, collectRouteDiagnostics } from 'vite-plugin-file-router'

const tree = scanPages(resolveOptions(process.cwd(), { framework: 'react' }))
const diagnostics = collectRouteDiagnostics(tree)
```

**Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `root` | `RouteNode` | Route tree to analyze |

**Returns:** [`RouteDiagnostic[]`](#routediagnostic)

---

### `collectUrlPaths(root)`

Extracts all URL paths from a route tree. Excludes catch-all and not-found routes.

```ts
import { scanPages, resolveOptions, collectUrlPaths } from 'vite-plugin-file-router'

const tree = scanPages(resolveOptions(process.cwd(), { framework: 'react' }))
const paths = collectUrlPaths(tree) // ['/', '/about', '/user/:id', ...]
```

**Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `root` | `RouteNode` | Route tree |

**Returns:** `string[]` — Array of URL path patterns

---

### `inspectRoutes(root, options?)`

Generates a human-readable tree visualization of the route structure.

```ts
import { scanPages, resolveOptions, inspectRoutes } from 'vite-plugin-file-router'

const tree = scanPages(resolveOptions(process.cwd(), { framework: 'react' }))
console.log(inspectRoutes(tree, { colors: true }))
```

**Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `root` | `RouteNode` | Route tree |
| `options.colors` | `boolean` | Enable ANSI colors (default: `false`) |

**Returns:** `string` — Formatted route tree

---

### `generateSitemap(root, options)`

Generates a standard `sitemap.xml` string from the route tree. Dynamic routes (containing `:param`) are automatically excluded.

```ts
import { scanPages, resolveOptions, generateSitemap } from 'vite-plugin-file-router'

const tree = scanPages(resolveOptions(process.cwd(), { framework: 'react' }))
const xml = generateSitemap(tree, {
  baseUrl: 'https://example.com',
  changefreq: 'weekly',
  priority: 0.8,
  exclude: ['/admin'],
  lastmod: '2026-07-30',
})
```

**Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `root` | `RouteNode` | Route tree |
| `options` | [`SitemapOptions`](#sitemapoptions) | Sitemap configuration |

**Returns:** `string` — Valid XML sitemap content

---

## Types

### `FileRouterOptions`

Main plugin configuration interface. All fields are optional.

```ts
interface FileRouterOptions {
  pagesDir?: string                          // default: 'src/pages'
  outFile?: string                           // default: 'src/routes.ts'
  outputLanguage?: 'ts' | 'js'              // inferred from outFile
  framework?: 'react' | 'vue'              // default: 'react'
  extensions?: string[]                     // default: per framework
  exclude?: string[]                        // default: []
  baseRoute?: string                        // default: ''
  importMode?: 'lazy' | 'sync'             // default: 'lazy'
  transformRoutes?: (root: RouteNode) => RouteNode | void
  regenDebounceMs?: number                  // default: 50
  logDiagnostics?: boolean                  // default: true
  failOnRouteError?: boolean                // default: true
  typedRoutes?: boolean                     // default: false
  virtualRoutes?: VirtualRoute[]            // default: []
  autoCodeSplitting?: boolean | 'route' | 'layout'  // default: false
  ssrManifest?: boolean                     // default: false
  i18n?: {
    locales: string[]
    defaultLocale: string
    strategy?: 'never' | 'always'           // default: 'never'
  }
}
```

---

### `ResolvedOptions`

Fully resolved configuration (output of `resolveOptions`). All fields are required.

```ts
interface ResolvedOptions {
  pagesDir: string
  outFile: string
  framework: 'react' | 'vue'
  extensions: string[]
  exclude: string[]
  baseRoute: string
  importMode: 'lazy' | 'sync'
  outputLanguage: 'ts' | 'js'
  transformRoutes?: (root: RouteNode) => RouteNode | void
  logDiagnostics: boolean
  failOnRouteError: boolean
  typedRoutes: boolean
  virtualRoutes: VirtualRoute[]
  autoCodeSplitting: boolean | 'route' | 'layout'
  ssrManifest: boolean
  i18n?: { locales: string[]; defaultLocale: string; strategy?: 'never' | 'always' }
}
```

---

### `RouteNode`

Represents a single node in the route tree.

```ts
interface RouteNode {
  routeId: string              // Stable identity for merge tracking
  path: string | null          // Segment relative to parent
  urlPath: string              // Full URL path
  filePath: string | null      // Absolute path to page component
  layoutPath: string | null    // Absolute path to _layout file
  loadingPath: string | null   // Absolute path to loading module
  errorPath: string | null     // Absolute path to error module
  hasDefaultExport: boolean    // Whether file has export default
  meta?: RouteMeta             // Static metadata from export const meta
  moduleExports?: RouteModuleExports  // Detected named exports
  searchParams?: Record<string, string>  // Search params schema
  routeBlock?: VueRouteBlockOverride    // Vue <route> block data
  isNotFound?: boolean         // True for 404/not-found pages
  isGroup: boolean             // Route group (parenthesized directory)
  groupName: string | null     // Group directory name
  importOverride?: 'sync' | 'lazy'     // Per-file import mode
  children: RouteNode[]        // Nested routes
  modals?: ModalRouteNode[]    // Modal routes in this directory
  slots?: Record<string, RouteNode>    // Parallel route slots
}
```

---

### `VirtualRoute`

Definition for a programmatic route that bypasses filesystem scanning.

```ts
interface VirtualRoute {
  path: string                  // URL path (e.g. "/admin")
  component: string             // File path (absolute or relative to project root)
  children?: VirtualRoute[]     // Nested children
  meta?: RouteMeta              // Route metadata
  importMode?: 'lazy' | 'sync' // Import mode override
}
```

---

### `ModalRouteNode`

Represents a modal route (from `+filename` convention).

```ts
interface ModalRouteNode {
  routeId: string
  path: string                  // Modal path (e.g. "/login")
  filePath: string              // Absolute file path
  hasDefaultExport: boolean
  meta?: RouteMeta
  importOverride?: 'sync' | 'lazy'
}
```

---

### `RouteDiagnostic`

A diagnostic message from route analysis.

```ts
interface RouteDiagnostic {
  level: 'warning' | 'error'
  code:
    | 'duplicate-route'
    | 'optional-route-overlap'
    | 'scan-error'
    | 'missing-default-export'
    | 'invalid-route-block'
    | 'conflicting-route-export'
  message: string
  routes: string[]              // Affected route IDs
}
```

---

### `RouteMeta`

Static metadata extracted from page modules.

```ts
type RouteMeta = Record<string, unknown>
```

---

### `SitemapOptions`

Configuration for sitemap generation.

```ts
interface SitemapOptions {
  baseUrl: string               // Required: site base URL
  changefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never'
  priority?: number             // 0.0 - 1.0 (default: 0.8)
  exclude?: string[]            // Paths to exclude
  lastmod?: string              // ISO date string
}
```

---

### `InspectOptions`

Options for route tree inspection.

```ts
interface InspectOptions {
  colors?: boolean              // Enable ANSI colors (default: false)
}
```

---

### `Framework`

```ts
type Framework = 'react' | 'vue'
```

---

## Generated Route File Exports

When `typedRoutes: true`, the generated `routes.ts` exports these (depending on route tree content):

| Export | Type | Always |
|--------|------|:------:|
| `routes` | `RouteObject[]` / `RouteRecordRaw[]` | ✅ |
| `default` | Same as `routes` | ✅ |
| `RoutePaths` | Union type | ✅ |
| `RouteParams` | Interface | ✅ |
| `DynamicRoutePaths` | Union type | ✅ |
| `StaticRoutePaths` | Union type | ✅ |
| `buildPath()` | Function | When dynamic routes exist |
| `matchRoute()` | Function | When routes exist |
| `typedRedirect()` | Function | When routes exist |
| `routeAncestors` | Constant | When routes exist |
| `ROUTES` | Constant object | When routes exist |
| `TypedParams<P>` | Utility type | When dynamic routes exist |
| `SearchParams` | Interface | When pages export `searchParams` |
| `LoaderRoutes` | Union type | When pages export `loader` |
| `ActionRoutes` | Union type | When pages export `action` |
| `MiddlewareRoutes` | Union type | When pages export `middleware` |
| `RouteGuards` | Interface | When meta has `guards` |
| `GuardedRoutes` | Union type | When meta has `guards` |
| `RedirectTarget` | Type | When routes exist |
| `modalRoutes` | Array | When `+` prefixed files exist |
| `ModalPaths` | Union type | When `+` prefixed files exist |
| `slots` | Object | When `@slot` directories exist |
| `SlotNames` | Union type | When `@slot` directories exist |
| `Locale` | Union type | When `i18n` configured |
| `defaultLocale` | Constant | When `i18n` configured |
| `locales` | Array constant | When `i18n` configured |
