import { NavLink, Outlet } from 'react-router-dom'

export default function RootLayout() {
  return (
    <div>
      <nav style={{ display: 'flex', gap: '1rem', padding: '1rem', borderBottom: '1px solid #ddd' }}>
        <NavLink to="/">Home</NavLink>
        <NavLink to="/about">About</NavLink>
        <NavLink to="/legal">Legal (sync)</NavLink>
      </nav>
      <Outlet />
    </div>
  )
}
