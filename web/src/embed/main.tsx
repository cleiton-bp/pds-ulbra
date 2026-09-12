import { createRoot } from 'react-dom/client'
import { configFromInit, configFromLocation } from '@/embed/config'
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

  if (isEmbedded()) {
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
    // `embed.html` aberto na mao: nao ha pagina para conversar, e a barra de
    // endereco diz tudo que o quadro precisa saber.
    root.render(
      <EmbedApp
        settings={DEFAULT_WIDGET_SETTINGS}
        config={configFromLocation(window.location.search)}
      />,
    )
  }
}
