import DemoPage from '../components/DemoPage'

export default function ShowcasePage() {
  return (
    <DemoPage
      title="Showcase"
      lead="showcase.tsx → /showcase，标准懒加载页面。"
      badges={[
        { label: '源文件', value: 'pages/showcase.tsx' },
        { label: 'URL', value: '/showcase' },
        { label: '加载', value: 'lazy' },
      ]}
    >
      <p data-testid="showcase-note">路由路径：<strong>/showcase</strong></p>
    </DemoPage>
  )
}
