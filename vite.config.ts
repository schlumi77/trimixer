import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command }) => {
  const isBuild = command === 'build';
  return {
    base: isBuild ? '/trimixer/' : '/',
    plugins: [
      react()
    ],
  };
})
