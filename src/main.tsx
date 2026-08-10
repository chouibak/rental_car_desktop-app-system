import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { LangProvider } from './context/LangContext'
import { LicenseGate } from './components/LicenseGate'
import './index.css'
import './types'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LangProvider>
      <HashRouter>
        <LicenseGate>
          <App />
        </LicenseGate>
      </HashRouter>
    </LangProvider>
  </React.StrictMode>,
)
