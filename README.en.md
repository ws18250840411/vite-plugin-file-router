# vite-plugin-file-router

Vite plugin for React Router / Vue Router: scans `pages/` and maintains a project-local `routes.ts`. Import it in your entry and create the Router — no per-page route boilerplate.

Per-route fields (`meta`, `loader`, `handle`, …) can be edited in `routes.ts`; hand-edits are preserved on regen when `pages/` changes (RouteId merge). Config generation only — no Router injection or runtime navigation.

| Need | Choice |
|------|--------|
| Folder-driven structure, auditable editable route table | **This plugin** |
| Runtime Router injection, page transitions | [unplugin-react-router-dom](../unplugin-react-router-dom) |
| Virtual modules, no `routes.ts` on disk | [vite-plugin-pages](https://github.com/hannoeru/vite-plugin-pages) |

---

## Quick start

```bash
pnpm add -D vite-plugin-file-router
pnpm add react-router-dom   # or vue-router
```

```ts
// vite.config.ts
import fileRouter from 'vite-plugin-file-router'

export default defineConfig({
  plugins: [
    fileRouter({
      framework: 'react',
      pagesDir: 'src/pages',
      outFile: 'src/routes.ts',
    }),
  ],
})
```

```tsx
// main.tsx (React)
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import type { RouteObject } from 'react-router-dom'
import routes from './routes'

<RouterProvider router={createBrowserRouter(routes as RouteObject[])} />
```

```ts
// main.ts (Vue)
import { createRouter, createWebHistory } from 'vue-router'
import routes from './routes'

createApp(App).use(createRouter({ history: createWebHistory(), routes })).mount('#app')
```

### JavaScript projects

Use `outFile: 'src/routes.js'` (or `.mjs` / `.cjs`) for plain JS output without `export type`. Set `extensions: ['jsx', 'js']` to match page files. `require('vite-plugin-file-router')` works from `vite.config.cjs`. Demo: `pnpm demo:react-js` → [demo/react-js](./demo/react-js).

---

## File conventions

| Path | Effect |
|------|--------|
| `pages/index.tsx` | index `/` |
| `pages/about.tsx` | `/about` |
| `pages/user/[id].tsx` | `/user/:id` |
| `pages/_layout.tsx` | nested layout |
| `pages/(group)/x.tsx` | route group, no URL segment |
| `pages/not-found.tsx` | 404 catch-all |
| `pages/*.sync.tsx` | force sync import |

---

## Merge behavior

Regen aligns routes by **RouteId** (`import('./pages/...')`):

- Structure follows `pages/` scans
- Field-level hand-edits on existing pages are **preserved** (local-wins)
- Renames do not migrate edits; unparseable `routes.ts` → full regen

---

## Customization layers

1. **`pages/`** — URLs, nesting, dynamic segments  
2. **`routes.ts`** — per-route overrides (merged)  
3. **`vite.config`** — `baseRoute`, `importMode`, `transformRoutes`, `exclude`, …

---

## Router versions

React Router **6.4+** · Vue Router **4+**. Validated in `compat/` (6.4 / 7.x, 4 / 5) via `pnpm test:compat`.

---

## Migration from 1.x

2.0 removes virtual modules, animation runtime, and auto `RouterProvider` injection.

1. Add `fileRouter({ outFile: 'src/routes.ts' })` to Vite config  
2. `import routes from './routes'` and create the Router in `main`  
3. Remove virtual route imports and `vite-plugin-file-router/client` types  
4. Run dev to generate `routes.ts`

See [CHANGELOG](./CHANGELOG.md). Runtime integration → [unplugin-react-router-dom](../unplugin-react-router-dom).

---

## Demo & quality

`pnpm demo:react` (:5199) · `pnpm demo:vue` (:5200) — [demo/README.md](./demo/README.md)

~110 unit tests · router compat · Playwright e2e (merge hot-update)

Full reference (Chinese): [README.md](./README.md)

## License

MIT
