import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills() // Standardizes Buffer and global across wallet providers
  ],
  base: '/VoiVoting/' // Required for GitHub Pages asset routing
})