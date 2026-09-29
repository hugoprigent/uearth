import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { FlatEarthPage } from './pages/FlatEarthPage.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Hash routing: GitHub Pages has no SPA fallback, so /uearth/flat-earth would 404 on reload */}
    <HashRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/flat-earth" element={<FlatEarthPage />} />
      </Routes>
    </HashRouter>
  </StrictMode>,
)
