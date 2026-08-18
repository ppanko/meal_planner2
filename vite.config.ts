import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// A relative base lets the same build work on GitHub Pages project sites
// (username.github.io/repository/) without hard-coding the repository name.
export default defineConfig({
  base: './',
  plugins: [react()],
})
