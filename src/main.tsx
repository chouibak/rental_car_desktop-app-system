import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { LangProvider } from './context/LangContext'
import { ToastProvider } from './context/ToastContext'
import { LicenseGate } from './components/LicenseGate'
import { AuthGate } from './components/AuthGate'
import './index.css'
import './types'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LangProvider>
      <ToastProvider>
        <HashRouter>
          <LicenseGate>
            <AuthGate>
              <App />
            </AuthGate>
          </LicenseGate>
        </HashRouter>
      </ToastProvider>
    </LangProvider>
  </React.StrictMode>,
)
