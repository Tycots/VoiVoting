import { useMemo, useState, type FormEvent } from 'react'
import { useWallet } from '@txnlab/use-wallet-react'
import { MAX_SLOTS, MAX_WHITELIST } from '../config'
import { useGovernance } from '../hooks/useGovernance'
import {
  explorerTxUrl,
  initializeProposal,
  truncateAddress,
  updateWhitelist,
} from '../lib/contract'

export function AdminPage() {
  const { activeAddress, transactionSigner } = useWallet()
  const { globalState, proposals, loading, refresh } = useGovernance()

  const [whitelistInput, setWhitelistInput] = useState('')
  const [slot, setSlot] = useState(0)
  const [proposalId, setProposalId] = useState('')
  const [durationHours, setDurationHours] = useState('24')
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const isAdmin = useMemo(
    () => Boolean(activeAddress && globalState?.admin === activeAddress),
    [activeAddress, globalState?.admin],
  )

  const availableSlots = useMemo(
    () =>
      proposals
        .map((p, index) => ({ slot: index, active: p.active }))
        .filter((p) => !p.active)
        .map((p) => p.slot),
    [proposals],
  )

  const syncWhitelistInput = () => {
    if (globalState?.whitelist.length) {
      setWhitelistInput(globalState.whitelist.join('\n'))
    }
  }

  const handleWhitelist = async (event: FormEvent) => {
    event.preventDefault()
    if (!activeAddress) return

    const addresses = whitelistInput
      .split(/[\n,]+/)
      .map((a) => a.trim())
      .filter(Boolean)

    if (addresses.length > MAX_WHITELIST) {
      setMessage({ type: 'err', text: `Whitelist cannot exceed ${MAX_WHITELIST} wallets.` })
      return
    }

    for (const addr of addresses) {
      if (!/^[A-Z2-7]{58}$/.test(addr)) {
        setMessage({ type: 'err', text: `Invalid address: ${addr}` })
        return
      }
    }

    setBusy('whitelist')
    setMessage(null)
    try {
      const txId = await updateWhitelist(addresses, activeAddress, transactionSigner)
      setMessage({ type: 'ok', text: `Whitelist updated. Tx: ${txId}` })
      await refresh()
    } catch (err) {
      setMessage({ type: 'err', text: err instanceof Error ? err.message : 'Update failed' })
    } finally {
      setBusy(null)
    }
  }

  const handleStartProposal = async (event: FormEvent) => {
    event.preventDefault()
    if (!activeAddress) return

    const id = Number(proposalId)
    const hours = Number(durationHours)
    if (!Number.isFinite(id) || id <= 0) {
      setMessage({ type: 'err', text: 'Proposal ID must be a positive number.' })
      return
    }
    if (!Number.isFinite(hours) || hours <= 0) {
      setMessage({ type: 'err', text: 'Duration must be greater than zero.' })
      return
    }

    setBusy('proposal')
    setMessage(null)
    try {
      const txId = await initializeProposal(
        slot,
        id,
        Math.round(hours * 3600),
        activeAddress,
        transactionSigner,
      )
      setMessage({ type: 'ok', text: `Proposal started in slot ${slot}. Tx: ${txId}` })
      setProposalId('')
      await refresh()
    } catch (err) {
      setMessage({ type: 'err', text: err instanceof Error ? err.message : 'Failed to start proposal' })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <h2>Admin Panel</h2>
        <p>Manage the voter whitelist and open new proposals. Requires the contract admin wallet.</p>
      </header>

      {!activeAddress && (
        <p className="alert alert-warn">Connect your wallet to use admin actions.</p>
      )}
      {activeAddress && !loading && !isAdmin && (
        <p className="alert alert-warn">
          Connected wallet is not the admin ({globalState?.admin ? truncateAddress(globalState.admin) : 'unknown'}).
        </p>
      )}

      {message && (
        <p className={`alert ${message.type === 'ok' ? 'alert-ok' : 'alert-error'}`}>
          {message.text}
          {message.type === 'ok' && message.text.includes('Tx:') && (
            <>
              {' '}
              <a
                href={explorerTxUrl(message.text.split('Tx: ')[1] ?? '')}
                target="_blank"
                rel="noreferrer"
              >
                View on explorer
              </a>
            </>
          )}
        </p>
      )}

      <div className="grid two-col">
        <article className="card">
          <h3>Update Whitelist</h3>
          <p className="hint">Replace the full whitelist (max {MAX_WHITELIST} addresses, one per line).</p>
          <form onSubmit={(e) => void handleWhitelist(e)}>
            <textarea
              rows={8}
              value={whitelistInput}
              onChange={(e) => setWhitelistInput(e.target.value)}
              placeholder="VOI wallet addresses…"
              disabled={!isAdmin || busy !== null}
            />
            <div className="form-actions">
              <button type="button" className="btn btn-secondary btn-sm" onClick={syncWhitelistInput}>
                Load current
              </button>
              <button type="submit" className="btn btn-primary" disabled={!isAdmin || busy !== null}>
                {busy === 'whitelist' ? 'Submitting…' : 'Save Whitelist'}
              </button>
            </div>
          </form>
        </article>

        <article className="card">
          <h3>Start Proposal</h3>
          <p className="hint">
            Pick an open slot (0–{MAX_SLOTS - 1}). Duration is measured in hours from now.
          </p>
          <form onSubmit={(e) => void handleStartProposal(e)}>
            <label>
              Slot
              <select
                value={slot}
                onChange={(e) => setSlot(Number(e.target.value))}
                disabled={!isAdmin || busy !== null}
              >
                {Array.from({ length: MAX_SLOTS }, (_, i) => (
                  <option key={i} value={i}>
                    Slot {i}{availableSlots.includes(i) ? ' (open)' : ' (in use)'}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Proposal ID
              <input
                type="number"
                min={1}
                value={proposalId}
                onChange={(e) => setProposalId(e.target.value)}
                placeholder="e.g. 1001"
                disabled={!isAdmin || busy !== null}
              />
            </label>
            <label>
              Duration (hours)
              <input
                type="number"
                min={0.01}
                step={0.25}
                value={durationHours}
                onChange={(e) => setDurationHours(e.target.value)}
                disabled={!isAdmin || busy !== null}
              />
            </label>
            <button type="submit" className="btn btn-primary" disabled={!isAdmin || busy !== null}>
              {busy === 'proposal' ? 'Submitting…' : 'Initialize Proposal'}
            </button>
          </form>
        </article>
      </div>
    </div>
  )
}
