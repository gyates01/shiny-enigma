import { NavLink } from 'react-router-dom'
import { BookOpen, Plus, ShoppingBasket, BarChart2 } from 'lucide-react'

const isProd = import.meta.env.PROD

const links = [
  { to: '/recipes', label: 'Recipes', Icon: BookOpen },
  { to: '/add',     label: 'Add',     Icon: Plus     },
  ...(!isProd ? [{ to: '/pantry', label: 'Pantry', Icon: ShoppingBasket }] : []),
  { to: '/stats',   label: 'Stats',   Icon: BarChart2 },
]

const navStyle = {
  position: 'fixed', left: 0, right: 0, zIndex: 100,
  background: 'var(--card)',
  alignItems: 'center', gap: 4,
}

const activeStyle = { color: 'var(--accent)', fontWeight: 700 }
const linkStyle = { color: 'var(--muted)', textDecoration: 'none', padding: '12px 16px', fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }

export default function Nav() {
  return (
    <>
      {/* Desktop top nav */}
      <nav style={{
        ...navStyle, top: 0, height: 56,
        borderBottom: '1px solid var(--border)',
        padding: '0 24px',
      }} className="nav-top">
        <a href="https://hub-phi-blush.vercel.app" style={{ color: 'var(--faint)', textDecoration: 'none', fontSize: 12, marginRight: 16 }}>← hub</a>
        <span style={{ fontWeight: 700, marginRight: 'auto', fontSize: 15 }}>Recipe Book</span>
        {links.map(({ to, label, Icon }) => (
          <NavLink key={to} to={to} style={({ isActive }) => ({ ...linkStyle, ...(isActive ? activeStyle : {}) })}>
            <Icon size={15} strokeWidth={2} aria-hidden="true" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Mobile bottom tab bar */}
      <nav style={{
        ...navStyle, bottom: 0, height: 64,
        borderTop: '1px solid var(--border)',
        justifyContent: 'space-around',
      }} className="nav-bottom">
        {links.map(({ to, label, Icon }) => (
          <NavLink key={to} to={to} style={({ isActive }) => ({
            color: 'var(--muted)', textDecoration: 'none',
            flex: 1, textAlign: 'center',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', gap: 3, fontSize: 11, padding: '8px 0',
            ...(isActive ? activeStyle : {}),
          })}>
            <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
            {label}
          </NavLink>
        ))}
      </nav>

      <style>{`
        .nav-top  { display: flex; }
        .nav-bottom { display: none; }
        @media (max-width: 768px) {
          .nav-top  { display: none; }
          .nav-bottom { display: flex; }
        }
      `}</style>
    </>
  )
}
