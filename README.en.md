# vite-plugin-file-router

File-based routing for Vite with React Router and Vue Router. It scans `pages/` and maintains a physical, reviewable, hand-editable `routes.ts` through safe three-way AST merging.

Targets Node.js **24.11+**, Vite 8.1+, React Router 7.18+, and Vue Router 5.2+. Use `.nvmrc` (`nvm use`) or fnm/volta to align with Node 24.11.0 locally.

## Quick Start

```bash
npm i -D vite-plugin-file-router
npm i react-router-dom # use vue-router for Vue
```

```ts
// vite.config.ts - React
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import fileRouter from 'vite-plugin-file-router'

export default defineConfig({
  plugins: [react(), fileRouter({ framework: 'react' })],
})
```

```ts
// vite.config.ts - Vue
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import fileRouter from 'vite-plugin-file-router'

export default defineConfig({
  plugins: [vue(), fileRouter({ framework: 'vue' })],
})
```

Create `src/pages/index.tsx` or `src/pages/index.vue`, start Vite once, then mount the generated routes:

```tsx
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import routes from './routes'

<RouterProvider router={createBrowserRouter(routes)} />
```

```ts
import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'
import routes from './routes'

createApp(App)
  .use(createRouter({ history: createWebHistory(), routes }))
  .mount('#app')
```

The default input is `src/pages`; the default output is `src/routes.ts`. Vue `<route>` blocks are removed automatically before `@vitejs/plugin-vue` compiles the SFC.

## Conventions

| File | Route |
|------|-------|
| `index.tsx` | `/` |
| `user/[id].tsx` | `/user/:id` |
| `blog/[[id]].tsx` | `/blog/:id?` |
| `docs/[...slug].tsx` | `/docs/*` |
| `(auth)/login.tsx` | `/login` |
| `_layout.tsx` | directory layout |
| `not-found.tsx` | catch-all |
| `loading.tsx` / `error.tsx` | layout fallbacks |
| `report.sync.tsx` | forced static import |

Vue uses the same rules with `.vue` files.

React pages can export `meta`, `loader`, `action`, `middleware`, `ErrorBoundary`, `HydrateFallback`, and `shouldRevalidate`. A default component export is required. `meta` becomes static `handle`; defining both `meta` and runtime `handle` is rejected.

Vue JSON/JSON5/YAML `<route>` blocks support `path`, `name`, `alias`, `props`, and `meta`, including on layouts.

## Editable Generated Routes

`routes.ts` is a supported customization surface:

- Filesystem additions, removals, and nesting follow `pages/`.
- Edited or deleted fields are preserved.
- Custom imports, declarations, comments, and routes are preserved.
- Untouched fields receive fresh generated values.
- Invalid syntax is never overwritten.
- Duplicate `@file-route` markers or merged import/declaration conflicts abort the write.

Keep the trailing `@vite-file-router-manifest` comment. It stores generator fingerprints only and has no runtime behavior.
If it is damaged or from an unsupported version, merging safely falls back without a baseline; existing fields remain, but previous generated-field deletions cannot be inferred.

## Options

```ts
fileRouter({
  framework: 'react',
  pagesDir: 'src/pages',
  outFile: 'src/routes.ts',
  importMode: 'lazy',
  baseRoute: '/app',
  exclude: ['**/_components/**'],
  transformRoutes(root) { return root },
  typedRoutes: true,
})
```

Generated client routes are ESM. Use `.ts`, `.js`, or `.mjs`; `.cjs` is rejected. CommonJS Vite configs remain supported.

`typedRoutes: true` emits a `RoutePaths` union type in the routes file for compile-time path validation. TS output only.

## Reliability and Performance

- Babel AST analysis and token fingerprints.
- Official Vue SFC parsing.
- Atomic writes and overwrite protection.
- Final merged-output syntax validation and rollback on replacement failure.
- Incremental file/AST caching and route-aware HMR.
- Direct type validation against `RouteObject[]` / `RouteRecordRaw[]`.

Representative Darwin arm64 / Node 24.11+ benchmark (`npm run bench`):

| Framework | Routes | Cold | No-op | 1% edit/churn merge |
|-----------|-------:|-----:|------:|--------------------:|
| React | 1,000 | 156 ms | 9 ms | 213 ms |
| React | 10,000 | 1.30 s | 78 ms | 1.39 s |
| Vue | 1,000 | 118 ms | 8 ms | 108 ms |
| Vue | 10,000 | 1.01 s | 76 ms | 1.05 s |

## Quality gates

- **CI**: GitHub Actions on ubuntu / windows / macOS with **Node 24.11** (unit tests, build, router compat, pack check); separate browser E2E job on all three OSes; `npm run bench` on ubuntu. (`.github/workflows/` is **GitHub-only**.)
- **Gitee Go**: `.workflow/ci.yml` runs validate only (unit tests, build, compat, `pack:check`). Run **E2E and bench** locally with `npm run verify` / `npm run bench`, or rely on GitHub Actions.
- **Unit tests (173)**: real filesystem portability, AST property-based merge fuzz, cross-process output locks, adversarial merge, and industrial regressions.
- **E2E (19)**: React / Vue demos plus merge hot-update; `demo/vue-rootless` covers rootless layouts and route groups in the browser.
- **Release**: `v*` tags run `npm run verify`, verify tag/version alignment, then publish with npm provenance.

Run the complete release gate with `npm run verify`. Use `npm run bench` locally for performance regression checks.

## License

MIT
