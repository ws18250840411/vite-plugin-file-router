# vite-plugin-file-router

面向 Vite 的 React Router / Vue Router 约定式路由插件。扫描 `pages/`，生成项目内可审阅、可提交、可手动修改的 `routes.ts`，并在文件变化时安全合并更新。

当前目标版本：Node.js **24.11+**、Vite 8.1+、React Router 7.18+、Vue Router 5.2+。不包含历史 Router 兼容分支。本地开发推荐使用 `.nvmrc`（`nvm use`）或 fnm/volta 对齐 Node 24.11.0。

## 快速接入

### 1. 安装

React：

```bash
npm i -D vite-plugin-file-router
npm i react-router-dom
```

Vue：

```bash
npm i -D vite-plugin-file-router
npm i vue-router
```

### 2. 配置 Vite

React：

```ts
// vite.config.ts
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import fileRouter from 'vite-plugin-file-router'

export default defineConfig({
  plugins: [
    react(),
    fileRouter({ framework: 'react' }),
  ],
})
```

Vue：

```ts
// vite.config.ts
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

默认扫描 `src/pages`，生成 `src/routes.ts`。Vue `<route>` 块会自动在 SFC 编译前移除，无需额外 transform 插件。

### 3. 创建首页

```tsx
// src/pages/index.tsx
export default function Home() {
  return <h1>Home</h1>
}
```

Vue 项目使用 `src/pages/index.vue`。

### 4. 挂载 Router

React：

```tsx
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import routes from './routes'

createRoot(document.getElementById('root')!).render(
  <RouterProvider router={createBrowserRouter(routes)} />,
)
```

Vue：

```ts
import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'
import routes from './routes'

createApp(App)
  .use(createRouter({ history: createWebHistory(), routes }))
  .mount('#app')
```

首次启动 Vite 后生成路由文件。建议将 `routes.ts` 提交到 Git，便于审阅配置变化和业务定制。

## 文件约定

| 文件 | 路由 |
|------|------|
| `pages/index.tsx` | `/` |
| `pages/about.tsx` | `/about` |
| `pages/user/[id].tsx` | `/user/:id` |
| `pages/blog/[[id]].tsx` | `/blog/:id?` |
| `pages/docs/[...slug].tsx` | `/docs/*` |
| `pages/docs/[[...slug]].tsx` | 可选 catch-all |
| `pages/(auth)/login.tsx` | `/login`，目录组不进入 URL |
| `pages/_layout.tsx` | 当前目录布局 |
| `pages/not-found.tsx` / `404.tsx` | catch-all |
| `pages/loading.tsx` | 当前布局 loading |
| `pages/error.tsx` | 当前布局错误边界 |
| `pages/report.sync.tsx` | 强制同步导入 |
| `pages/report.lazy.tsx` | 强制异步导入 |

Vue 页面使用 `.vue`，规则一致。

## 页面配置

### React Router

页面必须默认导出组件。插件通过 AST 读取当前 React Router 路由模块导出：

```tsx
export const meta = { title: 'Users', auth: { role: 'admin' } }
export async function loader() {}
export async function action() {}
export const middleware = []
export function ErrorBoundary() {}
export function shouldRevalidate() { return false }

export default function Users() {}
```

`meta` 会生成静态 `handle`。不要同时导出 `meta` 和运行时 `handle`，插件会将其视为冲突并阻止生成。

### Vue Router

支持 JSON、JSON5、YAML `<route>` 块：

```vue
<route lang="yaml">
path: account/:id
name: account
props: true
meta:
  requiresAuth: true
</route>
```

支持 `path`、`name`、`alias`、`props`、`meta`，布局文件同样生效。重复路由名、重复 URL 或无效配置会在生成阶段报错。

## 手动修改 routes.ts

生成文件是正式配置，不是只读产物。插件使用稳定 RouteId 和 baseline/current/fresh 三方 AST 合并：

- `pages/` 控制文件路由的新增、删除和层级。
- 人工修改或删除的字段会保留。
- 自定义 import、声明、注释、顶层路由和子路由会保留。
- 未修改字段采用最新生成结果。
- 文件重命名视为新 RouteId，不迁移旧配置。
- `routes.ts` 语法损坏时拒绝覆盖，原文件保持不变。
- 重复 `@file-route`、合并后的 import/声明冲突会拒绝写入，不会猜测路由归属。

文件末尾的 `@vite-file-router-manifest` 是合并基线，只保存生成字段指纹，不参与运行时。请保留该注释。
注释损坏或版本不匹配时会安全降级为无基线合并；此时现有字段仍保留，但无法识别此前手动删除的生成字段。

## 配置

```ts
fileRouter({
  framework: 'react',
  pagesDir: 'src/pages',
  outFile: 'src/routes.ts',
  importMode: 'lazy',
  baseRoute: '/app',
  exclude: ['**/_components/**'],
  regenDebounceMs: 50,
  transformRoutes(root) {
    return root
  },
})
```

| 选项 | 默认值 | 说明 |
|------|--------|------|
| `framework` | `'react'` | `'react'` 或 `'vue'` |
| `pagesDir` | `'src/pages'` | 页面目录 |
| `outFile` | `'src/routes.ts'` | ESM 输出；支持 `.ts`、`.js`、`.mjs` |
| `extensions` | 按框架 | 扫描的页面扩展名 |
| `importMode` | `'lazy'` | `'lazy'` 或 `'sync'` |
| `baseRoute` | `''` | 路由前缀 |
| `exclude` | `[]` | 相对 `pagesDir` 的 glob |
| `transformRoutes` | - | 生成前调整路由树 |
| `regenDebounceMs` | `50` | 文件监听防抖毫秒数 |
| `logDiagnostics` | `true` | 输出诊断 |
| `failOnRouteError` | `true` | 有错误时阻止写入 |

`.cjs` 不是有效的客户端路由输出；Vite 配置文件仍可使用 CommonJS。

## 可靠性与性能

- Babel AST 模块分析与 token 指纹，不依赖正则识别导出。
- Vue 官方 SFC 编译器解析 `<route>`、`script`、`script setup`。
- 同目录原子写入；解析失败和诊断错误不会覆盖现有配置。
- 合并结果会再次执行完整语法校验；写入或原子替换失败时保留上一份有效文件。
- 页面 stat/AST 缓存；不影响路由配置的组件修改不会重建 routes。
- HMR 保留页面模块，只在路由配置变化时追加 routes 模块。

本机基准（Darwin arm64、Node 24.11+，`npm run bench`）：

| 框架 | 路由数 | 冷生成 | 无变化重跑 | 1% 手改+增删合并 |
|------|-------:|-------:|-----------:|-----------------:|
| React | 1,000 | 156 ms | 9 ms | 213 ms |
| React | 10,000 | 1.30 s | 78 ms | 1.39 s |
| Vue | 1,000 | 118 ms | 8 ms | 108 ms |
| Vue | 10,000 | 1.01 s | 76 ms | 1.05 s |

基准数据用于观察回归，不是不同机器上的性能承诺。

## 质量门禁

- **CI**：GitHub Actions 在 ubuntu / windows / macOS 与 **Node 24.11** 上运行单元测试、构建、Router 类型检查与 npm 包检查；另开 Browser E2E job 在三平台跑 Playwright；ubuntu 上运行 `npm run bench` 性能回归。（配置在 `.github/workflows/`，**仅适用于 GitHub**）
- **Gitee Go**：`.workflow/ci.yml` 仅跑 validate（单元测试 + 构建 + compat + `pack:check`），适合 Gitee 构建机；**E2E 与 bench** 请本地执行 `npm run verify` / `npm run bench`，或由 GitHub Actions 承担。
- **单元测试（160）**：真实文件系统可移植性、AST property-based merge fuzz、跨进程输出锁竞争、对抗性 merge 与工业级回归。
- **E2E（19）**：React / Vue demo 与 merge 热更新；`demo/vue-rootless` 覆盖无根 layout 与 route group 浏览器路径。
- **发布**：打 `v*` tag 触发 `npm run verify`（单元测试 + 构建 + compat + E2E + `pack:check`），校验 tag 与 `package.json` 版本一致后以 npm provenance 发布。

## 发布验证

```bash
npm run verify
```

依次执行单元测试、构建、React Router 7 / Vue Router 5 类型检查、Playwright E2E 和 npm 包检查。本地还可运行 `npm run bench` 做性能回归观察。

## License

MIT
