import DemoPage from '../components/DemoPage'

export async function loader() {
  return { ok: true }
}

export default function StatsPage() {
  return (
    <DemoPage
      title="Stats"
      lead="页面 export async function loader，生成器自动写入 lazy 返回对象的 loader 字段。"
      badges={[
        { label: '文件', value: 'pages/stats.tsx' },
        { label: 'API', value: 'loader' },
        { label: '加载', value: 'lazy' },
      ]}
      code="async () => { const m = await import(...); return { Component, loader } }"
    >
      <p data-testid="stats-note">React Router 7 route module：loader / action / ErrorBoundary 等均可扫描导出。</p>
    </DemoPage>
  )
}
