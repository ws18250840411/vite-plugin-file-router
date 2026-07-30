# vite-plugin-file-router

[![npm](https://img.shields.io/npm/v/vite-plugin-file-router)](https://www.npmjs.com/package/vite-plugin-file-router)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Convention-based file routing for Vite. Scans `pages/`, generates a reviewable, committable, hand-editable `routes.ts`, and safely updates it through three-way AST merging on file changes.

Supports **React Router 7** and **Vue Router 5**. Compatible with Node.js >=18, Vite 8.1+.

[中文文档](./README.md) · [API Reference](./docs/API.md) · [Migration Guide](./docs/MIGRATION.md)

**Try online:** [StackBlitz React Demo](https://stackblitz.com/github/user/vite-plugin-file-router/tree/master/demo/react) · [StackBlitz Vue Demo](https://stackblitz.com/github/user/vite-plugin-file-router/tree/master/demo/vue)

> Run locally: `cd demo/react && npm i && npm run dev`

## Features

- **Dual framework** — React Router 7 (`RouteObject[]`) + Vue Router 5 (`RouteRecordRaw[]`)
- **Three-way merge** — Manual edits preserved; generated updates and hand edits coexist
- **Type-safe routing** — `RoutePaths`, `RouteParams`, `buildPath`, `matchRoute`, `typedRedirect`
- **Virtual routes** — Programmatic routes that bypass filesystem scanning
- **Auto code splitting** — Layouts sync + pages lazy, per-file overridable
- **Modal routes** — `+filename` convention, separate export
- **Parallel routes** — `@slot` directories for named slot rendering
- **i18n routing** — Auto-generated locale-prefixed paths and types
- **SSR manifest** — Route-level JSON manifest with prefetch hints
- **Route diagnostics** — Duplicate routes, missing exports, conflicting configs caught at build time
- **Route inspector** — Terminal route tree visualization for development
- **Sitemap generation** — Standard `sitemap.xml` from route tree
- **Search params inference** — Page-declared schemas → compile-time query param validation
- **Route guard types** — `meta.guards` → typed guard unions
- **HMR** — Module hot update only when route configuration changes

---

## Quick Start

### 1. Install

```bash
# React
npm i -D vite-plugin-file-router
npm i react-router-dom

# Vue
npm i -D vite-plugin-file-router
npm i vue-router
```

### 2. Configure Vite

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fileRouter from 'vite-plugin-file-router'

export default defineConfig({
  plugins: [
    react(),
    fileRouter({ framework: 'react' }),
  ],
})
```

<details>
<summary>Vue configuration</summary>

```ts
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import fileRouter from 'vite-plugin-file-router'

export default defineConfig({
  plugins: [
    vue(),
    fileRouter({ framework: 'vue' }),
  ],
})
```

</details>

### 3. Create a page

```tsx
// src/pages/index.tsx
export default function Home() {
  return <h1>Home</h1>
}
```

### 4. Mount the router

```tsx
// React
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import routes from './routes'

<RouterProvider router={createBrowserRouter(routes)} />
```

<details>
<summary>Vue mounting</summary>

```ts
import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'
import routes from './routes'

createApp(App)
  .use(createRouter({ history: createWebHistory(), routes }))
  .mount('#app')
```

</details>

The route file is generated on first `vite dev`. Committing `routes.ts` to version control is recommended.

---

## File Conventions

| File | Route Path | Purpose |
|------|------------|---------|
| `pages/index.tsx` | `/` | Directory index |
| `pages/about.tsx` | `/about` | Static route |
| `pages/user/[id].tsx` | `/user/:id` | Dynamic parameter |
| `pages/blog/[[id]].tsx` | `/blog/:id?` | Optional parameter |
| `pages/docs/[...slug].tsx` | `/docs/*` | Catch-all |
| `pages/docs/[[...slug]].tsx` | `/docs/*?` | Optional catch-all |
| `pages/(auth)/login.tsx` | `/login` | Route group (directory omitted from URL) |
| `pages/_layout.tsx` | — | Directory layout component |
| `pages/not-found.tsx` | `*` | 404 page |
| `pages/loading.tsx` | — | Layout loading state |
| `pages/error.tsx` | — | Layout error boundary |
| `pages/report.sync.tsx` | `/report` | Force static import |
| `pages/report.lazy.tsx` | `/report` | Force dynamic import |
| `pages/+login.tsx` | — | Modal route |
| `pages/@sidebar/` | — | Parallel route slot |

Vue uses the same conventions with `.vue` extension.

---

## Page Module Exports

### React Router

Pages must have a default component export. The following named exports are recognized:

```tsx
export const meta = { title: 'Users', auth: { role: 'admin' } }
export const searchParams = { page: 'number', q: 'string' }
export async function loader() { /* ... */ }
export async function action() { /* ... */ }
export const middleware = []
export function ErrorBoundary() { return <div>Error</div> }
export function shouldRevalidate() { return false }

export default function Users() { return <div>Users</div> }
```

> `meta` generates static `handle`. Exporting both `meta` and runtime `handle` is rejected as a conflict.

### Vue Router

JSON / JSON5 / YAML `<route>` custom blocks are supported:

```vue
<route lang="yaml">
path: account/:id
name: account
props: true
meta:
  requiresAuth: true
</route>
```

Supported fields: `path`, `name`, `alias`, `props`, `meta`. Works on layouts too.

---

## Type-Safe Routing

Enable `typedRoutes: true` to generate a compile-time type system:

```ts
// routes.ts (auto-generated)
export type RoutePaths = '/' | '/about' | '/user/:id'
export type DynamicRoutePaths = '/user/:id'
export type StaticRoutePaths = '/' | '/about'

export interface RouteParams {
  '/': Record<string, never>
  '/about': Record<string, never>
  '/user/:id': { id: string }
}

export function buildPath<P extends DynamicRoutePaths>(path: P, params: RouteParams[P]): string
export function buildPath<P extends StaticRoutePaths>(path: P): string
```

### Usage

```tsx
import { buildPath, matchRoute, type RoutePaths, type RouteParams } from './routes'
import { useParams } from 'react-router-dom'

// Compile-time path validation
<Link to={'/about' satisfies RoutePaths}>About</Link>  // ✅
<Link to={'/typo'  satisfies RoutePaths}>Typo</Link>  // ❌ compile error

// Type-safe path building
buildPath('/user/:id', { id: '42' })  // ✅ => "/user/42"
buildPath('/user/:id', {})            // ❌ missing required param id
buildPath('/about')                   // ✅ static route, no params needed

// With useParams
const params = useParams() as RouteParams['/user/:id']
params.id  // string ✅

// Active route matching
matchRoute('/user/42', '/user/:id')  // true
```

### Generated Type Exports

When `typedRoutes` is enabled, the following are generated based on route tree content:

| Export | Condition | Purpose |
|--------|-----------|---------|
| `SearchParams` | Pages export `searchParams` | Query parameter types |
| `LoaderRoutes` / `ActionRoutes` | Pages export `loader`/`action` | Data route identification |
| `MiddlewareRoutes` | Pages export `middleware` | Middleware route union |
| `RouteGuards` / `GuardedRoutes` | meta contains `guards` array | Guard type mapping |
| `typedRedirect()` | Any routes exist | Type-safe redirect helper |
| `matchRoute()` | Any routes exist | URL pattern matching |
| `routeAncestors` | Any routes exist | Breadcrumb ancestor chains |
| `ROUTES` | Any routes exist | Path constants (IDE completion) |
| `TypedParams<P>` | Dynamic routes exist | Param type utility |
| `Locale` / `locales` | i18n configured | Internationalization types |
| `ModalPaths` | Modal routes exist | Modal path union |
| `SlotNames` | Parallel routes exist | Slot name union |

> TS output only; catch-all routes excluded from `RoutePaths`. Updated automatically on page add/remove.

---

## Three-Way AST Merge

The generated `routes.ts` is a first-class configuration file, not a read-only artifact. The plugin uses RouteId markers and baseline/current/fresh three-way AST merging:

- **Additions/removals** — Controlled by `pages/` directory structure
- **Manual edits** — Modified fields, added fields, custom imports, and comments are all preserved
- **Untouched fields** — Receive fresh generated values
- **Safety** — Invalid syntax is never overwritten; duplicate `@file-route` markers or import conflicts abort the write

The trailing `@vite-file-router-manifest` comment stores merge baseline fingerprints. Keep it intact. Corruption triggers a safe fallback to baseline-less merging.

---

## Configuration Reference

```ts
fileRouter({
  framework: 'react',
  pagesDir: 'src/pages',
  outFile: 'src/routes.ts',
  importMode: 'lazy',
  baseRoute: '/app',
  exclude: ['**/_components/**', '**/*.test.*'],
  regenDebounceMs: 50,
  typedRoutes: true,
  autoCodeSplitting: 'layout',
  ssrManifest: true,
  virtualRoutes: [
    { path: '/admin', component: 'src/admin/Dashboard.tsx', meta: { requiresAuth: true } },
  ],
  i18n: { locales: ['en', 'zh'], defaultLocale: 'en', strategy: 'never' },
  transformRoutes(root) { return root },
})
```

| Option | Default | Description |
|--------|---------|-------------|
| `framework` | `'react'` | Target framework: `'react'` or `'vue'` |
| `pagesDir` | `'src/pages'` | Pages directory (relative to project root) |
| `outFile` | `'src/routes.ts'` | Output path; `.ts`, `.js`, or `.mjs` |
| `extensions` | per framework | Page file extensions to scan |
| `importMode` | `'lazy'` | Default import mode: `'lazy'` or `'sync'` |
| `baseRoute` | `''` | Route prefix (e.g. `/app`) |
| `exclude` | `[]` | Glob patterns relative to `pagesDir` |
| `transformRoutes` | — | Hook to adjust route tree before codegen |
| `regenDebounceMs` | `50` | File watcher debounce (ms) |
| `logDiagnostics` | `true` | Log diagnostics to console |
| `failOnRouteError` | `true` | Block write on diagnostic errors |
| `typedRoutes` | `false` | Generate full type-safe routing system |
| `autoCodeSplitting` | `false` | `'layout'`: layouts sync + pages lazy |
| `virtualRoutes` | `[]` | Programmatic virtual route definitions |
| `ssrManifest` | `false` | Generate `routes.manifest.json` |
| `i18n` | — | i18n config: `{ locales, defaultLocale, strategy? }` |

> `.cjs` is not a valid output format. CommonJS Vite config files remain supported.

---

## Advanced Features

### Virtual Routes

```ts
virtualRoutes: [
  { path: '/admin', component: 'src/admin/Dashboard.tsx', meta: { requiresAuth: true } },
  {
    path: '/legacy',
    component: 'src/legacy/Layout.tsx',
    children: [
      { path: '/legacy/old-page', component: 'src/legacy/OldPage.tsx' },
    ],
  },
]
```

Merged with filesystem routes. Participates in type generation and three-way merge.

### Modal Routes

`+` prefixed files are exported separately from the main route array:

```
pages/+login.tsx     → modalRoutes: [{ path: "/login", ... }]
pages/user/+edit.tsx → modalRoutes: [{ path: "/edit", ... }]
```

### Auto Code Splitting

| Value | Behavior |
|-------|----------|
| `false` | Respect `importMode` setting |
| `'layout'` | Layouts sync + pages lazy (**recommended**) |
| `true` / `'route'` | All routes lazy-loaded |

Per-file `.sync` / `.lazy` suffixes always take highest precedence.

### Parallel Routes

`@slotname` directories create named slots, generating a `slots` object and `SlotNames` type.

### i18n Routing

```ts
i18n: { locales: ['en', 'zh', 'ja'], defaultLocale: 'en', strategy: 'never' }
```

- `'never'`: Default locale has no prefix, others do (e.g. `/zh/about`)
- `'always'`: All locales get prefix (e.g. `/en/about`)

### SSR Manifest

Enable `ssrManifest: true` to output `routes.manifest.json`:

```json
{
  "generatedAt": "2026-07-30T02:30:00.000Z",
  "framework": "react",
  "routes": [
    { "path": "/", "component": "index.tsx" },
    { "path": "/user/:id", "component": "user/[id].tsx", "hasLoader": true, "prefetch": "intent" }
  ]
}
```

Declare prefetch strategy via `meta.prefetch`: `"intent"` | `"viewport"` | `"none"`.

### Sitemap Generation

```ts
import { generateSitemap, scanPages, resolveOptions } from 'vite-plugin-file-router'

const resolved = resolveOptions(process.cwd(), { framework: 'react' })
const tree = scanPages(resolved)
const xml = generateSitemap(tree, {
  baseUrl: 'https://example.com',
  changefreq: 'weekly',
  priority: 0.8,
  exclude: ['/admin'],
})
```

### Route Inspector

```ts
import { inspectRoutes, scanPages, resolveOptions } from 'vite-plugin-file-router'

const tree = scanPages(resolveOptions(process.cwd(), { framework: 'react' }))
console.log(inspectRoutes(tree, { colors: true }))
```

---

## Reliability & Performance

- **AST analysis** — Babel AST parsing for module exports, token fingerprints for change tracking
- **Vue SFC parsing** — Official `@vue/compiler-sfc` for `<route>` blocks
- **Atomic writes** — Parse failures or diagnostic errors never overwrite existing config
- **Syntax validation** — Merged output is re-parsed before write; failures preserve the previous file
- **Incremental caching** — stat + AST cache; unchanged files are not re-parsed
- **Route-level HMR** — Only triggers module hot update when route configuration changes

### Benchmark

Darwin arm64 / Node 24 (`npm run bench`):

| Framework | Routes | Cold | No-op | 1% edit merge |
|-----------|-------:|-----:|------:|--------------:|
| React | 1,000 | 162 ms | 8 ms | 192 ms |
| React | 10,000 | 1.15 s | 72 ms | 1.38 s |
| Vue | 1,000 | 136 ms | 8 ms | 105 ms |
| Vue | 10,000 | 994 ms | 71 ms | 753 ms |

No-op reruns complete in ~8ms (1K routes). Cold generation for 10K routes takes ~1s.

---

## Quality Gates

| Dimension | Coverage |
|-----------|----------|
| Unit tests | 317 tests, 90%+ line / 80%+ branch coverage |
| E2E tests | 19 tests, React + Vue + hot-update merge verification |
| CI | GitHub Actions on 3 platforms + E2E + performance benchmark |
| Build artifact | ESM 55KB / CJS 56KB, tarball < 55KB |
| Type checking | Generated code directly `satisfies RouteObject[] / RouteRecordRaw[]` |

```bash
npm run verify         # Unit tests + build + type check + E2E + pack check
npm run bench          # Performance benchmark
npm run test:coverage  # Coverage report
```

---

## License

MIT
