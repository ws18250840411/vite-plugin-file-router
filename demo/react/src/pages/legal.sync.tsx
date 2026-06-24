import DemoPage from '../components/DemoPage'

export default function LegalPage() {
  return (
    <DemoPage
      title="Legal"
      lead="legal.sync.tsx 使用 .sync 后缀，生成 routes.ts 顶部静态 import，打包进主 chunk。"
      badges={[
        { label: '文件', value: 'pages/legal.sync.tsx' },
        { label: '加载', value: 'sync' },
        { label: 'URL', value: '/legal' },
      ]}
      code="import LegalPage from './pages/legal.sync.tsx'  →  Component: LegalPage"
    />
  )
}
