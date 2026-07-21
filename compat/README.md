# Router compatibility checks

Installs each locked compatibility project, generates `routes.ts` from minimal `fixtures/`, then type-checks it:

| Project   | Package            | Role                          |
|-----------|--------------------|-------------------------------|
| `react-7` | react-router-dom 7.18.1 | Current React line; validates direct `createBrowserRouter(routes)` plus fallbacks |
| `vue-5`   | vue-router 5.2.0   | Current Vue line; validates direct `createRouter({ routes })` |

```bash
npm run build && npm run test:compat
```

Each `check.ts` passes generated routes directly to `createBrowserRouter` / `createRouter`, without type assertions.
