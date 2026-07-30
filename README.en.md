# vite-plugin-file-router

[![npm](https://img.shields.io/npm/v/vite-plugin-file-router)](https://www.npmjs.com/package/vite-plugin-file-router)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Scan `pages/` directory to auto-generate `routes.ts` for React Router 7 or Vue Router. Manual edits are safely preserved via three-way AST merge.

[中文文档](./README.md) · [Try Online](https://stackblitz.com/github/ws18250840411/vite-plugin-file-router/tree/master/demo/react?file=vite.config.ts) · [API Reference](./docs/API.md)

## Install

```bash
npm i -D vite-plugin-file-router
```

## Usage

```ts
// vite.config.ts
import fileRouter from 'vite-plugin-file-router'

export default defineConfig({
  plugins: [fileRouter()],
})
```

Run `vite dev` — routes are generated at `src/routes.ts`. Import and use directly:

```tsx
import routes from './routes'
<RouterProvider router={createBrowserRouter(routes)} />
```

That's it. Add or remove files under `src/pages/`, routes update automatically.

---

## File Conventions

| File | Route | Description |
|------|-------|-------------|
| `pages/index.tsx` | `/` | Index page |
| `pages/about.tsx` | `/about` | Static route |
| `pages/user/[id].tsx` | `/user/:id` | Dynamic param |
| `pages/[...slug].tsx` | `/*` | Catch-all |
| `pages/(auth)/login.tsx` | `/login` | Route group (dir not in URL) |
| `pages/_layout.tsx` | — | Layout component |
| `pages/not-found.tsx` | `*` | 404 page |
| `pages/report.sync.tsx` | `/report` | Force sync import |

<details>
<summary>More conventions</summary>

| File | Description |
|------|-------------|
| `pages/[[id]].tsx` | Optional param `/blog/:id?` |
| `pages/[[...slug]].tsx` | Optional catch-all |
| `pages/loading.tsx` | Layout loading state |
| `pages/error.tsx` | Error boundary |
| `pages/+login.tsx` | Modal route |
| `pages/@sidebar/` | Parallel route slot |

</details>

---

## Configuration

```ts
fileRouter({
  framework: 'react',       // 'react' | 'vue'
  pagesDir: 'src/pages',    // pages directory
  outFile: 'src/routes.ts', // output file
  importMode: 'lazy',       // 'lazy' | 'sync'
  typedRoutes: true,        // generate type-safe routes
})
```

<details>
<summary>All options</summary>

| Option | Default | Description |
|--------|---------|-------------|
| `framework` | `'react'` | `'react'` or `'vue'` |
| `pagesDir` | `'src/pages'` | Pages directory |
| `outFile` | `'src/routes.ts'` | Output path |
| `extensions` | per framework | Page file extensions |
| `importMode` | `'lazy'` | Default import mode |
| `baseRoute` | `''` | Route prefix |
| `exclude` | `[]` | Glob exclusions |
| `typedRoutes` | `false` | Type-safe routes |
| `autoCodeSplitting` | `false` | `'layout'` = layouts sync + pages lazy |
| `virtualRoutes` | `[]` | Programmatic virtual routes |
| `ssrManifest` | `false` | Generate route-manifest.json |
| `i18n` | — | `{ locales, defaultLocale, strategy? }` |
| `transformRoutes` | — | Route tree transform hook |
| `regenDebounceMs` | `50` | Debounce ms |

</details>

---

## Type-Safe Routes

Enable `typedRoutes: true` to auto-generate:

```ts
import { buildPath, type RoutePaths, type RouteParams } from './routes'

// Path validation
<Link to={'/about' satisfies RoutePaths}>About</Link>  // ✅
<Link to={'/typo'  satisfies RoutePaths}>Typo</Link>   // ❌ compile error

// Safe path building
buildPath('/user/:id', { id: '42' })  // => "/user/42"

// With useParams
const { id } = useParams() as RouteParams['/user/:id']
```

<details>
<summary>Full generated types</summary>

| Generated | Condition | Purpose |
|-----------|-----------|---------|
| `RoutePaths` / `RouteParams` | Always | Path and param types |
| `buildPath()` | Always | Type-safe path building |
| `matchRoute()` | Always | URL matching |
| `typedRedirect()` | Always | Type-safe redirects |
| `ROUTES` | Always | Path constants (IDE completion) |
| `routeAncestors` | Always | Breadcrumb ancestors |
| `SearchParams` | exports `searchParams` | Query param types |
| `LoaderRoutes` / `ActionRoutes` | exports loader/action | Data route markers |
| `MiddlewareRoutes` | exports middleware | Middleware routes |
| `RouteGuards` | meta has guards | Guard types |

</details>

---

## Three-Way Merge

The generated `routes.ts` can be manually edited:

- Add/remove routes — controlled by file system
- Manual edits — modified fields, custom imports, comments **all preserved**
- Conflict-safe — refuses to overwrite on syntax errors or marker corruption

---

## Advanced Features

<details>
<summary>Virtual Routes</summary>

```ts
virtualRoutes: [
  { path: '/admin', component: 'src/admin/Dashboard.tsx', meta: { requiresAuth: true } },
]
```

</details>

<details>
<summary>i18n Routing</summary>

```ts
i18n: { locales: ['en', 'zh'], defaultLocale: 'en', strategy: 'never' }
// /about → English, /zh/about → Chinese
```

</details>

<details>
<summary>SSR Manifest</summary>

Enable `ssrManifest: true` to output `routes.manifest.json` with component paths, loader/action flags, and prefetch strategies.

</details>

<details>
<summary>Sitemap Generation</summary>

```ts
import { generateSitemap, scanPages, resolveOptions } from 'vite-plugin-file-router'
const tree = scanPages(resolveOptions(process.cwd(), { framework: 'react' }))
generateSitemap(tree, { baseUrl: 'https://example.com' })
```

</details>

<details>
<summary>Route Inspector</summary>

```ts
import { inspectRoutes, scanPages, resolveOptions } from 'vite-plugin-file-router'
console.log(inspectRoutes(scanPages(resolveOptions(process.cwd(), {})), { colors: true }))
```

</details>

---

## Vue

```ts
import vue from '@vitejs/plugin-vue'
import fileRouter from 'vite-plugin-file-router'

export default defineConfig({
  plugins: [vue(), fileRouter({ framework: 'vue' })],
})
```

Vue supports `<route lang="yaml">` custom blocks for path/name/meta. File conventions are identical to React, using `.vue` extensions.

---

## License

MIT
