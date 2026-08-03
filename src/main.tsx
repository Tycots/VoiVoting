// 1. Global Polyfills - Must be imported at the very top for AVM/Algorand wallet SDKs
import { Buffer } from 'buffer'

if (typeof window !== 'undefined') {
  (window as any).Buffer = (window as any).Buffer || Buffer;
  (window as any).global = (window as any).global || window;
}

import React from 'react'
import ReactDOM from 'react-dom/client'
import { WalletProvider } from '@txnlab/use-wallet-react'
import App from './App'
import './index.css'
import { walletManager } from './lib/wallet'

const rootEl = document.getElementById('root')

if (!rootEl) {
  throw new Error('Root element #root was not found')
}

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <WalletProvider manager={walletManager}>
      <App />
    </WalletProvider>
  </React.StrictMode>
)