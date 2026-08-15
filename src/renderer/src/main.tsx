import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { AppProviders } from './app/AppProviders'
import './shared/i18n'
import { installBrowserPreviewApi } from './shared/api/browser-preview'

installBrowserPreviewApi()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders>
      <App />
    </AppProviders>
  </StrictMode>
)
