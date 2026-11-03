import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initBrowserStorageMock } from './mockBackend'

// Initialize browser storage fallback for Netlify & static deployments
initBrowserStorageMock();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
