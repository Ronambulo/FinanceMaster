import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Bloquea el pinch-zoom en iOS Safari — el viewport meta (user-scalable=no)
// y touch-action:pan-x/pan-y ya lo cubren en la mayoría de navegadores, pero
// Safari sigue disparando gestos de pellizco que hay que cancelar a mano.
document.addEventListener('gesturestart', e => e.preventDefault())
document.addEventListener('gesturechange', e => e.preventDefault())

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
