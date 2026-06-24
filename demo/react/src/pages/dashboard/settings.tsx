import DemoPage from '../../components/DemoPage'

export default function DashboardSettings() {
  return (
    <DemoPage
      title="Dashboard Settings"
      lead="dashboard/settings.tsx → /dashboard/settings，与 Overview 共享同一嵌套布局。"
      badges={[
        { label: 'URL', value: '/dashboard/settings' },
        { label: '布局', value: 'dashboard/_layout.tsx' },
      ]}
    />
  )
}
