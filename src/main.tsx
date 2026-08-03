// 1. Global Polyfills - Must be imported at the very top for AVM/Algorand wallet SDKs
import { Buffer } from 'buffer'

if (typeof window !== 'undefined') {
  (window as any).Buffer = (window as any).Buffer || Buffer;
  (window as any).global = (window as any).global || window;
}

import React from 'react'
import ReactDOM from 'react-dom/client'
import { NetworkId, WalletManager, WalletId } from '@txnlab/use-wallet'
import { WalletProvider } from '@txnlab/use-wallet-react'
import App from './App'
import './index.css'

// 2. Initialize WalletManager with v4 AlgodConfig property names
const walletManager = new WalletManager({
  wallets: [
    WalletId.KIBISIS,
    WalletId.LUTE,
    WalletId.PERA,
    WalletId.DEFLY,
  ],
  networks: {
    [NetworkId.MAINNET]: {
      algod: {
        baseServer: 'https://mainnet-api.voi.nodly.io',
        port: '',
        token: '',
      },
    },
  },
  defaultNetwork: NetworkId.MAINNET,
})

// 3. Mount App wrapped inside WalletProvider
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <WalletProvider manager={walletManager}>
      <App />
    </WalletProvider>
  </React.StrictMode>
)