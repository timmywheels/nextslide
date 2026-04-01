import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import LandingPage from './pages/LandingPage'
import PresenterPage from './pages/PresenterPage'
import AudiencePage from './pages/AudiencePage'

const root = document.getElementById('root')
if (!root) throw new Error('Root element not found')

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/presenter/:code" element={<PresenterPage />} />
        <Route path="/s/:code" element={<AudiencePage />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
)
