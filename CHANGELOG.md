# Changelog

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
- Malformed `routes.ts` → fallback to fresh output
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
