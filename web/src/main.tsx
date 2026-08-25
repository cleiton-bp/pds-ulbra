import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { router } from '@/app/routes'
import { Toaster } from '@/shared/components/Toaster'
import { TooltipProvider } from '@/shared/components/Tooltip'
import '@/styles/index.css'

const container = document.getElementById('root')
if (!container) throw new Error('Elemento #root nao encontrado no index.html.')

createRoot(container).render(
  <StrictMode>
    <TooltipProvider>
      <RouterProvider router={router} />
      <Toaster />
    </TooltipProvider>
  </StrictMode>,
)
