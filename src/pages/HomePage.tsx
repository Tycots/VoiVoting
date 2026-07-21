import { Link } from 'react-router-dom'
import { useGovernance } from '../hooks/useGovernance'
import { truncateAddress } from '../lib/contract'

export function HomePage() {
  const { globalState, proposals, loading, error } = useGovernance()
  const activeProposals = proposals.filter((p) => p.active)

  return (
    <div className="page">
      <header className="page-header">
        <h2>Overview</h2>
        <p>Connect a Voi-compatible wallet to administer proposals or cast votes.</p>
      </header>

      {loading && <p className="status">Loading contract state…</p>}
      {error && <p className="alert alert-error">{error}</p>}

      {globalState && (
        <div className="grid two-col">
          <article className="card">
            <h3>Contract Admin</h3>
            <p className="mono">{globalState.admin ? truncateAddress(globalState.admin) : 'Unknown'}</p>
            <p className="hint">Only this wallet can update the whitelist and start proposals.</p>
          </article>

          <article className="card">
            <h3>Whitelisted Voters</h3>
            <p className="stat">{globalState.whitelist.length} / 10 wallets</p>
            {globalState.whitelist.length === 0 ? (
              <p className="hint">No voters whitelisted yet.</p>
            ) : (
              <ul className="address-list">
                {globalState.whitelist.map((addr) => (
                  <li key={addr}><code>{truncateAddress(addr)}</code></li>
                ))}
              </ul>
            )}
          </article>
        </div>
      )}

      <article className="card">
        <h3>Active Proposals</h3>
        {activeProposals.length === 0 ? (
          <p className="hint">No proposals are currently open for voting.</p>
        ) : (
          <div className="proposal-grid">
            {activeProposals.map((p) => (
              <div key={p.slot} className="proposal-card">
                <div className="proposal-head">
                  <strong>Proposal #{p.proposalId}</strong>
                  <span className="pill">Slot {p.slot}</span>
                </div>
                <div className="tally">
                  <span>Yea {p.yea}</span>
                  <span>Nay {p.nay}</span>
                  <span>Abstain {p.abstain}</span>
                </div>
                <p className="hint">Expires {new Date(p.expiration * 1000).toLocaleString()}</p>
              </div>
            ))}
          </div>
        )}
      </article>

      <div className="cta-row">
        <Link to="/admin" className="btn btn-primary">Admin Panel</Link>
        <Link to="/vote" className="btn btn-secondary">Cast a Vote</Link>
      </div>
    </div>
  )
}
