import DemoPage from '../components/DemoPage'

export default function NotFound() {
  return (
    <DemoPage
      title="Not Found"
      lead="not-found.tsx 映射为 catch-all 路由 path: &quot;*&quot;，未匹配路径会落到这里。"
      badges={[
        { label: '文件', value: 'not-found.tsx' },
        { label: '路由', value: 'path: "*"' },
      ]}
      code="访问 /404-demo 或任意未知路径即可触发"
    />
  )
}
