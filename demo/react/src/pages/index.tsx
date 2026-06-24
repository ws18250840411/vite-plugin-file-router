import DemoPage from '../components/DemoPage'

export const meta = { title: 'Home' }

export default function Home() {
  return (
    <DemoPage
      title="Home"
      lead="根路由 index.tsx → URL /。演示默认懒加载与 export const meta 写入 routes 的 handle。"
      badges={[
        { label: '文件', value: 'pages/index.tsx' },
        { label: '加载', value: 'lazy (import)' },
        { label: 'meta', value: 'title → handle' },
      ]}
      code="pages/index.tsx  +  export const meta = { title: 'Home' }"
    />
  )
}
