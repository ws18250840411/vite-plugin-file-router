# Changelog

## 2.0.2 - 2026-07-21

### Refactored

- Replaced regex/lexer source inspection with Babel 8 AST analysis and Vue's official SFC compiler.
- Added stable route markers plus baseline/current/fresh AST merging. Manual field deletion, custom imports/statements/routes, comments, and exact source are preserved.
- Generated TypeScript now uses official `RouteObject[]` / `RouteRecordRaw[]` constraints instead of a local `FileRoute` approximation.
- Fixed dynamic directories, scoped nested catch-all paths, `baseRoute` with root layouts, sync export alias collisions, and nested fallback import collisions.
- Added atomic writes, parse-failure overwrite protection, missing-default and ambiguous-convention build errors, and coalesced Vite HMR regeneration; scheduled diagnostics no longer escape the timer and terminate the dev process.
- Added incremental stat/AST caching and generation signatures; component-only edits no longer rebuild or replace the page HMR module.
- Vue layout route blocks now apply to layout records, nested route-group layouts emit valid empty paths, duplicate names are diagnosed, and `<route>` blocks are stripped automatically before SFC compilation.
- Rootless Vue layouts now emit absolute top-level paths; duplicate/unknown/external `<route>` blocks and duplicate overridden paths are diagnosed before writing.
- Adversarial merge protection now rejects duplicate route markers and invalid merged bindings, validates manifest structure, and preserves computed fields and trailing comments.
- Added reproducible React/Vue benchmarks for 1,000 and 10,000 routes (`npm run bench`).
- Added cross-platform CI (ubuntu / windows / macOS × Node 24.11), browser E2E on all three OSes, and npm provenance release workflow.
- Raised minimum Node.js to **24.11+** for `@babel/parser` 8; refreshed runtime and dev dependencies (Vue 3.5.40, Vitest 4.1.10, Playwright 1.61, etc.) while keeping TypeScript 6.
- Added real filesystem portability tests, AST property-based merge fuzzing, cross-process output lock race tests, and rootless Vue Playwright E2E (`demo/vue-rootless`).
- Added `pack:check` tarball governance and `npm run verify` as the single release gate (160 unit + 19 E2E tests, no default skipped cases).
- Support targets Vite 8.1+, React Router 7.18+, and Vue Router 5.2+ APIs only; historical Router compatibility projects were removed.

## 2.0.1 - 2026-06-24

### Fixed

- **React Router 7 `HydrateFallback`**: emit static `HydrateFallback` / `ErrorBoundary` on route objects (with top-level imports from `pages/loading.*` and `pages/error.*`) instead of returning them from `lazy()` — fixes blank initial render and console warning under lazy routes. Global `loading.*` applies only to the root layout; nested layouts use a local `loading.*` in the same directory when needed.
- **Merge regen for loading/error**: when `pages/loading.*` or `pages/error.*` are added or removed, `mergeRouteFiles` now syncs route-level `HydrateFallback` / `ErrorBoundary` from fresh codegen instead of only updating imports while keeping stale route bodies (fixes persistent hydration warning after restoring loading/error files).
- **Route groups with `_layout`**: keep `(group)/_layout` as nested layout routes instead of flattening group children to the parent level.

- **Vue lazy leaf routes**: when `pages/loading.vue` exists, all lazy page routes now use `defineAsyncComponent` with `loadingComponent` (not only layout routes).

## 2.0.0

**Major release — route config compiler.** Scans `pages/`, emits physical `routes.ts` for React Router / Vue Router. No virtual modules, no routing runtime.

### Highlights

- **Physical `routes.ts`** — auditable, diff-friendly, hand-editable
- **RouteId merge** — structure from `pages/`, field-level local-wins on regen
- **Three customization layers** — file conventions, `routes.ts` edits, `transformRoutes`
- **Dual stack** — shared scanner; React / Vue codegen
- **Industrial test suite** — ~110 unit tests, router compat matrix, Playwright e2e

### Added

- React / Vue codegen (`framework`, `importMode`, `baseRoute`, `exclude`)
- Route groups `(group)/`, `_layout`, optional `not-found` / `loading` / `error`
- Dynamic segments; `.sync` / `.lazy` per-file import overrides
- Page exports: `meta`, `loader`, `action`, …; Vue `<route>` block (scan-time)
- `transformRoutes` post-scan hook
- `regenDebounceMs` + serialized regen
- Malformed `routes.ts` → fallback to fresh output (superseded by overwrite protection in 2.0.2)
- Demo apps (`demo/react`, `demo/vue`) + Playwright e2e (merge hot-update)
- `compat/` — type-check generated routes against react-router-dom 6.4 / 7.x, vue-router 4 / 5

### Removed (use [unplugin-react-router-dom](../unplugin-react-router-dom) for runtime integration)

- Virtual modules, AnimatedOutlet, auto `RouterProvider` injection, page transition runtime

### Migration from 1.x

| 1.x | 2.0 |
|-----|-----|
| Virtual route module | `import routes from './routes'` |
| Animation / outlet runtime | Removed — use unplugin or app code |
| `vite-plugin-file-router/client` | Generated `FileRoute` types in `routes.ts` |

See [README.md#从-1x-迁移](./README.md#从-1x-迁移).
