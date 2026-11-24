import type { ReactNode } from 'react'
import { Button } from '@/shared/components/Button'
import { CopyButton } from '@/shared/components/CopyButton'
import { cn } from '@/shared/lib/cn'
import { renderWidgetText, type WidgetTextValues } from '@/shared/lib/widgetText'

/**
 * O que quem relata ve logo depois de enviar, em pecas que o quadro do formulario e as
 * previas do painel montam do mesmo jeito: a previa nunca envia, e sem estas pecas a
 * confirmacao so seria vista depois de um relato de verdade.
 *
 * **Uma coisa por vez, na ordem do que importa.** Antes, o protocolo, o codigo e o link
 * apareciam do mesmo tamanho, e quem relatava nao sabia o que guardar. Agora:
 *
 * 1. `SentConfirmation`: deu certo, e o texto do projeto.
 * 2. O que a pessoa precisa saber para voltar: o codigo pessoal (`PersonalCodeCard`), a
 *    conta ligada (`LinkedAccountCard`) ou, sem nenhum dos dois, o link.
 * 3. `SentDetails`: o protocolo e o link deste relato, para quem quiser.
 *
 * **Sao blocos soltos, e nao um embrulho**: quem usa ja tem a coluna com o espaco entre
 * eles, e uma caixa a mais mudaria o espacamento do quadro.
 */

const TRACO = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

function Icone({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      aria-hidden="true"
      className={cn('flex-none', className)}
      {...TRACO}
    >
      {children}
    </svg>
  )
}

/**
 * Deu certo: o sinal, o titulo e o texto de confirmacao do projeto. `action` fica no canto
 * de cima a direita, onde o formulario tambem poe o "Fechar".
 */
export function SentConfirmation({
  message,
  values,
  action,
  preview = false,
}: {
  /** O texto do projeto, com as variaveis ainda por trocar. */
  message: string
  /** Os valores de agora: o nome, o protocolo, o tipo, o projeto. */
  values: WidgetTextValues
  action?: ReactNode
  /**
   * Dentro de uma previa do painel: o "Relato enviado" vira texto comum, porque a tela do
   * painel ja tem o titulo principal dela, e dois `h1` confundem quem navega por titulos.
   */
  preview?: boolean
}) {
  const Titulo = preview ? 'p' : 'h1'

  return (
    <div>
      <div className="flex items-center gap-2.5">
        <span className="flex size-7 flex-none items-center justify-center rounded-full border border-chip-green-border bg-chip-green-surface text-chip-green-fg">
          <Icone>
            <path d="m3.5 8.5 3 3 6-7" />
          </Icone>
        </span>
        <Titulo className="min-w-0 flex-1 font-semibold text-fg text-lead tracking-tight">
          Relato enviado
        </Titulo>
        {action}
      </div>
      {/* As variaveis trocadas aqui, depois de enviar, que e quando os valores existem.
          Texto puro: o nome e o que a pessoa digitou. */}
      <p className="mt-2.5 text-body text-fg leading-normal">{renderWidgetText(message, values)}</p>
    </div>
  )
}

/**
 * O codigo pessoal, como a chave que ele e.
 *
 * **Neste navegador ninguem precisa dele**: o quadro ja o guardou, e "Ver os meus relatos"
 * abre a lista sem pedir nada. Ele so serve em outro celular, computador ou navegador, e e
 * isso que a frase diz, sem a pessoa ter de entender o que e aquela sequencia de letras.
 * Copiar e baixar sao as duas formas de guardar sem anotar a mao.
 */
export function PersonalCodeCard({
  code,
  savedHere,
  onDownload,
}: {
  code: string
  /** O navegador guardou o codigo. Falso em janela sem armazenamento: ai, guardar e agora. */
  savedHere: boolean
  /** Baixa o codigo num arquivo. Ausente, so copiar (o carregador antigo barra o download). */
  onDownload?: () => void
}) {
  return (
    <div className="rounded-xl border border-border bg-surface-raised p-4">
      <p className="flex items-center gap-2 font-medium text-detail text-fg">
        <Icone className="text-fg-muted">
          <circle cx="5.5" cy="10.5" r="2.5" />
          <path d="m7.3 8.7 5.2-5.2M10.5 5.5l1.5 1.5M12 4l1.2 1.2" />
        </Icone>
        Seu código pessoal
      </p>
      <p className="mt-2 font-mono text-fg text-lead tracking-wider">{code}</p>
      <p className="mt-1.5 text-caption text-fg-muted leading-relaxed">
        Com ele você vê todos os seus relatos em outro celular, computador ou navegador
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <CopyButton value={code} label="Copiar código" size="sm" />
        {onDownload && (
          <Button size="sm" onClick={onDownload}>
            <Icone>
              <path d="M8 2.5v7.5M4.75 6.75 8 10l3.25-3.25M3 13.5h10" />
            </Icone>
            Baixar em arquivo
          </Button>
        )}
      </div>

      {/* A pergunta que fica depois de ver um codigo: preciso digitar isso toda vez? Nao, e
          a frase diz antes de a pessoa sair anotando. Sem armazenamento, diz o contrario. */}
      <p
        className={cn(
          'mt-3 flex items-start gap-1.5 text-caption leading-relaxed',
          savedHere ? 'text-fg-muted' : 'text-warn-fg',
        )}
      >
        <Icone className="mt-px">
          {savedHere ? <path d="m3.5 8.5 3 3 6-7" /> : <path d="M8 4.5v4.5M8 11.5v.01" />}
        </Icone>
        {savedHere
          ? 'Neste navegador ele já ficou salvo, e você não precisa digitar nada'
          : 'Este navegador não conseguiu guardar o código, então copie ou baixe agora'}
      </p>
    </div>
  )
}

/** O relato ligado a conta da pessoa no site: nada para guardar, e a tela diz isso. */
export function LinkedAccountCard() {
  return (
    <div className="rounded-xl border border-border bg-surface-raised p-4">
      <p className="flex items-center gap-2 font-medium text-detail text-fg">
        <Icone className="text-fg-muted">
          <circle cx="8" cy="5.5" r="2.5" />
          <path d="M3 13.5a5 5 0 0 1 10 0" />
        </Icone>
        Este relato ficou ligado à sua conta
      </p>
      <p className="mt-1.5 text-caption text-fg-muted leading-relaxed">
        Ele aparece em “Ver os meus relatos” sempre que você entrar neste site
      </p>
    </div>
  )
}

/**
 * O protocolo e o link deste relato.
 *
 * **Detalhe, quando ha outro caminho de volta** (o codigo ou a conta), e o proprio caminho
 * quando nao ha: sem codigo e sem conta, o link e a unica forma de voltar, e o titulo e o
 * aviso dizem isso com todas as letras.
 *
 * O link sai daqui uma vez so: o token vive no fragmento dele, e o banco guarda apenas o
 * hash. Nulo, a previa do painel, que mostra o lugar dele sem endereco nenhum.
 *
 * `rel="noreferrer"` vale pelo `noopener` que ele implica: sem isso a aba nova ganha um
 * `window.opener` apontando para este quadro, que roda dentro do site de outra pessoa.
 * Abrir em outra aba e obrigatorio: aqui dentro o quadro e pequeno para ler.
 */
export function SentDetails({
  trackingCode,
  trackingLink,
  onlyWayBack,
}: {
  trackingCode: string
  trackingLink: string | null
  /** Sem codigo nem conta: o link e a unica volta. */
  onlyWayBack: boolean
}) {
  return (
    <div>
      <p className="mb-2 font-medium text-detail text-fg">
        {onlyWayBack ? 'Para voltar a este relato' : 'Detalhes deste relato'}
      </p>
      <div className="divide-y divide-border rounded-lg border border-border">
        <div className="flex items-center justify-between gap-3 px-3 py-2.5">
          <span className="min-w-0">
            <span className="block text-caption text-fg-muted">Protocolo</span>
            <span className="block font-mono text-detail text-fg">{trackingCode}</span>
          </span>
          <CopyButton value={trackingCode} label="Copiar protocolo" size="sm" />
        </div>
        <div className="flex items-center justify-between gap-3 px-3 py-2.5">
          {trackingLink ? (
            <a
              href={trackingLink}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-detail text-fg underline underline-offset-4 pointer-coarse:-my-3 pointer-coarse:py-3"
            >
              Acompanhar este relato
            </a>
          ) : (
            <span className="font-medium text-detail text-fg underline underline-offset-4">
              Acompanhar este relato
            </span>
          )}
          {trackingLink && <CopyButton value={trackingLink} label="Copiar link" size="sm" />}
        </div>
      </div>
      {/* **Duas coisas, e as duas so existem se estiverem escritas aqui.** O link aparece uma
          vez so: "Relatar outra coisa" e "Fechar" o apagam, e nao ha rota que o mostre de
          novo. E quem tem o link le o relato, consequencia do desenho: um link que exigisse
          senha nao seria um link, e quem relata num site nao tem conta em lugar nenhum. */}
      <p className="mt-2 text-caption text-fg-muted leading-relaxed">
        {onlyWayBack ? (
          <>
            <strong className="font-medium text-fg">Copie o link agora:</strong> ele aparece só
            desta vez, e quem o tiver consegue ler este relato
          </>
        ) : (
          'O link aparece só desta vez, e quem o tiver consegue ler este relato'
        )}
      </p>
    </div>
  )
}
