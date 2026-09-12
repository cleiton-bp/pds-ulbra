import { createRoot, type Root } from 'react-dom/client'
import {
  configFromInit,
  configFromLocation,
  type EmbedConfig,
  shouldWaitForHost,
} from '@/embed/config'
import { EmbedApp } from '@/embed/EmbedApp'
import { connectToHost, type HostConnection, isEmbedded } from '@/embed/hostBridge'
import { resolveWidgetSettings } from '@/embed/resolveSettings'
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
 * **E nada aparece antes da configuracao.** O `iframe` nasce invisivel do lado de
 * la e so e revelado pelo `show`, que roda depois da leitura. E o que faz o
 * rotulo do cliente aparecer ja certo, em vez de "Relatar" trocando para "Fale
 * com a gente" na frente de quem ja estava lendo.
 */
const container = document.getElementById('pds-embed-root')

if (container) {
  const root = createRoot(container)

  // A regra e `shouldWaitForHost`, e ela mora em `config.ts` para poder ser
  // testada: este arquivo roda no `import` e nao da para exercitar.
  if (shouldWaitForHost(window.location.search, isEmbedded())) {
    const host = connectToHost((message) => {
      void draw(root, configFromInit(message), host)
    })
  } else {
    // Chave na barra, ou nem pagina hospedeira: os dois casos desenham o
    // formulario direto, sem gatilho e sem redimensionar nada.
    void draw(root, configFromLocation(window.location.search), null)
  }
}

async function draw(root: Root, config: EmbedConfig, host: HostConnection | null): Promise<void> {
  const settings = await resolveWidgetSettings(config.key)

  // Chave que nao vale: nao ha projeto, e nao ha o que abrir.
  if (!settings) return

  if (!settings.IsEnabled) {
    // Dentro de uma pagina, desligada quer dizer **sumir**: o quadro nunca e
    // revelado, e o site do cliente fica como se o script nao estivesse la.
    if (host) return

    // Aberto direto — e o que o painel faz no relato de teste —, sumir deixaria
    // um retangulo branco sem explicacao. Aqui a resposta e dizer o que houve.
    root.render(<DisabledNotice />)
    return
  }

  root.render(<EmbedApp settings={settings} config={config} host={host} />)

  // Um quadro de espera antes de revelar: `render` e assincrono, e mandar o
  // `show` no mesmo tique mostraria a caixa vazia por um instante.
  if (host) requestAnimationFrame(() => host.show(settings.Position))
}

/**
 * So aparece para quem abre `embed.html` na mao, com a ferramenta desligada. No
 * site do cliente este caminho nao existe: la o quadro simplesmente nao aparece.
 */
function DisabledNotice() {
  return (
    <div className="flex h-full items-center justify-center p-6 text-center">
      <p className="text-detail text-fg-muted leading-relaxed">
        A ferramenta de relato está desligada para este projeto. Ligue de novo em Ferramenta, nas
        configurações do projeto.
      </p>
    </div>
  )
}
