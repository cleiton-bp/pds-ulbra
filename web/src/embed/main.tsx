import { createRoot } from 'react-dom/client'
import { configFromLocation } from '@/embed/config'
import { EmbedApp } from '@/embed/EmbedApp'
import { DEFAULT_WIDGET_SETTINGS } from '@/embed/settings'
import '@/styles/index.css'

/**
 * A entrada do quadro. Documento proprio, e nao uma rota do painel: o que roda
 * dentro do site de um cliente nao pode carregar roteador, sessao nem tela de
 * administracao junto.
 *
 * A configuracao ainda vem dos padroes; no pds-014 ela passa a ser lida pela
 * chave publica, e so este arquivo muda.
 */
const container = document.getElementById('pds-embed-root')

if (container) {
  createRoot(container).render(
    <EmbedApp
      settings={DEFAULT_WIDGET_SETTINGS}
      config={configFromLocation(window.location.search)}
    />,
  )
}
