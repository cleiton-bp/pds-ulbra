import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type {
  ModerationItemViewModel,
  ReportModerationState,
  ReportVisibility,
  SensitiveDataKind,
  SensitiveFindingViewModel,
} from '@/contracts'
import { MAX_PUBLISHED_LISTED } from '@/contracts'
import { Button } from '@/shared/components/Button'
import { PublicReportCard } from '@/shared/components/PublicReportCard'
import { reportTypeName } from '@/shared/components/ReportTypeGlyph'
import { cn } from '@/shared/lib/cn'
import { formatRelative } from '@/shared/lib/datetime'

/** A decisao que a tela manda: `Pending` nao existe como decisao. */
export type Decisao = Exclude<ReportModerationState, 'Pending'>

/**
 * O que aconteceu com um relato na tela, alem da decisao: outra pessoa decidiu antes
 * (409), ou a decisao falhou por outro motivo.
 */
export type Marca = { tipo: 'outra-pessoa' } | { tipo: 'falha'; motivo: string }

export const ABAS: Record<ReportModerationState, string> = {
  Pending: 'Esperando',
  Approved: 'Liberados',
  Rejected: 'Não publicáveis',
}

/**
 * A fila vazia diz coisas diferentes em cada aba — e a de "esperando" nao e
 * comemoracao: num projeto privado ela fica vazia porque ninguem precisou olhar.
 */
export const VAZIO: Record<ReportModerationState, string> = {
  Pending:
    'Nada esperando a decisão de publicar. Todo relato que chegar aparece aqui antes de ir a público.',
  Approved:
    'Nenhum relato liberado ainda. Liberar só faz o relato aparecer se o projeto estiver num nível público.',
  Rejected: 'Nenhum relato foi marcado como não publicável.',
}

/**
 * As acoes de cada aba, com a tecla de cada uma. Na fila, as duas; no historico, so a
 * que muda de ideia — decidir de novo o que ja esta decidido assim nao faz nada.
 */
export function acoesDa(estado: ReportModerationState): {
  decisao: Decisao
  rotulo: string
  tecla: 'L' | 'N'
  principal: boolean
}[] {
  if (estado === 'Pending')
    return [
      { decisao: 'Approved', rotulo: 'Liberar', tecla: 'L', principal: true },
      { decisao: 'Rejected', rotulo: 'Não publicar', tecla: 'N', principal: false },
    ]
  // Mudar de ideia e decidir de novo, e nao voltar para a fila: alguem ja leu, e a
  // fila nao deve cobrar de novo o que foi lido.
  if (estado === 'Approved')
    return [{ decisao: 'Rejected', rotulo: 'Tirar do público', tecla: 'N', principal: false }]
  return [{ decisao: 'Approved', rotulo: 'Liberar mesmo assim', tecla: 'L', principal: false }]
}

/** A primeira linha do texto, para a lista compacta: a lista e para achar, e nao para ler. */
function primeiraLinha(texto: string): string {
  const linha = texto.split('\n').find((parte) => parte.trim().length > 0) ?? ''
  return linha.trim()
}

/** Uma linha da lista compacta: o bastante para achar, e o detalhe ao lado para ler. */
export function LinhaDaFila({
  item,
  aba,
  selecionado,
  marcado,
  marca,
  aoSelecionar,
  aoMarcar,
}: {
  item: ModerationItemViewModel
  aba: ReportModerationState
  selecionado: boolean
  marcado: boolean
  marca: Marca | undefined
  aoSelecionar: () => void
  aoMarcar: (marcado: boolean) => void
}) {
  // Na fila, a idade conta a espera; no historico, quando foi decidido.
  const quando = aba === 'Pending' ? item.CreatedAt : (item.ModeratedAt ?? item.CreatedAt)

  return (
    <li
      data-relato={item.PublicId}
      className={cn(
        'flex animate-fade-in items-start gap-2.5 border-border border-b px-3 py-2.5 transition-colors duration-150 last:border-b-0 motion-reduce:transition-none',
        selecionado ? 'bg-nav-active' : 'hover:bg-surface-sunken',
      )}
    >
      <input
        type="checkbox"
        checked={marcado}
        onChange={(evento) => aoMarcar(evento.target.checked)}
        aria-label={`Selecionar ${item.TrackingCode}`}
        disabled={marca?.tipo === 'outra-pessoa'}
        className="mt-1 size-3.5 flex-none accent-accent"
      />
      <button
        type="button"
        onClick={aoSelecionar}
        aria-current={selecionado ? 'true' : undefined}
        className="min-w-0 flex-1 text-left"
      >
        <span className="flex items-baseline gap-2">
          <span className="font-mono text-caption text-fg-muted">{item.TrackingCode}</span>
          <span className="truncate text-caption text-fg-muted">{reportTypeName(item.Type)}</span>
          <time dateTime={quando} className="ml-auto flex-none text-caption text-fg-muted">
            {formatRelative(quando)}
          </time>
        </span>
        <span className="mt-0.5 block truncate text-detail text-fg">
          {primeiraLinha(item.Text) || 'Sem texto'}
        </span>
        {(item.Findings.length > 0 || marca) && (
          <span className="mt-1 flex flex-wrap gap-1.5">
            {item.Findings.length > 0 && (
              <span className="rounded border border-warn-border bg-warn-surface px-1.5 text-caption text-warn-fg">
                sensível
              </span>
            )}
            {marca?.tipo === 'outra-pessoa' && (
              <span className="rounded border border-border bg-surface-sunken px-1.5 text-caption text-fg-muted">
                decidido por outra pessoa
              </span>
            )}
            {marca?.tipo === 'falha' && (
              <span className="rounded border border-error-border px-1.5 text-caption text-error-fg">
                não deu certo
              </span>
            )}
          </span>
        )}
      </button>
    </li>
  )
}

/**
 * O relato escolhido, inteiro: o texto marcado, os achados, quem assinou, a previa da
 * lista publica e as acoes.
 */
export function DetalheDoRelato({
  item,
  projectPublicId,
  visibilidade,
  marca,
  ocupado,
  aoDecidir,
}: {
  item: ModerationItemViewModel
  projectPublicId: string
  /** Nula quando a leitura de Quem relata falhou: a tela fica como era. */
  visibilidade: ReportVisibility | null
  marca: Marca | undefined
  ocupado: boolean
  aoDecidir: (decisao: Decisao) => void
}) {
  const outraPessoa = marca?.tipo === 'outra-pessoa'

  return (
    <article aria-label={`Relato ${item.TrackingCode}`} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-mono text-caption text-fg-muted">{item.TrackingCode}</span>
        <span className="text-caption text-fg-muted">{reportTypeName(item.Type)}</span>
        <time dateTime={item.CreatedAt} className="text-caption text-fg-muted">
          chegou {formatRelative(item.CreatedAt)}
        </time>
        <Link
          to={`/projects/${projectPublicId}/reports/${item.PublicId}`}
          className="ml-auto text-caption text-fg-muted underline underline-offset-2 hover:text-fg"
        >
          Abrir card
        </Link>
      </div>

      {outraPessoa ? (
        <p className="rounded-lg border border-border bg-surface-sunken px-3 py-2 text-detail text-fg-muted leading-relaxed">
          <strong className="font-medium text-fg">Outra pessoa já decidiu este relato.</strong> A
          decisão dela ficou valendo; ele sai desta lista na próxima vez que ela for lida.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {acoesDa(item.State).map((acao) => (
            <Button
              key={acao.decisao}
              variant={acao.principal ? 'primary' : 'secondary'}
              size="sm"
              disabled={ocupado}
              aria-keyshortcuts={acao.tecla}
              onClick={() => aoDecidir(acao.decisao)}
            >
              {acao.rotulo}
            </Button>
          ))}
          {item.State !== 'Pending' && (
            <span className="text-caption text-fg-muted">
              {item.State === 'Approved' ? 'Liberado' : 'Não publicável'}
              {item.ModeratedByName !== null && ` por ${item.ModeratedByName}`}
              {item.ModeratedAt !== null && `, ${formatRelative(item.ModeratedAt)}`}
            </span>
          )}
        </div>
      )}

      {marca?.tipo === 'falha' && (
        <p role="alert" className="text-caption text-error-fg leading-relaxed">
          {marca.motivo}
        </p>
      )}

      {/* Inteiro, e com as quebras que a pessoa escreveu: decidir sobre um
          resumo e decidir sobre a parte que coube. */}
      <p className="whitespace-pre-wrap text-body text-fg leading-relaxed">
        <TextoMarcado texto={item.Text} achados={item.Findings} />
      </p>

      {item.Findings.length > 0 && <Achados item={item} />}

      {item.ReporterName !== null && (
        <p className="text-caption text-fg-muted leading-relaxed">
          <strong className="font-medium text-fg">Assinou como:</strong> {item.ReporterName}{' '}
          {/* Coletar e uma coisa, publicar e outra — e quem modera precisa
              saber de qual das duas se trata antes de liberar. */}
          {fraseDoNome(item.ReporterNameIsPublic, visibilidade)}
        </p>
      )}

      <PreviaPublica item={item} visibilidade={visibilidade} />
    </article>
  )
}

/**
 * O que acontece com o nome, dito pelo que a pessoa pediu **e** pelo projeto. "Quis
 * que o nome aparecesse" num projeto publico anonimo prometia o que nao acontece: la o
 * nome nunca sai, por mais que ela tenha pedido.
 */
function fraseDoNome(pediuPublico: boolean, visibilidade: ReportVisibility | null): string {
  if (!pediuPublico) return '— e pediu para o nome não aparecer.'
  if (visibilidade === 'PublicIdentified')
    return '— e quis que o nome aparecesse: ele vai junto do relato na lista pública.'
  if (visibilidade === 'PublicAnonymous')
    return '— quis que o nome aparecesse, mas este projeto não mostra nomes ao público.'
  if (visibilidade === 'Private')
    return '— quis que o nome aparecesse, mas o projeto é privado: nada daqui sai.'
  return '— e quis que o nome aparecesse.'
}

/** Os achados da varredura: um aviso, e nao um veredito. */
function Achados({ item }: { item: ModerationItemViewModel }) {
  return (
    <div className="rounded-lg border border-warn-border bg-warn-surface px-3 py-2">
      <p className="text-caption text-warn-fg leading-relaxed">
        <strong className="font-medium">
          Achamos {item.Findings.length === 1 ? 'um trecho' : 'trechos'} que{' '}
          {item.Findings.length === 1 ? 'parece' : 'parecem'} dado sensível.
        </strong>{' '}
        {/* **A frase diz que a decisao continua sendo da pessoa.** Um
            aviso que soasse como veredito faria o time liberar no
            automatico quando ele nao aparecesse — e e justamente ai que
            a varredura erra, deixando passar. */}
        Olhe o que está marcado antes de liberar. Isto não impede nada, e pode estar errado.
      </p>
      {item.FindingsTruncated && (
        /* **Doze nao e "todos".** Um texto colado de um log tem
           centenas de credenciais iguais, e deixar quem le achar que
           sao doze ajuda a decidir errado. */
        <p className="mt-1 text-caption text-warn-fg leading-relaxed">
          Paramos de listar depois de {item.Findings.length}. Há mais trechos marcados no texto do
          que os desta lista.
        </p>
      )}
      <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
        {item.Findings.map((achado) => (
          <li key={`${achado.Start}-${achado.Kind}`} className="text-caption text-warn-fg">
            {ACHADOS[achado.Kind]}: <span className="font-mono">{achado.Sample}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * "Na lista publica vai aparecer assim": o mesmo desenho do quadro, com o nome so
 * quando ele sairia de verdade.
 *
 * **Diz que a lista mostra so os ultimos liberados.** Sem isso, quem libera um relato
 * antigo espera ve-lo para sempre na vitrine — e ele sai dela assim que outros forem
 * liberados depois.
 */
function PreviaPublica({
  item,
  visibilidade,
}: {
  item: ModerationItemViewModel
  visibilidade: ReportVisibility | null
}) {
  const nome =
    visibilidade === 'PublicIdentified' && item.ReporterNameIsPublic ? item.ReporterName : null

  return (
    <section aria-label="Prévia na lista pública" className="flex flex-col gap-2">
      <h2 className="font-medium text-detail text-fg">
        {item.State === 'Approved'
          ? 'Na lista pública aparece assim'
          : 'Na lista pública vai aparecer assim'}
      </h2>
      <div className="rounded-lg border border-border bg-surface p-3">
        <PublicReportCard
          typeName={reportTypeName(item.Type)}
          reporterName={nome}
          stageLabel={item.PublicStageLabel ?? null}
          isClosed={false}
          text={item.Text}
          publishedAt={item.ModeratedAt ?? new Date().toISOString()}
        />
      </div>
      <p className="text-caption text-fg-muted leading-relaxed">
        A lista pública mostra só os {MAX_PUBLISHED_LISTED} últimos liberados, do mais recente para
        o mais antigo, sem o protocolo e sem os anexos.
        {visibilidade === 'Private' && ' Hoje ela está vazia: o projeto é privado.'}
      </p>
    </section>
  )
}

/**
 * O texto com os trechos suspeitos marcados.
 *
 * **Marcar no lugar vale mais do que listar embaixo.** Um relato longo com uma
 * etiqueta dizendo "tem um CPF aqui" obriga quem le a procurar — e procurar num
 * paragrafo e exatamente onde o olho passa direto. A lista continua existindo
 * porque ela resume, e a marca e o que faz achar.
 *
 * Os trechos vem ordenados e sem sobreposicao da API, entao basta caminhar.
 */
export function TextoMarcado({
  texto,
  achados,
}: {
  texto: string
  achados: SensitiveFindingViewModel[]
}) {
  if (achados.length === 0) return <>{texto}</>

  const pedacos: ReactNode[] = []
  let cursor = 0

  for (const achado of achados) {
    // Um indice fora do texto so aconteceria com API e tela discordando do
    // tamanho; pular e melhor do que renderizar lixo.
    if (achado.Start < cursor || achado.Start + achado.Length > texto.length) continue

    if (achado.Start > cursor) pedacos.push(texto.slice(cursor, achado.Start))

    pedacos.push(
      <mark
        key={`${achado.Start}-${achado.Kind}`}
        className="rounded bg-warn-surface px-0.5 text-warn-fg"
      >
        {texto.slice(achado.Start, achado.Start + achado.Length)}
      </mark>,
    )

    cursor = achado.Start + achado.Length
  }

  if (cursor < texto.length) pedacos.push(texto.slice(cursor))

  return <>{pedacos}</>
}

/** O nome de cada achado, na lingua de quem le — e nao no do enum. */
const ACHADOS: Record<SensitiveDataKind, string> = {
  Cpf: 'CPF',
  Cnpj: 'CNPJ',
  CreditCard: 'Cartão',
  Email: 'E-mail',
  Phone: 'Telefone',
  Token: 'Credencial',
}
