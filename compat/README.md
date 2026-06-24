# Router compatibility checks

Generates `routes.ts` from minimal `fixtures/`, then type-checks against multiple router versions:

| Project   | Package            | Role                          |
|-----------|--------------------|-------------------------------|
| `react-6` | react-router-dom 6.4.5 | Minimum documented React line |
| `react-7` | react-router-dom 7.17.0 | Current React line           |
| `vue-4`   | vue-router 4.4.5   | Vue Router 4                 |
| `vue-5`   | vue-router 5.0.4   | Vue Router 5                 |

```bash
pnpm run build && pnpm run test:compat
```

Each `check.ts` passes generated routes to `createBrowserRouter` / `createRouter` using the same `as RouteObject[]` / `as RouteRecordRaw[]` cast as the demos.
