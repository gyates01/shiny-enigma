import { NavLink } from 'react-router-dom'

const links = [
  { to: '/recipes', label: 'Recipes' },
  { to: '/add',     label: '+ Add'  },
  { to: '/stats',   label: 'Stats'  },
]

const navStyle = {
  position: 'fixed', left: 0, right: 0, zIndex: 100,
  background: '#111', borderColor: '#2a2a2a',
  display: 'flex', alignItems: 'center', gap: 4,
}

const activeStyle = { color: '#7c6af7', fontWeight: 700 }
const linkStyle = { color: '#888', textDecoration: 'none', padding: '12px 16px', fontSize: 14 }

export default function Nav() {
  return (
    <>
      {/* Desktop top nav */}
      <nav style={{
        ...navStyle, top: 0, height: 56,
        borderBottom: '1px solid #2a2a2a',
        padding: '0 24px',
      }} className="nav-top">
        <span style={{ fontWeight: 700, marginRight: 'auto', fontSize: 15 }}>Recipe Book</span>
        {links.map(({ to, label }) => (
          <NavLink key={to} to={to} style={({ isActive }) => ({ ...linkStyle, ...(isActive ? activeStyle : {}) })}>
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Mobile bottom tab bar */}
      <nav style={{
        ...navStyle, bottom: 0, height: 64,
        borderTop: '1px solid #2a2a2a',
        justifyContent: 'space-around',
      }} className="nav-bottom">
        {links.map(({ to, label }) => (
          <NavLink key={to} to={to} style={({ isActive }) => ({
            ...linkStyle, flex: 1, textAlign: 'center',
            ...(isActive ? activeStyle : {}),
          })}>
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
