import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { aquecerAsCascas, aquecerPelosLinks, router } from '@/app/routes'
import { Toaster } from '@/shared/components/Toaster'
import '@/styles/index.css'
import '@/styles/fonts.css'

const container = document.getElementById('root')
if (!container) throw new Error('Elemento #root nao encontrado no index.html.')

createRoot(container).render(
  <StrictMode>
    {/* O provedor das dicas fica na casca do projeto, a unica que as usa (ProjectShell). */}
    <RouterProvider router={router} />
    <Toaster />
  </StrictMode>,
)

aquecerPelosLinks()
aquecerAsCascas()
