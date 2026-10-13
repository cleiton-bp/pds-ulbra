import { flushSync } from 'react-dom'
import type { Root } from 'react-dom/client'
import type { EmbedConfig } from '@/embed/config'
import { EmbedApp } from '@/embed/EmbedApp'
import type { HostConnection } from '@/embed/hostBridge'
import { launcherMode } from '@/embed/launcher'
import type { PreviewMessage } from '@/embed/protocol'
import { resolveMediaSettings } from '@/embed/resolveMediaSettings'
import { resolveWidgetSettings } from '@/embed/resolveSettings'
import { DEFAULT_WIDGET_SETTINGS } from '@/embed/settings'

/**
 * Quanto o quadro espera pela leitura de midia **depois** de a configuracao chegar.
 *
 * As duas saem juntas e chegam juntas — sao a mesma API. Passar disto ja e a leitura
 * de midia presa, e sem prazo ela prendia o quadro inteiro: ele nunca aparecia, nem
 * para o relato so em texto. Com o prazo, abre sem anexo, que e o que ele faz quando
 * essa leitura falha.
 */
export const MEDIA_GRACE_MS = 3_000

/**
 * Le a configuracao, desenha o quadro e so entao pede a pagina que o revele.
 *
 * Mora aqui, e nao em `main.tsx`, para poder ser testado: `main.tsx` roda no
 * `import`.
 */
export async function draw(
  root: Root,
  config: EmbedConfig,
  host: HostConnection | null,
): Promise<void> {
  // As duas leituras saem juntas. A de midia nunca falha para fora — sem resposta,
  // o quadro so nao oferece anexo —, e so atrasa o quadro o tanto que for mais lenta
  // que a outra, ate o prazo.
  const lendoMidia = resolveMediaSettings(config.key, config.origin)
  const settings = await resolveWidgetSettings(config.key, config.origin)

  // Recusado: ou a chave nao vale, ou esta pagina nao esta na lista de enderecos
  // autorizados do projeto. Nao ha o que abrir, e o quadro nunca e revelado —
  // entao o site fica como se o script nao estivesse la. Com o botao da pagina, ela
  // estava mostrando "abrindo", e precisa saber que nao vai abrir.
  if (!settings) {
    if (host?.hostDrawsLauncher) host.unavailable?.()
    return
  }

  if (!settings.IsEnabled) {
    // Dentro de uma pagina, desligada quer dizer **sumir**: o quadro nunca e
    // revelado, e o site do cliente fica como se o script nao estivesse la.
    if (host) {
      if (host.hostDrawsLauncher) host.unavailable?.()
      return
    }

    // Aberto direto — e o que o painel faz no relato de teste —, sumir deixaria
    // um retangulo branco sem explicacao. Aqui a resposta e dizer o que houve.
    root.render(<DisabledNotice />)
    return
  }

  // Uma das paginas em que o cliente esconde o botao, ou o celular com o botao
  // escondido: o quadro nunca e revelado, como na ferramenta desligada. **So dentro de
  // uma pagina** — aberto direto, nao ha pagina do cliente para esconder nada. **E so
  // com o botao do quadro**: com o da pagina, quem esconde e o carregador, e o quadro
  // so existe porque alguem pediu para abrir — pelo botao do proprio cliente, inclusive.
  if (
    host &&
    !host.hostDrawsLauncher &&
    launcherMode(settings, config.route, config.viewportWidth) === 'hidden'
  )
    return

  const media = await dentroDoPrazo(lendoMidia, MEDIA_GRACE_MS)

  // **Desenha de uma vez, e so depois pede para aparecer** — sem esperar o
  // navegador pintar. Revelar antes de o React terminar mostraria a caixa vazia
  // por um instante; o `flushSync` deixa o quadro pronto no DOM, e quando a pagina
  // o revela o navegador pinta o que ja esta la.
  //
  // **Esperar um `requestAnimationFrame` aqui era o defeito.** O quadro nasce
  // invisivel, e o Chrome nao pinta — logo nao roda `requestAnimationFrame` — num
  // quadro invisivel de OUTRO site. No site do cliente, que e sempre outro site, o
  // `show` nunca saia e a ferramenta nunca aparecia. Em `localhost` aparecia,
  // porque o painel e o quadro sao o mesmo site: por isso ninguem viu.
  flushSync(() => {
    root.render(<EmbedApp settings={settings} config={config} host={host} media={media} />)
  })

  // O tamanho e o lugar do botao ja foram ditos a pagina, de dentro do desenho
  // (`place`, em `EmbedApp`): aqui so falta revelar. Com o botao da pagina, o quadro
  // ja nasce no formulario — e e o carregador quem decide quando mostrar.
  if (host?.hostDrawsLauncher) host.expand()
  else host?.show()
}

/**
 * A previa do painel: desenha com a configuracao que chegou, a cada mudanca, e revela
 * o quadro na primeira. **Sem chave, sem pagina e sem leitura** — nada sai daqui.
 *
 * A configuracao vem por cima dos padroes: o painel e da mesma origem, mas um campo que
 * faltasse nao pode derrubar a previa inteira.
 */
export function drawPreview(root: Root, message: PreviewMessage, host: HostConnection): void {
  const { width, height } = message.viewport ?? { width: 0, height: 0 }
  const medida = Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0

  const config: EmbedConfig = {
    key: '',
    route: null,
    origin: null,
    viewport: medida ? `${Math.round(width)}x${Math.round(height)}` : null,
    viewportWidth: medida ? Math.round(width) : null,
  }

  flushSync(() => {
    root.render(
      <EmbedApp
        settings={{ ...DEFAULT_WIDGET_SETTINGS, ...message.settings }}
        config={config}
        host={host}
        media={message.media ?? null}
        preview
        highlight={message.highlight ?? null}
      />,
    )
  })

  if (host.hostDrawsLauncher) host.expand()
  else host.show()
}

/** A leitura, ou `null` se ela nao chegar a tempo. */
function dentroDoPrazo<T>(leitura: Promise<T | null>, ms: number): Promise<T | null> {
  let relogio: ReturnType<typeof setTimeout> | undefined
  const prazo = new Promise<null>((resolve) => {
    relogio = setTimeout(() => resolve(null), ms)
  })
  return Promise.race([leitura, prazo]).finally(() => clearTimeout(relogio))
}

/**
 * So aparece para quem abre `embed.html` na mao, com a ferramenta desligada. No
 * site do cliente este caminho nao existe: la o quadro simplesmente nao aparece.
 */
function DisabledNotice() {
  return (
    <div className="flex h-full items-center justify-center p-6 text-center">
      <p className="text-detail text-fg-muted leading-relaxed">
        A ferramenta de relato está desligada para este projeto. Ligue de novo na tela do botão, em
        Configurar o projeto.
      </p>
    </div>
  )
}
