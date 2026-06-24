import DemoPage from '../../components/DemoPage'

export default function DashboardHome() {
  return (
    <DemoPage
      title="Dashboard Home"
      lead="dashboard/index.tsx 作为 /dashboard 的 index 子路由，外层由 dashboard/_layout.tsx 包裹。"
      badges={[
        { label: 'URL', value: '/dashboard' },
        { label: '布局', value: 'dashboard/_layout.tsx' },
      ]}
    />
  )
}
