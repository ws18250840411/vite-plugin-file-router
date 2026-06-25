# vite-plugin-file-router

面向 React Router / Vue Router 的 Vite 插件：扫描 `pages/` 目录，生成并维护项目内的 `routes.ts`；应用入口导入该文件并创建 Router 即可，无需为每个页面手写路由配置。除了可以通过文件命名方式修改路由参数，还可以手动直接修改`routes.ts`文件，后续的路由信息更新以手动修改为主，解决几乎所有的业务场景。

## 快速开始

### 安装

```bash
pnpm add -D vite-plugin-file-router
pnpm add react-router-dom   # React；Vue 改为 vue-router
```

### 配置 Vite

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import fileRouter from 'vite-plugin-file-router'

export default defineConfig({
  plugins: [
    fileRouter({
      framework: 'react',      // 或 'vue'
      pagesDir: 'src/pages',
      outFile: 'src/routes.ts',
    }),
  ],
})
```

### 挂载路由（应用层）

**React**

```tsx
// main.tsx
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import type { RouteObject } from 'react-router-dom'
import routes from './routes'

createRoot(document.getElementById('root')!).render(
  <RouterProvider router={createBrowserRouter(routes as RouteObject[])} />,
)
```

**Vue**

```ts
// main.ts
import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'
import routes from './routes'

const app = createApp(App)
app.use(createRouter({ history: createWebHistory(), routes }))
app.mount('#app')
```

> 首次 dev/build 后生成路由文件。可提交 Git 由团队共审，也可 `.gitignore` 仅在 CI 生成。

### 纯 JavaScript 项目

TypeScript 用默认 `outFile: 'src/routes.ts'`。纯 JS 工程：

```js
// vite.config.js
import fileRouter from 'vite-plugin-file-router'

export default {
  plugins: [
    fileRouter({
      framework: 'react',
      pagesDir: 'src/pages',
      outFile: 'src/routes.js',       // .js / .mjs / .cjs → 生成无类型的 JS
      extensions: ['jsx', 'js'],      // 页面扩展名与项目一致
    }),
  ],
}
```

```js
// main.jsx
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import routes from './routes.js'

<RouterProvider router={createBrowserRouter(routes)} />
```

`vite.config.cjs` 可用 `require('vite-plugin-file-router')`（包已提供 CJS 构建）。完整示例：`pnpm demo:react-js`（[demo/react-js](./demo/react-js)）。

---

## 文件约定

| 文件 / 目录 | URL / 行为 |
|-------------|------------|
| `pages/index.tsx` | 索引路由 `/` |
| `pages/about.tsx` | `/about` |
| `pages/user/[id].tsx` | `/user/:id` |
| `pages/_layout.tsx` | 目录级布局（嵌套 `children`） |
| `pages/(auth)/login.tsx` | 路由组，不占 URL 段 → `/login` |
| `pages/not-found.tsx` | 404 catch-all（可选） |
| `pages/loading.tsx` | 全局 loading（React：**RR7+** 推荐；见下节） |
| `pages/error.tsx` | 全局错误边界（React：**RR7+** 推荐；见下节） |
| `pages/foo.sync.tsx` | 强制同步 import（默认为 lazy） |
| 页面导出 `meta` / `loader` / `action` 等 | 扫描后写入对应路由字段 |

Vue 使用 `.vue`；`<route>` 块在扫描期读取，编译前须从 SFC 剥离（参考 [demo/vue/vite.config.ts](./demo/vue/vite.config.ts)）。

### `loading` / `error`（可选）

这两个文件**不是 lazy 的前置条件**——没有它们时路由照常生成，`lazy` 也不会报错。

| 文件 | React 生成 | Vue 生成 |
|------|-----------|---------|
| `pages/loading.tsx` | 根 `_layout` 挂 `HydrateFallback: RouteLoading` | 根 layout 的 `defineAsyncComponent` + `loadingComponent` |
| `pages/error.tsx` | 根 `_layout` 挂 `ErrorBoundary: RouteError` | 根 layout 的 `errorComponent` |
| 子目录内的 `loading.tsx` / `error.tsx` | 挂到**该目录**的 `_layout` | 同上 |

**React Router 版本说明：**

- **RR7+（推荐）**：`HydrateFallback` / `ErrorBoundary` 写在**路由对象**上（不是 `lazy()` 返回值内）。有 async `loader` 时建议提供 `loading.tsx`，可避免 `No HydrateFallback...` 控制台警告。
- **RR6.4**：基础 lazy 路由可用；route 对象上的 `HydrateFallback` **类型与运行时均不支持**（`compat/react-6` 靠 `as RouteObject[]` 通过编译，但 fallback 不会生效）。RR6 若需错误 UI，请在 `lazy()` 返回值或页面模块 export 中提供 `ErrorBoundary`。
- **增删文件**：regen 时会同步增删对应字段；merge 会保留你对其他路由字段的手改，但 `HydrateFallback` / `ErrorBoundary` 始终跟随 `pages/` 扫描结果（见 [CHANGELOG](./CHANGELOG.md) 2.0.1）。

---

## 手改 `routes.ts` 与 merge

regen 时以 **RouteId**（`import('./pages/...')`）对齐路由块：

| 场景 | 行为 |
|------|------|
| 增删 `pages/` 文件 | 路由树结构跟随扫描结果 |
| 同 RouteId 的字段与生成结果不一致 | **保留文件中的原文**（local-wins） |
| layout 路由 | 头部配置可保留；`children` 跟随扫描 |
| 页面文件重命名 | 视为新 RouteId，**不迁移**历史手改 |
| `routes.ts` 无法解析 | 降级为全量重新生成 |

可在单条路由上补充 `handle`、`meta`、调整 lazy 返回值等，无需担心保存页面时被覆盖。

---

## 定制方式

| 层次 | 入口 | 用途 |
|------|------|------|
| **结构** | `pages/` 命名与目录 | URL、嵌套、动态段 |
| **字段** | 编辑 `routes.ts` | 单路由覆盖（merge 保留） |
| **策略** | `vite.config` 插件选项 | 全局前缀、lazy/sync、批量变换 |

```ts
fileRouter({
  baseRoute: '/app',
  importMode: 'lazy',
  regenDebounceMs: 50,
  exclude: ['**/_components/**'],
  transformRoutes(root) {
    // 扫描后、codegen 前：批量 meta、过滤、重排等
    return root
  },
})
```

---

## 配置参考

| 选项 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `pagesDir` | `string` | `'src/pages'` | 页面根目录 |
| `outFile` | `string` | `'src/routes.ts'` | 输出路径；`.js` / `.mjs` / `.cjs` 生成纯 JS（无 `export type`） |
| `outputLanguage` | `'ts' \| 'js'` | 由 `outFile` 推断 | 强制生成 TypeScript 或 JavaScript 语法 |
| `framework` | `'react' \| 'vue'` | `'react'` | codegen 目标 |
| `importMode` | `'lazy' \| 'sync'` | `'lazy'` | 默认加载策略 |
| `baseRoute` | `string` | `''` | 全局路径前缀 |
| `transformRoutes` | `function` | — | 扫描后路由树变换 |
| `regenDebounceMs` | `number` | `50` | watch 防抖（ms） |
| `exclude` | `string[]` | `[]` | 排除 glob |
| `extensions` | `string[]` | 框架默认 | 扫描扩展名 |

---

## Router 版本

| 框架 | 最低版本 | 说明 |
|------|----------|------|
| React Router | **6.4+** | Data Router、`lazy` 路由对象；**`pages/loading` / `pages/error` 约定建议 7+** |
| Vue Router | **4+** | 标准 `RouteRecordRaw` |

生成文件内置 `FileRoute` 类型，不 import 路由库。挂载方式与 demo 一致：`routes as RouteObject[]` 或传入 `createRouter`。

`compat/` 对 react-router-dom **6.4 / 7.x**、vue-router **4 / 5** 做编译期检查（`pnpm test:compat`）。其中 `react-7/check-fallback.ts` 专门断言 `HydrateFallback` / `ErrorBoundary` 与 RR7 `RouteObject` 类型兼容。

---

## 示例与验证

```bash
pnpm build
pnpm demo:react     # http://localhost:5199
pnpm demo:react-js  # http://localhost:5201
pnpm demo:vue       # http://localhost:5200
```

[demo/README.md](./demo/README.md) — 约定覆盖、merge 手测流程、HMR。  
E2E：`e2e/`（React / Vue 导航与 merge 热更新）。

---

## 与相关方案

| 方案 | 职责 |
|------|------|
| **本包** | 编译并同步可编辑的 `routes.ts` |
| [unplugin-react-router-dom](../unplugin-react-router-dom) | 运行时 Router 集成与页面转场 |
| [vite-plugin-pages](https://github.com/hannoeru/vite-plugin-pages) | 虚拟模块式文件路由 |

---

## 从 1.x 迁移

2.0 为架构重写，**不再提供**虚拟模块、动画运行时与自动 `RouterProvider` 注入。

| 1.x | 2.0 |
|-----|-----|
| 虚拟路由模块 | `import routes from './routes'` |
| 插件内 AnimatedOutlet / 转场 | 移除；转场由业务或 unplugin 承担 |
| `vite-plugin-file-router/client` 类型辅助 | 使用生成文件内的 `FileRoute` |

迁移步骤：

1. 在 `vite.config` 启用 `fileRouter({ outFile: 'src/routes.ts' })`
2. 在 `main` 中自行 `createBrowserRouter(routes)` 并渲染 `RouterProvider`
3. 删除对虚拟路由 import 与 1.x client 类型的引用
4. 运行 `vite dev` 生成 `routes.ts`，按需手改后提交

运行时集成需求 → [unplugin-react-router-dom](../unplugin-react-router-dom)。完整变更见 [CHANGELOG](./CHANGELOG.md)。

---

## 质量保障

| 类型 | 覆盖 |
|------|------|
| 单元测试 130+ | 路径、codegen、merge、loading/error fallback、畸形降级、`transformRoutes`、压测 |
| Router compat | 多版本 `routes.ts` 类型检查 |
| E2E | demo 导航与 merge 热更新 |

```bash
npx vitest run && pnpm test:compat && npx playwright test
```

---

## 其他

- **Capacitor**：`main` 中选用 `createBrowserRouter` 或 `createHashRouter`
- **英文文档**：[README.en.md](./README.en.md)

## License

MIT
