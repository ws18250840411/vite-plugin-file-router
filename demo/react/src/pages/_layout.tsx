import { NavLink, Outlet } from 'react-router-dom'

import '../demo.css'

const NAV = [
  { to: '/', label: 'Home', tag: 'lazy' as const, hint: 'index + meta' },
  { to: '/about', label: 'About', tag: 'lazy' as const, hint: 'meta → handle' },
  { to: '/legal', label: 'Legal', tag: 'sync' as const, hint: '.sync.tsx' },
  { to: '/showcase', label: 'Showcase', tag: 'lazy' as const, hint: 'showcase.tsx' },
  { to: '/stats', label: 'Stats', tag: 'lazy' as const, hint: 'loader export' },
  { to: '/dashboard', label: 'Dashboard', tag: 'lazy' as const, hint: 'nested _layout' },
]

export default function RootLayout() {
  return (
    <div className="demo-app" data-testid="root-layout">
      <aside className="demo-sidebar">
        <div className="demo-brand">
          vite-plugin-file-router
          <span>React Router 7 demo</span>
        </div>
        <nav className="demo-nav" aria-label="Main">
          {NAV.map(({ to, label, tag }) => (
            <NavLink key={to} to={to} className={({ isActive }) => (isActive ? 'active' : undefined)}>
              <span>{label}</span>
              <span className={`demo-tag ${tag}`}>{tag}</span>
            </NavLink>
          ))}
          <NavLink to="/404-demo" className={({ isActive }) => (isActive ? 'active' : undefined)}>
            <span>404</span>
            <span className="demo-tag lazy">catch-all</span>
          </NavLink>
        </nav>
      </aside>
      <main className="demo-main">
        <Outlet />
      </main>
    </div>
  )
}
