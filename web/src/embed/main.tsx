import { createRoot } from 'react-dom/client'
import { configFromInit, configFromLocation, shouldWaitForHost } from '@/embed/config'
import { EmbedApp } from '@/embed/EmbedApp'
import { connectToHost, isEmbedded } from '@/embed/hostBridge'
import { DEFAULT_WIDGET_SETTINGS } from '@/embed/settings'
import '@/styles/index.css'

/**
 * A entrada do quadro. Documento proprio, e nao uma rota do painel: o que roda
 * dentro do site de um cliente nao pode carregar roteador, sessao nem tela de
 * administracao junto.
 *
 * A ordem aqui importa. **O ouvinte da pagina entra antes de montar React**,
 * porque o carregador manda o `init` assim que o quadro carrega — montar
 * primeiro abriria uma janela em que a mensagem chega sem ninguem escutando.
 *
 * A configuracao ainda vem dos padroes; no pds-014 ela passa a ser lida pela
 * chave publica, e so este arquivo muda.
 */
const container = document.getElementById('pds-embed-root')

if (container) {
  const root = createRoot(container)
  // A regra e `shouldWaitForHost`, e ela mora em `config.ts` para poder ser
  // testada: este arquivo roda no `import` e nao da para exercitar.
  if (shouldWaitForHost(window.location.search, isEmbedded())) {
    const host = connectToHost((message) => {
      root.render(
        <EmbedApp
          settings={DEFAULT_WIDGET_SETTINGS}
          config={configFromInit(message)}
          host={host}
        />,
      )
    })
  } else {
    // Chave na barra, ou nem pagina hospedeira: os dois casos desenham o
    // formulario direto, sem gatilho e sem redimensionar nada.
    root.render(
      <EmbedApp
        settings={DEFAULT_WIDGET_SETTINGS}
        config={configFromLocation(window.location.search)}
      />,
    )
  }
}
