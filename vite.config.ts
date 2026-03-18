import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/bfc-sunday-ops/',
  plugins: [react()],
})
