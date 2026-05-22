import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { setNativeFetch } from '@shared/net/fetch'
import './lib/i18n'
import App from './App'
import { api } from './lib/ipc'
import './styles/globals.css'

// Route shared-side HTTP through the platform fetcher (Rust on desktop,
// browser fetch on web). Must run before any code path that may import
// arxiv pages or hit web_fetch.
setNativeFetch((req) => api.net.fetch(req))

// Add dark class to html element
document.documentElement.classList.add('dark')

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 5000,
    },
  },
})

ReactDOM.createRoot(document.getElementById('app')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
)
