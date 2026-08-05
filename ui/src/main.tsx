import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from 'next-themes'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <MemoryRouter initialEntries={['/cut-video']}>
        <App />
      </MemoryRouter>
    </ThemeProvider>
  </StrictMode>,
)
