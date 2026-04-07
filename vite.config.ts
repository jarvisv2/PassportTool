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
    tanstackStart({
      prerender: {
        enabled: true, // THIS IS THE MAGIC FLAG WE MISSED
        routes: ['/', '/PassportTool/'], // Added the base path here to be completely safe
        crawlLinks: true
      }
    }),
    viteReact(),
  ],
})

export default config
