import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base must match the GitHub Pages repo path so assets resolve at
// https://<user>.github.io/LabBudgeteer/
export default defineConfig({
  base: '/LabBudgeteer/',
  plugins: [react()],
})
