import DemoPage from '../components/DemoPage'

export const meta = { title: 'About' }

export default function About() {
  return (
    <DemoPage
      title="About"
      lead="普通页面文件 about.tsx → /about。侧栏点击可感受路由级 code splitting。"
      badges={[
        { label: '文件', value: 'pages/about.tsx' },
        { label: '加载', value: 'lazy' },
        { label: 'handle', value: '{ title: "About" }' },
      ]}
    />
  )
}
