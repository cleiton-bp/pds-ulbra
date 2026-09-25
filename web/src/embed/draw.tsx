import type { Root } from 'react-dom/client'
import type { EmbedConfig } from '@/embed/config'
import { EmbedApp } from '@/embed/EmbedApp'
import type { HostConnection } from '@/embed/hostBridge'
import { resolveMediaSettings } from '@/embed/resolveMediaSettings'
import { resolveWidgetSettings } from '@/embed/resolveSettings'

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
  // As duas leituras saem juntas: a de midia nao pode atrasar o quadro aparecer. E
  // ela nunca falha para fora — sem resposta, o quadro so nao oferece anexo.
  const [settings, media] = await Promise.all([
    resolveWidgetSettings(config.key, config.origin),
    resolveMediaSettings(config.key, config.origin),
  ])

  // Recusado: ou a chave nao vale, ou esta pagina nao esta na lista de enderecos
  // autorizados do projeto. Nao ha o que abrir, e o quadro nunca e revelado —
  // entao o site fica como se o script nao estivesse la.
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

  root.render(<EmbedApp settings={settings} config={config} host={host} media={media} />)

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
