import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@xyflow/react/dist/style.css'
// O comum primeiro; o de cada ambiente vale so dentro dele (ver o topo de cada arquivo).
import './shared/base.css'
import './shell/home.css'
import './modeling/styles.css'
import Shell from './shell/Shell'

const container = document.getElementById('root')
if (!container) throw new Error('elemento #root não encontrado')

createRoot(container).render(
  <StrictMode>
    <Shell />
  </StrictMode>,
)
