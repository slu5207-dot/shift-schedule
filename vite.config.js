import process from 'node:process'
import { defineConfig, loadEnv } from 'vite'
import { assertSafePreview } from './src/firebaseConfig.js'
import react from '@vitejs/plugin-react'
import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  const isPreview = env.VERCEL_ENV === 'preview'
    || env.VERCEL === '1' && env.VERCEL_ENV !== 'production';
  if (isPreview) assertSafePreview(env);
  return {
    plugins: [react()],
    css: {
      postcss: {
        plugins: [
          tailwindcss({
            // 直接在這裡告訴它要去哪裡找檔案
            content: [
              "./index.html",
              "./src/**/*.{js,ts,jsx,tsx}",
            ],
            theme: {
              extend: {},
            },
            plugins: [],
          }),
          autoprefixer(),
        ],
      },
    },
  }
})
