import { useState } from 'react'
import { useWallet, type Wallet } from '@txnlab/use-wallet-react'
import { WALLETCONNECT_PROJECT_ID } from '../config'

function truncateAddress(address: string) {
  return `${address.slice(0, 8)}…${address.slice(-6)}`
}

function WalletOption({ wallet, onConnected }: { wallet: Wallet; onConnected: () => void }) {
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleConnect = async () => {
    setConnecting(true)
    setError(null)
    try {
      await wallet.connect()
      onConnected()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to connect wallet'
      setError(message)
      console.error(`[wallet] ${wallet.metadata.name} connect failed:`, err)
    } finally {
      setConnecting(false)
    }
  }

  return (
    <div className="wallet-option">
      <button
        className="btn btn-primary btn-sm"
        disabled={connecting}
        onClick={() => void handleConnect()}
      >
        {connecting ? 'Connecting…' : wallet.metadata.name}
      </button>
      {error && <p className="wallet-error">{error}</p>}
    </div>
  )
}

export function WalletButton() {
  const { activeWallet, activeAddress, wallets, isReady } = useWallet()
  const [menuOpen, setMenuOpen] = useState(false)

  if (!isReady) {
    return (
      <button className="btn btn-secondary" disabled type="button">
        Loading wallets…
      </button>
    )
  }

  if (activeAddress && activeWallet) {
    return (
      <div className="wallet-connected">
        <span className="wallet-badge">{activeWallet.metadata.name}</span>
        <code>{truncateAddress(activeAddress)}</code>
        <button
          className="btn btn-secondary btn-sm"
          type="button"
          onClick={() => void activeWallet.disconnect()}
        >
          Disconnect
        </button>
      </div>
    )
  }

  if (wallets.length === 0) {
    return (
      <p className="wallet-hint">
        Set <code>VITE_WALLETCONNECT_PROJECT_ID</code> to enable wallet connect.
      </p>
    )
  }

  return (
    <div className="wallet-picker">
      <button
        className="btn btn-primary"
        type="button"
        onClick={() => setMenuOpen((open) => !open)}
      >
        Connect Wallet
      </button>
      {menuOpen && (
        <div className="wallet-menu">
          {wallets.map((wallet) => (
            <WalletOption
              key={wallet.walletKey}
              wallet={wallet}
              onConnected={() => setMenuOpen(false)}
            />
          ))}
          {!WALLETCONNECT_PROJECT_ID && (
            <p className="wallet-hint">
              Install the Defly browser extension, or add a WalletConnect project ID for mobile
              Voi Wallet.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
