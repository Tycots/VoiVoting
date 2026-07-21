import { Link, Outlet, useLocation } from 'react-router-dom'
import { APP_ADDRESS, APP_ID } from '../config'
import { WalletButton } from './WalletButton'

export function Layout() {
  const location = useLocation()

  const navClass = (path: string) =>
    location.pathname === path ? 'nav-link active' : 'nav-link'

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">V</span>
          <div>
            <h1>Voi Council Voting</h1>
            <p className="brand-sub">On-chain governance for council members</p>
          </div>
        </div>
        <WalletButton />
      </header>

      <nav className="app-nav">
        <Link to="/" className={navClass('/')}>Overview</Link>
        <Link to="/admin" className={navClass('/admin')}>Admin</Link>
        <Link to="/vote" className={navClass('/vote')}>Vote</Link>
      </nav>

      <section className="contract-banner">
        <div>
          <span className="label">App ID</span>
          <strong>{APP_ID}</strong>
        </div>
        <div>
          <span className="label">App Address</span>
          <code>{APP_ADDRESS.slice(0, 12)}…{APP_ADDRESS.slice(-8)}</code>
        </div>
        <div>
          <span className="label">Network</span>
          <strong>Voi Mainnet</strong>
        </div>
      </section>

      <main className="app-main">
        <Outlet />
      </main>
    </div>
  )
}
