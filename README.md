# vite-plugin-file-router

[![npm](https://img.shields.io/npm/v/vite-plugin-file-router)](https://www.npmjs.com/package/vite-plugin-file-router)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

扫描 `pages/` 目录自动生成 `routes.ts`，支持 React Router 7 与 Vue Router。手动修改通过三方 AST 合并安全保留。

[English](./README.en.md) · [在线体验](https://stackblitz.com/github/ws18250840411/vite-plugin-file-router/tree/master/demo/react?file=vite.config.ts) · [API 文档](./docs/API.md)

## 安装

```bash
npm i -D vite-plugin-file-router
```

## 使用

```ts
// vite.config.ts
import fileRouter from 'vite-plugin-file-router'

export default defineConfig({
  plugins: [fileRouter()],
})
```

启动 `vite dev` 后自动在 `src/routes.ts` 生成路由配置，直接导入使用：

```tsx
import routes from './routes'
<RouterProvider router={createBrowserRouter(routes)} />
```

就这么简单。在 `src/pages/` 下增删文件，路由自动更新。

---

## 文件约定

| 文件 | 路由 | 说明 |
|------|------|------|
| `pages/index.tsx` | `/` | 首页 |
| `pages/about.tsx` | `/about` | 静态路由 |
| `pages/user/[id].tsx` | `/user/:id` | 动态参数 |
| `pages/[...slug].tsx` | `/*` | Catch-all |
| `pages/(auth)/login.tsx` | `/login` | 路由组（目录不入 URL） |
| `pages/_layout.tsx` | — | 布局组件 |
| `pages/not-found.tsx` | `*` | 404 |
| `pages/report.sync.tsx` | `/report` | 强制同步导入 |

<details>
<summary>更多约定</summary>

| 文件 | 说明 |
|------|------|
| `pages/[[id]].tsx` | 可选参数 `/blog/:id?` |
| `pages/[[...slug]].tsx` | 可选 catch-all |
| `pages/loading.tsx` | 布局 loading 状态 |
| `pages/error.tsx` | 错误边界 |
| `pages/+login.tsx` | Modal 路由 |
| `pages/@sidebar/` | 并行路由 slot |

</details>

---

## 配置

```ts
fileRouter({
  framework: 'react',       // 'react' | 'vue'
  pagesDir: 'src/pages',    // 页面目录
  outFile: 'src/routes.ts', // 输出文件
  importMode: 'lazy',       // 'lazy' | 'sync'
  typedRoutes: true,        // 生成类型安全路由
})
```

<details>
<summary>完整配置项</summary>

| 选项 | 默认值 | 说明 |
|------|--------|------|
| `framework` | `'react'` | `'react'` 或 `'vue'` |
| `pagesDir` | `'src/pages'` | 页面目录 |
| `outFile` | `'src/routes.ts'` | 输出路径 |
| `extensions` | 按框架 | 页面文件扩展名 |
| `importMode` | `'lazy'` | 默认导入模式 |
| `baseRoute` | `''` | 路由前缀 |
| `exclude` | `[]` | glob 排除 |
| `typedRoutes` | `false` | 类型安全路由 |
| `autoCodeSplitting` | `false` | `'layout'` = 布局同步 + 页面懒加载 |
| `virtualRoutes` | `[]` | 编程式虚拟路由 |
| `ssrManifest` | `false` | 生成 route-manifest.json |
| `i18n` | — | `{ locales, defaultLocale, strategy? }` |
| `transformRoutes` | — | 路由树变换钩子 |
| `regenDebounceMs` | `50` | 防抖 ms |

</details>

---

## 类型安全路由

启用 `typedRoutes: true` 后自动生成：

```ts
import { buildPath, type RoutePaths, type RouteParams } from './routes'

// 路径校验
<Link to={'/about' satisfies RoutePaths}>About</Link>  // ✅
<Link to={'/typo'  satisfies RoutePaths}>Typo</Link>   // ❌ 编译报错

// 安全路径构建
buildPath('/user/:id', { id: '42' })  // => "/user/42"

// 配合 useParams
const { id } = useParams() as RouteParams['/user/:id']
```

<details>
<summary>完整生成内容</summary>

| 生成项 | 条件 | 用途 |
|--------|------|------|
| `RoutePaths` / `RouteParams` | 始终 | 路径与参数类型 |
| `buildPath()` | 始终 | 类型安全路径构建 |
| `matchRoute()` | 始终 | URL 匹配判断 |
| `typedRedirect()` | 始终 | 类型安全重定向 |
| `ROUTES` | 始终 | 路径常量对象（IDE 补全） |
| `routeAncestors` | 始终 | 面包屑祖先链 |
| `SearchParams` | 导出 `searchParams` | 查询参数类型 |
| `LoaderRoutes` / `ActionRoutes` | 导出 loader/action | 数据路由标识 |
| `MiddlewareRoutes` | 导出 middleware | 中间件路由 |
| `RouteGuards` | meta 含 guards | 守卫类型 |

</details>

---

## 三方合并

生成的 `routes.ts` 可直接手动编辑：

- 新增/删除路由 — 由文件系统控制
- 手动修改 — 编辑过的字段、自定义 import、注释**全部保留**
- 冲突安全 — 语法错误或标记异常时拒绝覆盖

---

## 高级功能

<details>
<summary>虚拟路由</summary>

```ts
virtualRoutes: [
  { path: '/admin', component: 'src/admin/Dashboard.tsx', meta: { requiresAuth: true } },
]
```

</details>

<details>
<summary>i18n 路由</summary>

```ts
i18n: { locales: ['en', 'zh'], defaultLocale: 'en', strategy: 'never' }
// /about → 英文, /zh/about → 中文
```

</details>

<details>
<summary>SSR Manifest</summary>

启用 `ssrManifest: true` 输出 `routes.manifest.json`，包含组件路径、loader/action 标记、prefetch 策略。

</details>

<details>
<summary>Sitemap 生成</summary>

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

## Vue 项目

```ts
import vue from '@vitejs/plugin-vue'
import fileRouter from 'vite-plugin-file-router'

export default defineConfig({
  plugins: [vue(), fileRouter({ framework: 'vue' })],
})
```

Vue 支持 `<route lang="yaml">` 自定义块声明 path/name/meta 等。文件约定与 React 完全一致，使用 `.vue` 扩展名。

---

## License

MIT
