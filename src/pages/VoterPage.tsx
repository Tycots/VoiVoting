import { useMemo, useState } from 'react'
import { useWallet } from '@txnlab/use-wallet-react'
import { VOTE_TYPES } from '../config'
import { useGovernance } from '../hooks/useGovernance'
import {
  castVote,
  evaluateExpiration,
  explorerTxUrl,
  hasVoted,
  truncateAddress,
} from '../lib/contract'

export function VoterPage() {
  const { activeAddress, transactionSigner } = useWallet()
  const { globalState, proposals, loading, refresh } = useGovernance()
  const [busySlot, setBusySlot] = useState<number | null>(null)
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const voterIndex = useMemo(() => {
    if (!activeAddress || !globalState) return -1
    return globalState.whitelist.findIndex((addr) => addr === activeAddress)
  }, [activeAddress, globalState])

  const isWhitelisted = voterIndex >= 0
  const activeProposals = proposals.filter((p) => p.active)
  const now = Math.floor(Date.now() / 1000)

  const submitVote = async (slot: number, voteType: number) => {
    if (!activeAddress) return
    setBusySlot(slot)
    setMessage(null)
    try {
      const txId = await castVote(slot, voteType, activeAddress, transactionSigner)
      const label = voteType === VOTE_TYPES.YEA ? 'Yea' : voteType === VOTE_TYPES.NAY ? 'Nay' : 'Abstain'
      setMessage({ type: 'ok', text: `Cast ${label} on slot ${slot}. Tx: ${txId}` })
      await refresh()
    } catch (err) {
      setMessage({ type: 'err', text: err instanceof Error ? err.message : 'Vote failed' })
    } finally {
      setBusySlot(null)
    }
  }

  const finalizeExpired = async (slot: number) => {
    if (!activeAddress) return
    setBusySlot(slot)
    setMessage(null)
    try {
      const txId = await evaluateExpiration(slot, activeAddress, transactionSigner)
      setMessage({ type: 'ok', text: `Finalized expired proposal in slot ${slot}. Tx: ${txId}` })
      await refresh()
    } catch (err) {
      setMessage({ type: 'err', text: err instanceof Error ? err.message : 'Finalization failed' })
    } finally {
      setBusySlot(null)
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <h2>Vote</h2>
        <p>Whitelisted council wallets can cast one vote per active proposal.</p>
      </header>

      {!activeAddress && (
        <p className="alert alert-warn">Connect a whitelisted wallet to vote.</p>
      )}
      {activeAddress && !loading && !isWhitelisted && (
        <p className="alert alert-warn">
          {truncateAddress(activeAddress)} is not on the whitelist.
        </p>
      )}
      {activeAddress && isWhitelisted && (
        <p className="alert alert-ok">You are whitelisted (index {voterIndex}).</p>
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

      {activeProposals.length === 0 ? (
        <article className="card">
          <p className="hint">No active proposals right now. Check back after an admin opens one.</p>
        </article>
      ) : (
        <div className="proposal-grid">
          {activeProposals.map((proposal) => {
            const expired = now > proposal.expiration
            const voted = isWhitelisted && hasVoted(proposal, voterIndex)
            const totalVotes = proposal.yea + proposal.nay + proposal.abstain
            const whitelistSize = globalState?.whitelist.length ?? 0

            return (
              <article key={proposal.slot} className="card proposal-card">
                <div className="proposal-head">
                  <strong>Proposal #{proposal.proposalId}</strong>
                  <span className="pill">Slot {proposal.slot}</span>
                </div>

                <div className="tally">
                  <span className="yea">Yea {proposal.yea}</span>
                  <span className="nay">Nay {proposal.nay}</span>
                  <span>Abstain {proposal.abstain}</span>
                </div>

                <p className="hint">
                  {expired
                    ? `Voting ended ${new Date(proposal.expiration * 1000).toLocaleString()}`
                    : `Voting open until ${new Date(proposal.expiration * 1000).toLocaleString()}`}
                </p>
                <p className="hint">{totalVotes} / {whitelistSize} votes cast</p>

                {expired ? (
                  <button
                    className="btn btn-secondary"
                    disabled={!activeAddress || busySlot !== null}
                    onClick={() => void finalizeExpired(proposal.slot)}
                  >
                    {busySlot === proposal.slot ? 'Submitting…' : 'Finalize Expired Proposal'}
                  </button>
                ) : voted ? (
                  <p className="status">You already voted on this proposal.</p>
                ) : (
                  <div className="vote-actions">
                    <button
                      className="btn btn-yea"
                      disabled={!isWhitelisted || busySlot !== null}
                      onClick={() => void submitVote(proposal.slot, VOTE_TYPES.YEA)}
                    >
                      Yea
                    </button>
                    <button
                      className="btn btn-nay"
                      disabled={!isWhitelisted || busySlot !== null}
                      onClick={() => void submitVote(proposal.slot, VOTE_TYPES.NAY)}
                    >
                      Nay
                    </button>
                    <button
                      className="btn btn-secondary"
                      disabled={!isWhitelisted || busySlot !== null}
                      onClick={() => void submitVote(proposal.slot, VOTE_TYPES.ABSTAIN)}
                    >
                      Abstain
                    </button>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
