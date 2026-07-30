# Migration Guide

How to migrate from other file-based routing solutions to `vite-plugin-file-router`.

---

## From `vite-plugin-pages`

[vite-plugin-pages](https://github.com/hannoeru/vite-plugin-pages) is a popular file-based routing plugin. Key differences:

| Feature | vite-plugin-pages | vite-plugin-file-router |
|---------|-------------------|------------------------|
| Generated file | Virtual module (memory) | Physical `routes.ts` (editable) |
| Manual edits | Not possible | Preserved via three-way merge |
| Typed routes | No | Full type system |
| React Router version | v6 | v7 (with module exports) |

### Step 1: Replace the plugin

```diff
- import Pages from 'vite-plugin-pages'
+ import fileRouter from 'vite-plugin-file-router'

export default defineConfig({
  plugins: [
-   Pages({ dirs: 'src/pages' }),
+   fileRouter({ pagesDir: 'src/pages' }),
  ],
})
```

### Step 2: Change the import

```diff
- import routes from '~react-pages'
+ import routes from './routes'
```

or for Vue:

```diff
- import routes from '~pages'
+ import routes from './routes'
```

### Step 3: Rename conventions

| vite-plugin-pages | vite-plugin-file-router | Notes |
|-------------------|------------------------|-------|
| `[...all].vue` | `[...all].vue` or `not-found.vue` | Same syntax supported |
| `_layout.vue` (unsupported) | `_layout.vue` | We support directory layouts |
| `components/` in pages | Add to `exclude` | `exclude: ['**/components/**']` |

### Step 4: Run once and commit

```bash
npx vite build  # or vite dev
git add src/routes.ts
git commit -m "chore: migrate to vite-plugin-file-router"
```

---

## From `unplugin-vue-router`

[unplugin-vue-router](https://github.com/posva/unplugin-vue-router) is the Vue-ecosystem typed routing solution. Key differences:

| Feature | unplugin-vue-router | vite-plugin-file-router |
|---------|--------------------|-----------------------|
| Framework | Vue only | React + Vue |
| Type generation | DTS virtual module | Inline in routes.ts |
| Manual edits | Not supported | Three-way merge preserves |
| `<route>` blocks | Yes | Yes (JSON/JSON5/YAML) |

### Step 1: Replace the plugin

```diff
- import VueRouter from 'unplugin-vue-router/vite'
+ import fileRouter from 'vite-plugin-file-router'

export default defineConfig({
  plugins: [
-   VueRouter({ routesFolder: 'src/pages' }),
+   fileRouter({ framework: 'vue', pagesDir: 'src/pages' }),
    vue(),
  ],
})
```

### Step 2: Change the import

```diff
- import { routes } from 'vue-router/auto-routes'
+ import routes from './routes'
```

### Step 3: Update typed route usage

```diff
- import type { RouteNamedMap } from 'vue-router/auto-routes'
- // Usage: router.push({ name: 'user-id' })
+ import type { RoutePaths } from './routes'
+ // Usage: router.push('/user/42' satisfies RoutePaths)
```

### Step 4: Remove the generated DTS

```diff
- // tsconfig.json
- "types": ["unplugin-vue-router/client"]
```

Delete `typed-router.d.ts` if it exists.

---

## From Manual Route Configuration

If you currently maintain routes manually:

### Step 1: Add the plugin

```ts
// vite.config.ts
import fileRouter from 'vite-plugin-file-router'

export default defineConfig({
  plugins: [fileRouter({ framework: 'react' })],
})
```

### Step 2: Create the pages directory

Move your page components into `src/pages/` following the conventions:

```
Before:                          After:
src/views/Home.tsx         →     src/pages/index.tsx
src/views/About.tsx        →     src/pages/about.tsx
src/views/User.tsx         →     src/pages/user/[id].tsx
src/views/Dashboard/       →     src/pages/dashboard/
  Layout.tsx               →       _layout.tsx
  Overview.tsx             →       index.tsx
  Settings.tsx             →       settings.tsx
```

### Step 3: Run and verify

```bash
npx vite dev
# routes.ts is generated automatically
```

### Step 4: Keep custom routes as virtual routes

If you have routes that don't fit the filesystem convention:

```ts
fileRouter({
  virtualRoutes: [
    { path: '/legacy-admin', component: 'src/admin/LegacyPanel.tsx' },
  ],
})
```

### Step 5: Migrate route metadata

```diff
// Before (in route config):
- { path: '/admin', element: <Admin />, handle: { requiresAuth: true } }

// After (in src/pages/admin.tsx):
+ export const meta = { requiresAuth: true }
+ export default function Admin() { ... }
```

---

## From Next.js App Router

If migrating from Next.js to a Vite SPA:

| Next.js | vite-plugin-file-router |
|---------|------------------------|
| `app/page.tsx` | `pages/index.tsx` |
| `app/about/page.tsx` | `pages/about.tsx` |
| `app/user/[id]/page.tsx` | `pages/user/[id].tsx` |
| `app/layout.tsx` | `pages/_layout.tsx` |
| `app/loading.tsx` | `pages/loading.tsx` |
| `app/error.tsx` | `pages/error.tsx` |
| `app/not-found.tsx` | `pages/not-found.tsx` |
| `app/(auth)/login/page.tsx` | `pages/(auth)/login.tsx` |

Key differences:
- No server components (Vite SPA is client-side)
- `loader` replaces `getServerSideProps` / server actions
- `meta` replaces `generateMetadata`
- No streaming/suspense boundaries (use React Router's built-in)

---

## Common Migration Tips

### Preserve existing route customizations

After initial generation, you can edit `routes.ts` freely. The three-way merge ensures your customizations survive future regenerations:

```ts
// src/routes.ts — feel free to add custom properties
{
  path: '/admin',
  lazy: () => import('./pages/admin.tsx'),
  handle: { requiresAuth: true, roles: ['admin'] },  // ← preserved on regen
}
```

### Gradual migration

You don't need to migrate all routes at once. Use `virtualRoutes` for routes you haven't converted yet:

```ts
fileRouter({
  virtualRoutes: [
    // These stay as-is until you create the corresponding page file
    { path: '/old-feature', component: 'src/legacy/OldFeature.tsx' },
  ],
})
```

### Type-safe navigation

Enable `typedRoutes: true` after migration for compile-time path validation:

```tsx
import { buildPath, type RoutePaths } from './routes'

// Compile error if path doesn't exist
<Link to={'/about' satisfies RoutePaths}>About</Link>
```
