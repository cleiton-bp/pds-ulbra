import type { ReactNode } from 'react'
import type { CycleSettingsViewModel } from '@/contracts'
import { cn } from '@/shared/lib/cn'

/** A parte do caminho que um grupo da tela muda: e ela que aparece contornada. */
export type PathPart = 'close' | 'wait' | 'read' | 'confirm' | 'reopen' | 'info' | 'archive'

/**
 * "Caminho do relato": o que acontece com um relato **com as regras do rascunho**, do
 * encerramento a resposta de quem relatou, e o caminho do pedido de informacao.
 *
 * **E texto em listas, e nao um desenho.** As setas e os pontos sao enfeite
 * (`aria-hidden`): o leitor de tela le os passos em ordem, com o que cada um diz, e o
 * "procurar na pagina" acha o nome da coluna. Um desenho so com formas deixaria de fora
 * justamente quem mais precisa da explicacao.
 *
 * **Sai do rascunho, e nao do salvo**: mudar a espera muda o passo da espera na hora,
 * antes de salvar — e a etiqueta do titulo diz se o que esta aqui ja vale.
 *
 * O contorno tracejado e o mesmo da previa do formulario: quem aprendeu la que "o
 * contornado e o que estou mudando" nao precisa aprender de novo.
 */
export function ReportPath({
  draft,
  reopenColumn,
  dirty,
  highlight,
}: {
  draft: CycleSettingsViewModel
  /** Para onde o relato reaberto volta, ja em palavras ("Reaberto", "a primeira coluna da fila"). */
  reopenColumn: string
  /** Ha mudanca por salvar: o caminho mostra algo que ainda nao vale. */
  dirty: boolean
  highlight: PathPart | null
}) {
  const espera = draft.PublicDelayMinutes
  const aviso = draft.InfoRequestWarnDays
  const encerra = draft.InfoRequestCloseDays

  return (
    <section
      id="caminho-do-relato"
      aria-labelledby="caminho-do-relato-titulo"
      className="scroll-mt-6 rounded-xl border border-border bg-surface-raised p-5"
    >
      <header className="mb-1 flex items-baseline justify-between gap-3">
        <h2 id="caminho-do-relato-titulo" className="font-semibold text-fg text-lead">
          Caminho do relato
        </h2>
        <span className="flex-none text-caption text-fg-muted">
          {dirty ? 'ainda não salvo' : 'igual ao salvo'}
        </span>
      </header>
      <p className="mb-4 text-detail text-fg-muted leading-relaxed">
        O que acontece com um relato com estas regras. A parte que você está mudando aparece
        contornada.
      </p>

      <ol aria-label="Do encerramento à resposta de quem relatou" className="flex flex-col">
        <Step part="close" highlight={highlight} title="O time encerra">
          {draft.ClosureTrigger === 'LastColumn'
            ? 'Ao mover para a última coluna, com desfecho e motivo.'
            : 'Pelo botão de concluir, com desfecho e motivo. O relato fica onde está.'}
        </Step>

        <Step
          part="wait"
          highlight={highlight}
          title={espera === 0 ? 'Quem relatou vê na hora' : `Espera ${minutos(espera)}`}
        >
          {espera === 0
            ? 'Sem tempo para desfazer antes de quem relatou ver.'
            : 'Dá para desfazer movendo de volta; só depois quem relatou vê.'}
        </Step>

        <Step part="read" highlight={highlight} title="Quem relatou lê o motivo" last>
          E responde se resolveu.
          <ul className="mt-2.5 grid gap-2 sm:grid-cols-2">
            <Branch part="confirm" highlight={highlight} title="Resolveu">
              {draft.SatisfactionEnabled
                ? `Confirma e dá uma nota em ${
                    draft.SatisfactionStyle === 'Stars' ? 'estrelas' : 'números de 1 a 5'
                  }${draft.SatisfactionRequired ? ', obrigatória' : ', se quiser'}.`
                : 'Confirma, sem nota.'}
            </Branch>
            <Branch part="reopen" highlight={highlight} title="Não resolveu">
              {draft.AllowsReopen
                ? `Reabre${
                    draft.ReopenRequiresComment ? ', contando o que ainda acontece,' : ''
                  } e volta para ${reopenColumn}.`
                : 'Não pode reabrir: o relato fica encerrado.'}
            </Branch>
          </ul>
        </Step>
      </ol>

      <Part part="info" highlight={highlight} className="mt-5">
        <h3 className="mb-2 font-medium text-detail text-fg">Se faltar informação</h3>
        {draft.InfoRequestEnabled ? (
          <ol aria-label="Quando o time pede informação" className="flex flex-col">
            <Step title="O time devolve com uma pergunta">
              Só para quem aceitou responder dúvidas.
            </Step>
            <Step title={`Aviso em ${dias(aviso)}`}>
              Sem resposta, o acompanhamento diz que o relato vai encerrar.
            </Step>
            <Step title={`Encerra ${dias(encerra)} depois`} last>
              Como “sem retorno”, {aviso + encerra} dias depois da pergunta.
              {draft.AllowsReopen && ' Quem relatou ainda pode reabrir.'}
            </Step>
          </ol>
        ) : (
          <p className="text-caption text-fg-muted leading-relaxed">
            Desligado: o time não devolve relato pedindo informação.
          </p>
        )}
      </Part>

      <Part part="archive" highlight={highlight} className="mt-5">
        <h3 className="mb-1 font-medium text-detail text-fg">Se o time arquivar</h3>
        <p className="text-caption text-fg-muted leading-relaxed">
          {draft.AllowsReportArchiving
            ? 'O relato aberto encerra junto, com desfecho e motivo, e segue o caminho acima.'
            : 'Desligado: só o card do time se arquiva, e o relato segue aberto.'}
        </p>
      </Part>
    </section>
  )
}

/** O contorno da parte em foco, o mesmo da previa do formulario. */
const CONTORNO = 'outline-2 outline-accent outline-dashed outline-offset-2'

/**
 * Um pedaco do caminho que pode ser contornado. `data-highlighted` e para os testes e
 * para quem inspeciona: o contorno em si nao diz nada ao leitor de tela, e nem precisa —
 * ele so aponta, no desenho, o que o grupo aberto ja diz em texto.
 */
function Part({
  part,
  highlight,
  className,
  children,
}: {
  part: PathPart
  highlight: PathPart | null
  className?: string
  children: ReactNode
}) {
  const realcado = part === highlight
  return (
    <div
      data-highlighted={realcado || undefined}
      className={cn('rounded-lg transition-[outline-color]', realcado && CONTORNO, className)}
    >
      {children}
    </div>
  )
}

/**
 * Um passo: o ponto, a linha ate o proximo e o texto. `part` so nos passos que um grupo
 * muda; os do pedido de informacao sao contornados juntos, pelo bloco em volta.
 */
function Step({
  part,
  highlight = null,
  title,
  last = false,
  children,
}: {
  part?: PathPart
  highlight?: PathPart | null
  title: string
  last?: boolean
  children: ReactNode
}) {
  const realcado = part !== undefined && part === highlight

  return (
    <li className="relative flex gap-3 pb-3 last:pb-0">
      {/* O ponto e a linha que desce ate o proximo passo: enfeite, o texto diz a ordem. */}
      <span aria-hidden className="flex w-2.5 flex-none flex-col items-center pt-1.5">
        <span className="size-2.5 flex-none rounded-full border-2 border-accent bg-surface-raised" />
        {!last && <span className="mt-1 w-px flex-1 bg-border" />}
      </span>
      <div
        data-highlighted={realcado || undefined}
        className={cn('min-w-0 flex-1 rounded-lg px-1.5 py-0.5', realcado && CONTORNO)}
      >
        <span className="block font-medium text-detail text-fg">{title}</span>
        {/* `div`, e nao `span`: o passo da resposta leva a lista dos dois desfechos. */}
        <div className="text-caption text-fg-muted leading-relaxed">{children}</div>
      </div>
    </li>
  )
}

/** Um dos dois desfechos da resposta: resolveu ou nao resolveu. */
function Branch({
  part,
  highlight,
  title,
  children,
}: {
  part: PathPart
  highlight: PathPart | null
  title: string
  children: ReactNode
}) {
  const realcado = part === highlight

  return (
    <li
      data-highlighted={realcado || undefined}
      className={cn('rounded-lg border border-border bg-surface p-3', realcado && CONTORNO)}
    >
      <span className="mb-0.5 flex items-center gap-1.5 font-medium text-detail text-fg">
        <svg
          viewBox="0 0 12 12"
          className="size-3 flex-none text-fg-muted"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M2 6h7.5m-3-3 3 3-3 3" />
        </svg>
        {title}
      </span>
      <span className="block text-caption text-fg-muted leading-relaxed">{children}</span>
    </li>
  )
}

/** "1 minuto", "30 minutos": a conta em palavras, como a pessoa diria. */
export function minutos(valor: number) {
  return `${valor} ${valor === 1 ? 'minuto' : 'minutos'}`
}

/** "1 dia", "7 dias". */
export function dias(valor: number) {
  return `${valor} ${valor === 1 ? 'dia' : 'dias'}`
}
