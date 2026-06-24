import { NavLink, Outlet } from 'react-router-dom'

export default function DashboardLayout() {
  return (
    <div data-testid="dashboard-layout">
      <div className="demo-badges" style={{ marginBottom: '1rem' }}>
        <span className="demo-badge">嵌套 <strong>dashboard/_layout.tsx</strong></span>
        <span className="demo-badge">子路由在 children 内</span>
      </div>
      <nav className="demo-subnav" aria-label="Dashboard">
        <NavLink to="/dashboard" end>
          Overview
        </NavLink>
        <NavLink to="/dashboard/settings">Settings</NavLink>
      </nav>
      <div style={{ marginTop: '1rem' }}>
        <Outlet />
      </div>
    </div>
  )
}
