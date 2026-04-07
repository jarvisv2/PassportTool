import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import viteTsConfigPaths from 'vite-tsconfig-paths'
import tailwindcss from '@tailwindcss/vite'

const config = defineConfig({
  base: '/PassportTool/',
  plugins: [
    viteTsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    tailwindcss(),
    // Remove Netlify, add prerender settings
    tanstackStart({
      prerender: {
        routes: ['/'],
        crawlLinks: true
      }
    }),
    viteReact(),
  ],
})

export default config
