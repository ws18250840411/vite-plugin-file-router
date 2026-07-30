# vite-plugin-file-router

[![npm](https://img.shields.io/npm/v/vite-plugin-file-router)](https://www.npmjs.com/package/vite-plugin-file-router)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

面向 Vite 的约定式文件路由插件。扫描 `pages/` 目录，生成可审阅、可提交、可手动编辑的 `routes.ts`，并在文件变化时通过三方 AST 合并安全更新。

支持 **React Router 7** 与 **Vue Router 5**，兼容 Node.js >=18、Vite 8.1+。

[English](./README.en.md) · [API Reference](./docs/API.md) · [Migration Guide](./docs/MIGRATION.md)

**在线体验：** [StackBlitz React Demo](https://stackblitz.com/github/user/vite-plugin-file-router/tree/master/demo/react) · [StackBlitz Vue Demo](https://stackblitz.com/github/user/vite-plugin-file-router/tree/master/demo/vue)

> 本地运行 demo：`cd demo/react && npm i && npm run dev`

## 特性一览

- **双框架** — React Router 7 (`RouteObject[]`) + Vue Router 5 (`RouteRecordRaw[]`)
- **三方合并** — 人工修改保留，生成更新与手动编辑互不干扰
- **类型安全路由** — `RoutePaths`、`RouteParams`、`buildPath`、`matchRoute`、`typedRedirect`
- **虚拟路由** — 不走文件系统的编程式路由定义
- **自动代码分割** — 布局同步 + 页面懒加载，单文件可覆盖
- **Modal 路由** — `+filename` 约定，独立导出
- **并行路由** — `@slot` 目录，命名插槽渲染
- **i18n 路由** — 自动生成 locale 前缀路径与类型
- **SSR Manifest** — 路由级 JSON 清单，支持 prefetch 标注
- **路由诊断** — 重复路由、缺失导出、冲突配置编译时报错
- **Route Inspector** — 开发时终端路由树可视化
- **Sitemap 生成** — 从路由树输出标准 `sitemap.xml`
- **Search Params 类型推断** — 页面声明 schema，编译时校验查询参数
- **Route Guards 类型** — meta.guards 自动生成 guard 联合类型
- **HMR** — 仅路由配置变化时触发模块热更新

---

## 快速接入

### 1. 安装

```bash
# React
npm i -D vite-plugin-file-router
npm i react-router-dom

# Vue
npm i -D vite-plugin-file-router
npm i vue-router
```

### 2. 配置 Vite

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
<summary>Vue 配置</summary>

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

### 3. 创建首页

```tsx
// src/pages/index.tsx
export default function Home() {
  return <h1>Home</h1>
}
```

### 4. 挂载路由

```tsx
// React
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import routes from './routes'

<RouterProvider router={createBrowserRouter(routes)} />
```

<details>
<summary>Vue 挂载</summary>

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

首次 `vite dev` 后自动生成路由文件。建议将 `routes.ts` 纳入版本管理。

---

## 文件约定

| 文件 | 路由路径 | 说明 |
|------|----------|------|
| `pages/index.tsx` | `/` | 目录首页 |
| `pages/about.tsx` | `/about` | 静态路由 |
| `pages/user/[id].tsx` | `/user/:id` | 动态参数 |
| `pages/blog/[[id]].tsx` | `/blog/:id?` | 可选参数 |
| `pages/docs/[...slug].tsx` | `/docs/*` | Catch-all |
| `pages/docs/[[...slug]].tsx` | `/docs/*?` | 可选 catch-all |
| `pages/(auth)/login.tsx` | `/login` | 路由组（目录不入 URL） |
| `pages/_layout.tsx` | — | 当前目录布局组件 |
| `pages/not-found.tsx` | `*` | 404 页面 |
| `pages/loading.tsx` | — | 布局 loading 状态 |
| `pages/error.tsx` | — | 布局错误边界 |
| `pages/report.sync.tsx` | `/report` | 强制同步导入 |
| `pages/report.lazy.tsx` | `/report` | 强制异步导入 |
| `pages/+login.tsx` | — | Modal 路由 |
| `pages/@sidebar/` | — | 并行路由 slot |

Vue 项目规则完全一致，使用 `.vue` 扩展名。

---

## 页面模块导出

### React Router

页面必须默认导出组件。支持以下导出：

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

> `meta` 生成静态 `handle`。同时导出 `meta` 和运行时 `handle` 会被视为冲突并报错。

### Vue Router

支持 JSON / JSON5 / YAML `<route>` 自定义块：

```vue
<route lang="yaml">
path: account/:id
name: account
props: true
meta:
  requiresAuth: true
</route>
```

支持字段：`path`、`name`、`alias`、`props`、`meta`。布局文件同样生效。

---

## 类型安全路由

启用 `typedRoutes: true` 后自动生成编译时类型系统：

```ts
// routes.ts（自动生成）
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

### 使用示例

```tsx
import { buildPath, matchRoute, type RoutePaths, type RouteParams } from './routes'
import { useParams } from 'react-router-dom'

// 路径编译时校验
<Link to={'/about' satisfies RoutePaths}>About</Link>  // ✅
<Link to={'/typo'  satisfies RoutePaths}>Typo</Link>  // ❌ 编译报错

// 类型安全路径构建
buildPath('/user/:id', { id: '42' })  // ✅ => "/user/42"
buildPath('/user/:id', {})            // ❌ 缺少 id
buildPath('/about')                   // ✅ 静态路由无需参数

// 配合 useParams 使用
const params = useParams() as RouteParams['/user/:id']
params.id  // string ✅

// 活跃路由判断
matchRoute('/user/42', '/user/:id')  // true
```

### 额外生成内容

当 `typedRoutes` 启用时，根据路由树内容按需生成：

| 生成项 | 条件 | 用途 |
|--------|------|------|
| `SearchParams` | 页面导出 `searchParams` | 查询参数类型 |
| `LoaderRoutes` / `ActionRoutes` | 页面导出 `loader`/`action` | 标识数据路由 |
| `MiddlewareRoutes` | 页面导出 `middleware` | 中间件路由 |
| `RouteGuards` / `GuardedRoutes` | meta 含 `guards` 数组 | 路由守卫类型 |
| `typedRedirect()` | 有路由即生成 | 类型安全重定向 |
| `matchRoute()` | 有路由即生成 | URL 匹配判断 |
| `routeAncestors` | 有路由即生成 | 面包屑祖先链 |
| `ROUTES` | 有路由即生成 | 路径常量对象（IDE 补全） |
| `TypedParams<P>` | 有动态路由 | 参数类型工具 |
| `Locale` / `locales` | 配置 i18n | 国际化类型 |
| `ModalPaths` | 有 modal 路由 | Modal 路径联合 |
| `SlotNames` | 有并行路由 | Slot 名称联合 |

> 仅 `.ts` 输出生效；catch-all 路由不纳入 `RoutePaths`。页面增删后自动更新。

---

## 三方 AST 合并

生成的 `routes.ts` 是正式配置文件，不是只读产物。插件使用 RouteId 标记和 baseline/current/fresh 三方 AST 合并：

- **新增/删除** — `pages/` 目录结构控制
- **手动修改** — 编辑过的字段、新增的字段、自定义 import 和注释全部保留
- **未修改字段** — 采用最新生成值
- **安全保障** — 语法错误时拒绝覆盖；重复 `@file-route` 标记或 import 冲突时拒绝写入

文件末尾 `@vite-file-router-manifest` 注释是合并基线指纹，请保留。损坏时安全降级为无基线合并。

---

## 配置参考

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

| 选项 | 默认值 | 说明 |
|------|--------|------|
| `framework` | `'react'` | 目标框架：`'react'` 或 `'vue'` |
| `pagesDir` | `'src/pages'` | 页面目录（相对项目根） |
| `outFile` | `'src/routes.ts'` | 输出路径；支持 `.ts`、`.js`、`.mjs` |
| `extensions` | 按框架 | 页面文件扩展名 |
| `importMode` | `'lazy'` | 默认导入模式：`'lazy'` 或 `'sync'` |
| `baseRoute` | `''` | 路由前缀（如 `/app`） |
| `exclude` | `[]` | 相对 `pagesDir` 的 glob 排除 |
| `transformRoutes` | — | 生成前调整路由树的钩子 |
| `regenDebounceMs` | `50` | 文件监听防抖（ms） |
| `logDiagnostics` | `true` | 控制台输出诊断信息 |
| `failOnRouteError` | `true` | 诊断有 error 时阻止写入 |
| `typedRoutes` | `false` | 生成完整类型安全路由系统 |
| `autoCodeSplitting` | `false` | `'layout'`：布局同步 + 页面懒加载 |
| `virtualRoutes` | `[]` | 编程式虚拟路由定义 |
| `ssrManifest` | `false` | 生成 `route-manifest.json` |
| `i18n` | — | 国际化：`{ locales, defaultLocale, strategy? }` |

> `.cjs` 不是有效输出格式。Vite 配置文件本身可使用 CommonJS。

---

## 高级功能

### 虚拟路由

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

与文件系统路由合并输出，参与类型生成和三方合并。

### Modal 路由

`+` 前缀文件独立于主路由数组：

```
pages/+login.tsx     → modalRoutes: [{ path: "/login", ... }]
pages/user/+edit.tsx → modalRoutes: [{ path: "/edit", ... }]
```

### 自动代码分割

| 值 | 行为 |
|----|------|
| `false` | 遵循 `importMode` |
| `'layout'` | 布局同步 + 页面懒加载（**推荐**） |
| `true` / `'route'` | 全部懒加载 |

单文件 `.sync` / `.lazy` 后缀始终最优先。

### 并行路由

`@slotname` 目录创建命名插槽，生成 `slots` 对象和 `SlotNames` 类型。

### i18n 路由

```ts
i18n: { locales: ['en', 'zh', 'ja'], defaultLocale: 'en', strategy: 'never' }
```

- `'never'`：默认 locale 无前缀，其他有（如 `/zh/about`）
- `'always'`：所有 locale 都带前缀（如 `/en/about`）

### SSR Manifest

启用 `ssrManifest: true` 后输出 `routes.manifest.json`：

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

通过 `meta.prefetch` 声明预取策略：`"intent"` | `"viewport"` | `"none"`。

### Sitemap 生成

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

## 可靠性与性能

- **AST 分析** — Babel AST 解析模块导出，token 指纹跟踪变更
- **Vue SFC 解析** — 官方 `@vue/compiler-sfc` 解析 `<route>` 块
- **原子写入** — 解析失败或诊断错误不覆盖现有配置
- **语法校验** — 合并结果写入前再次做完整 parse
- **增量缓存** — stat + AST 缓存，不变的文件不重复解析
- **路由级 HMR** — 仅路由配置变化时触发模块热更新

### 性能基准

Darwin arm64 / Node 24（`npm run bench`）：

| 框架 | 路由数 | 冷生成 | 无变化 | 1% 变更合并 |
|------|-------:|-------:|-------:|------------:|
| React | 1,000 | 162 ms | 8 ms | 192 ms |
| React | 10,000 | 1.15 s | 72 ms | 1.38 s |
| Vue | 1,000 | 136 ms | 8 ms | 105 ms |
| Vue | 10,000 | 994 ms | 71 ms | 753 ms |

无变化重跑 ~8ms（1000 路由），大型项目 10K 路由冷生成 ~1s。

---

## 质量保障

| 维度 | 覆盖 |
|------|------|
| 单元测试 | 317 个，覆盖率 90%+ lines / 80%+ branches |
| E2E 测试 | 19 个，React + Vue + 热更新合并验证 |
| CI | GitHub Actions 三平台 + E2E + 性能基准 |
| 构建产物 | ESM 55KB / CJS 56KB，tarball < 55KB |
| 类型检查 | 生成代码直接 `satisfies RouteObject[] / RouteRecordRaw[]` |

```bash
npm run verify     # 单元测试 + 构建 + 类型检查 + E2E + 包检查
npm run bench      # 性能基准
npm run test:coverage  # 覆盖率报告
```

---

## License

MIT
