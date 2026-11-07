import * as Dialog from '@radix-ui/react-dialog'
import { type CSSProperties, type ReactNode, useLayoutEffect, useRef, useState } from 'react'
import { environment } from '@/data'
import { Choice } from '@/shared/components/SettingsControls'
import { useMediaQuery } from '@/shared/hooks/useMediaQuery'
import { cn } from '@/shared/lib/cn'

/**
 * O relato de teste, feito **pela propria ferramenta**.
 *
 * A tentacao aqui era o painel mandar um relato direto para a API e chamar isso
 * de teste. Seria mentira em dois lugares: o evento nasceria marcado como vindo
 * do quadro sem ter vindo, e o teste passaria mesmo com o carregador quebrado —
 * que e exatamente o que este passo existe para conferir.
 *
 * Entao o que abre aqui e **uma pagina de mentira do sistema do cliente**
 * (`public/teste-do-botao.html`), com o mesmo carregador e a mesma chave publica que
 * ele cola: o botao aparece no canto e com a aparencia publicada, abre com o
 * "Abrindo…", e o formulario e o de verdade. Se o relato chegar, chegou pelo caminho
 * inteiro.
 *
 * **Na tela inteira, e nao num dialogo.** No dialogo a pagina ficava numa faixa de uns
 * 470px de altura, o formulario mal cabia ao abrir, e o "celular" era uma caixa estreita
 * sem cara de telefone. Agora a pagina ocupa a janela: no computador ela enche o palco, e
 * o tablet e o celular aparecem numa moldura de aparelho, **com a largura exata de um**
 * (768 e 390), em tamanho real; a altura e a do aparelho ate onde a janela deixa, e o
 * tamanho de verdade fica escrito embaixo. So quando nem a largura cabe a moldura diminui,
 * e a legenda diz quanto. No celular de verdade nao ha moldura nem escolha: a pagina ocupa
 * a tela, como no sistema da pessoa.
 *
 * A pagina mora na origem do quadro, ao lado do carregador (`environment.testPageUrl`).
 * O relato do teste continua entrando direto no Trabalho, sem esperar liberacao: a origem
 * do quadro esta entre os enderecos do proprio sistema, que a retencao nao segura.
 *
 * **Quem abre e quem chama**: o botao mora no titulo do passo, que e um `<summary>`, e
 * o dialogo fica fora dele — e quem chama tambem sabe quando ele fecha, para conferir
 * se o relato chegou.
 */
interface TestReportDialogProps {
  publicKey: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

type Aparelho = 'computer' | 'tablet' | 'phone'

/** As telas de referencia: um tablet em pe e um celular comum, com a moldura de cada um. */
const APARELHOS = {
  tablet: { largura: 768, altura: 1024, moldura: 14 },
  phone: { largura: 390, altura: 844, moldura: 10 },
} as const

/** A linha do tamanho, embaixo do aparelho (8 de respiro e 20 de linha). */
const LEGENDA = 28

export function TestReportDialog({ publicKey, open, onOpenChange }: TestReportDialogProps) {
  // No celular de verdade a pagina ocupa a tela: escolher "Computador" num telefone
  // prometia o que nao cabe.
  const celular = useMediaQuery('(max-width: 39.99rem)')
  const [aparelho, setAparelho] = useState<Aparelho>('computer')
  // "Recomeçar" carrega a pagina de novo: depois de mandar, o formulario mostra a
  // confirmacao, e testar outra vez nao pede fechar e abrir.
  const [rodada, setRodada] = useState(0)

  const src = `${environment.testPageUrl}?k=${encodeURIComponent(publicKey)}`
  // `key` remonta a pagina a cada troca de aparelho e a cada "Recomeçar": o carregador le
  // a largura ao comecar, e reaproveitar a pagina anterior mostraria o relato passado.
  const pagina = (className: string, style?: CSSProperties) => (
    <iframe
      key={`${publicKey}-${celular ? 'tela' : aparelho}-${rodada}`}
      title="Ferramenta de relato"
      src={src}
      className={className}
      style={style}
    />
  )

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Content className="fixed inset-0 z-dialog flex flex-col bg-surface outline-none data-[state=closed]:animate-veil-out data-[state=open]:animate-veil-in">
          <div className="flex flex-none items-center gap-2 border-border border-b bg-surface-raised px-4 py-2.5 sm:grid sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:gap-4 sm:px-5 sm:py-3">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="font-semibold text-body text-fg sm:text-dialog">
                Relato de teste
              </Dialog.Title>
              {/* So a consequencia: a propria pagina de teste ja diz para clicar no botao, e a
                  frase inteira cortava ao lado das escolhas. No celular, so para o leitor de
                  tela, e a barra fica com uma linha. */}
              <Dialog.Description className="truncate text-detail text-fg-muted max-sm:sr-only">
                O relato enviado daqui entra de verdade no Trabalho.
              </Dialog.Description>
            </div>

            {!celular && (
              <fieldset className="flex items-center gap-1.5">
                <legend className="sr-only">Tamanho da tela</legend>
                <Choice selected={aparelho === 'computer'} onSelect={() => setAparelho('computer')}>
                  Computador
                </Choice>
                <Choice selected={aparelho === 'tablet'} onSelect={() => setAparelho('tablet')}>
                  Tablet
                </Choice>
                <Choice selected={aparelho === 'phone'} onSelect={() => setAparelho('phone')}>
                  Celular
                </Choice>
              </fieldset>
            )}

            <div className="flex flex-none items-center gap-1 sm:justify-self-end">
              <button
                type="button"
                onClick={() => setRodada((valor) => valor + 1)}
                title="Carregar a página de novo"
                className="alvo-de-toque relative flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-detail text-fg-muted transition-colors hover:bg-surface-sunken hover:text-fg"
              >
                <svg
                  viewBox="0 0 16 16"
                  className="size-3.5 flex-none"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <path d="M13 8a5 5 0 1 1-1.6-3.7" />
                  <path d="M13 2.5V5h-2.5" />
                </svg>
                <span className="max-sm:sr-only">Recomeçar</span>
              </button>
              <Dialog.Close
                aria-label="Fechar"
                className="alvo-de-toque-icone relative flex size-9 items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-surface-sunken hover:text-fg"
              >
                <svg
                  viewBox="0 0 12 12"
                  className="size-3"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  aria-hidden
                >
                  <path d="m2.5 2.5 7 7m0-7-7 7" />
                </svg>
              </Dialog.Close>
            </div>
          </div>

          {open &&
            (celular ? (
              pagina('block min-h-0 w-full flex-1 bg-surface')
            ) : (
              <Palco aparelho={aparelho} pagina={pagina} />
            ))}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/**
 * O fundo em volta da pagina, que mede o espaco que tem: e dele que sai a altura do
 * aparelho, e a escala quando nem a largura cabe.
 */
function Palco({
  aparelho,
  pagina,
}: {
  aparelho: Aparelho
  pagina: (className: string, style?: CSSProperties) => ReactNode
}) {
  const area = useRef<HTMLDivElement>(null)
  const [tamanho, setTamanho] = useState<{ largura: number; altura: number } | null>(null)

  useLayoutEffect(() => {
    const caixa = area.current
    if (!caixa || typeof ResizeObserver === 'undefined') return
    const medir = () => setTamanho({ largura: caixa.clientWidth, altura: caixa.clientHeight })
    medir()
    const observador = new ResizeObserver(medir)
    observador.observe(caixa)
    return () => observador.disconnect()
  }, [])

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface-sunken p-4 md:p-6">
      <div ref={area} className="flex min-h-0 flex-1 flex-col items-center justify-center">
        {aparelho === 'computer' ? (
          <>
            {pagina('block min-h-0 w-full flex-1 rounded-lg border border-border bg-surface')}
            <Legenda>
              {tamanho ? `${tamanho.largura} × ${Math.max(0, tamanho.altura - LEGENDA)}` : ''}
            </Legenda>
          </>
        ) : (
          <Moldura aparelho={aparelho} tamanho={tamanho} pagina={pagina} />
        )}
      </div>
    </div>
  )
}

/**
 * O tablet ou o celular: a tela com a largura exata do aparelho, dentro da moldura. A
 * altura e a do aparelho ate onde o palco deixa (nunca menos de 320). Quando nem a largura
 * cabe, o aparelho inteiro diminui por `scale`, e a pagina dentro continua achando que tem
 * a largura de verdade: e ela que decide se o formulario abre como no celular.
 */
function Moldura({
  aparelho,
  tamanho,
  pagina,
}: {
  aparelho: 'tablet' | 'phone'
  tamanho: { largura: number; altura: number } | null
  pagina: (className: string, style?: CSSProperties) => ReactNode
}) {
  const { largura, altura, moldura } = APARELHOS[aparelho]
  const larguraFora = largura + 2 * moldura
  const espacoLargura = tamanho?.largura ?? larguraFora
  const espacoAltura = (tamanho?.altura ?? altura + 2 * moldura + LEGENDA) - LEGENDA
  const escala = Math.min(1, espacoLargura / larguraFora)
  const alturaDaTela = Math.max(
    320,
    Math.min(altura, Math.floor(espacoAltura / escala) - 2 * moldura),
  )
  const alturaFora = alturaDaTela + 2 * moldura

  return (
    <>
      {/* O lugar que o aparelho ocupa ja diminuido: o `scale` sozinho nao muda o espaco. */}
      <div
        className="relative flex-none"
        style={{ width: larguraFora * escala, height: alturaFora * escala }}
      >
        <div
          className={cn(
            'absolute top-0 left-0 origin-top-left bg-device-frame shadow-lg',
            aparelho === 'phone' ? 'rounded-[2.75rem]' : 'rounded-[2rem]',
          )}
          style={{
            width: larguraFora,
            height: alturaFora,
            padding: moldura,
            transform: escala < 1 ? `scale(${escala})` : undefined,
          }}
        >
          {pagina(
            cn(
              'block size-full bg-surface',
              aparelho === 'phone' ? 'rounded-[2.125rem]' : 'rounded-[1.125rem]',
            ),
          )}
        </div>
      </div>
      <Legenda>
        {largura} × {alturaDaTela}
        {escala < 1 && `, em ${Math.round(escala * 100)}%`}
      </Legenda>
    </>
  )
}

function Legenda({ children }: { children: ReactNode }) {
  return (
    <p className="mt-2 h-5 flex-none text-caption text-fg-muted tabular-nums leading-5">
      {children}
    </p>
  )
}
