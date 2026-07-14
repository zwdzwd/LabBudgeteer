import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

// Self-contained build: one double-clickable HTML file with the app and the
// current budget events baked in, viewable from file:// with no server.
// The output embeds real data when budget_events.local.txt exists, so
// dist-single/ is gitignored; keep the file private.
function inlineBudgetEvents(): Plugin {
  return {
    name: 'inline-budget-events',
    transformIndexHtml(html) {
      const dir = fileURLToPath(new URL('./public', import.meta.url))
      const local = `${dir}/budget_events.local.txt`
      const fallback = `${dir}/budget_events.txt`
      const source = existsSync(local) ? local : fallback
      const text = readFileSync(source, 'utf8')
      // <-escape so a "</script>" in the data cannot break out of the tag.
      const payload = JSON.stringify(text).replace(/</g, '\\u003c')
      return {
        html,
        tags: [
          {
            tag: 'script',
            children: `window.__EMBEDDED_BUDGET_EVENTS__ = ${payload}`,
            injectTo: 'head-prepend' as const,
          },
        ],
      }
    },
  }
}

export default defineConfig({
  base: './',
  plugins: [react(), viteSingleFile(), inlineBudgetEvents()],
  build: {
    outDir: 'dist-single',
    copyPublicDir: false,
  },
})
