import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { AppProvider } from './state/AppContext.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { reportEnvironment } from './lib/env.js'
import './styles/index.css'

// Shout about a half-configured deploy at start-up rather than letting it fail
// quietly for a real family later.
reportEnvironment()

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AppProvider>
        <App />
      </AppProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)
