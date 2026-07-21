# Demo 应用

React / Vue 参考实现，用于验证文件约定、codegen 输出及 dev watch 下的 merge 行为。

| 目录 | 框架 | 端口 | 启动 |
|------|------|------|------|
| [`react/`](./react) | React Router 7 · TypeScript | **5199** | `npm run demo:react` |
| [`react-js/`](./react-js) | React Router 7 · **纯 JS** (`routes.js` + `.jsx`) | **5201** | `npm run demo:react-js` |
| [`vue/`](./vue) | Vue Router 5 | **5200** | `npm run demo:vue` |
| [`vue-rootless/`](./vue-rootless) | Vue Router 5 · 无根布局 | **5202** | `npm run demo:vue-rootless` |

在 `packages/vite-plugin-file-router` 目录：

```bash
npm run build
npm run demo:react
npm run demo:react-js
npm run demo:vue
npm run demo:vue-rootless
```

## 能力覆盖

| 路由 | 验证点 |
|------|--------|
| Home | `index` + `meta` |
| About | 标准懒加载 |
| Legal | `.sync` 同步 import |
| Showcase | React 懒加载；Vue `<route>` 块 |
| Stats (React) | `loader` 导出 |
| Dashboard | 嵌套 `_layout` + 子路由 |
| Profile (Vue) | 动态段 `user/[id]` |
| 404 | `not-found` catch-all |

`src/routes.ts` 由插件生成（demo 内已 `.gitignore`）。修改 `pages/` 触发 regen；`main` 已注册 routes HMR。

## 验证 merge（推荐手测）

1. 启动 demo，等待 `routes.ts` 生成
2. 编辑 About 路由：React 加 `handle: { demo: true }`；Vue 在 `meta` 加 `demo: true`
3. 在 `pages/` 新增 `hello.tsx` / `hello.vue`
4. 确认：新页面已写入，About 手改字段仍在

| 定制层次 | 操作 |
|----------|------|
| 文件约定 | 增删改 `pages/` |
| 字段覆盖 | 编辑 `routes.ts` |
| 全局策略 | `vite.config` 中 `transformRoutes` 等 |

E2E：[`e2e/`](../e2e)（含 merge 热更新）。
