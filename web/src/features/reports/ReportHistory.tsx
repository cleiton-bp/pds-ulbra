import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReportEventType, ReportHistoryEntryViewModel } from '@/contracts'
import { projectReportService } from '@/data'
import { Skeleton } from '@/shared/components/Skeleton'
import { useAsyncResource } from '@/shared/hooks/useAsyncResource'
import { formatDateTime, formatDay, formatRelative } from '@/shared/lib/datetime'

/**
 * A linha do tempo do relato.
 *
 * **Montada a partir dos eventos**, e nao de uma coluna de historico. Uma coluna
 * seria uma segunda versao do mesmo fato, e as duas divergiriam no primeiro erro
 * de gravacao sem ninguem notar.
 *
 * **O nome das colunas vem do evento**, e nao da fila de hoje. Foi gravado quando
 * a mudanca aconteceu: por isso uma coluna renomeada — ou aposentada — continua
 * aparecendo aqui com o nome que tinha na epoca, em vez de o passado ser
 * reescrito a cada renomeacao.
 *
 * **O texto dos comentarios nao aparece aqui**, e nao e esquecimento: o evento
 * registra que houve comentario, nao o que foi dito. O texto mora na tabela dele,
 * que se consegue apagar — a de eventos, nao.
 *
 * **So o que e acao, e o mais novo primeiro.** Num card aberto todo dia, cada abertura
 * virava uma linha "abriu", e cada movimento vinha com um "nao andou" logo abaixo: o
 * historico era uma parede, com o que acabou de acontecer no fim. Agora a primeira
 * abertura fica (e o tempo que o time levou para olhar), as outras se mostram a pedido;
 * o "nao andou" vai na linha do movimento; e aparecem as dez mais recentes, com
 * "Mostrar tudo".
 */
export function ReportHistory({
  projectPublicId,
  reportPublicId,
  versao,
}: {
  projectPublicId: string
  reportPublicId: string
  /** Muda quando algo novo aconteceu, para a linha do tempo buscar de novo. */
  versao: number
}) {
  const { data, loading, failed, reload, revalidate } = useAsyncResource(
    useCallback(
      () => projectReportService.listReportHistory(projectPublicId, reportPublicId),
      [projectPublicId, reportPublicId],
    ),
  )

  // Algo novo aconteceu — uma acao aqui, ou outra pessoa pelo tempo real —: a linha do
  // tempo busca de novo **sem sumir da tela**. Pelo esqueleto, ela piscaria a cada
  // aviso de quem esta mexendo no mesmo card.
  const vista = useRef(versao)
  useEffect(() => {
    if (vista.current === versao) return
    vista.current = versao
    revalidate()
  }, [versao, revalidate])

  const [comAberturas, setComAberturas] = useState(false)
  const [tudo, setTudo] = useState(false)
  const linhas = useMemo(() => (data ? arrumar(data, comAberturas) : null), [data, comAberturas])
  const aberturas = data ? data.filter((entrada) => entrada.Type === 'ReportViewed').length : 0
  const vistas = linhas ? (tudo ? linhas : linhas.slice(0, MAIS_RECENTES)) : null

  return (
    <section className="border-border border-t pt-4">
      <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="font-medium text-detail text-fg">O que já aconteceu</h3>
        {linhas && linhas.length > 1 && (
          <span className="text-caption text-fg-muted">Do mais recente para o mais antigo</span>
        )}
      </div>

      {loading && (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      )}

      {failed && (
        <p className="text-caption text-fg-muted leading-normal">
          O histórico não carregou. O relato acima está completo.{' '}
          <button
            type="button"
            onClick={reload}
            className="underline underline-offset-2 hover:text-fg"
          >
            Tentar de novo
          </button>
        </p>
      )}

      {vistas && vistas.length > 0 && (
        <ol className="flex flex-col gap-2">
          {vistas.map(({ entrada, frase }) => (
            <li
              key={entrada.PublicId}
              className="flex flex-wrap items-baseline gap-x-2 text-detail"
            >
              <span className="text-fg">{frase}</span>
              {entrada.AuthorName && (
                <span className="text-caption text-fg-muted">por {entrada.AuthorName}</span>
              )}
              <time
                dateTime={entrada.OccurredAt}
                title={formatDateTime(entrada.OccurredAt)}
                className="text-caption text-fg-muted"
              >
                {formatRelative(entrada.OccurredAt)}
              </time>
            </li>
          ))}
        </ol>
      )}

      {linhas && (linhas.length > MAIS_RECENTES || aberturas > 1) && (
        <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
          {linhas.length > MAIS_RECENTES && (
            <button
              type="button"
              onClick={() => setTudo((antes) => !antes)}
              className="text-caption text-fg-muted underline underline-offset-2 hover:text-fg"
            >
              {tudo ? 'Mostrar só as mais recentes' : `Mostrar tudo (${linhas.length})`}
            </button>
          )}
          {aberturas > 1 && (
            <button
              type="button"
              onClick={() => setComAberturas((antes) => !antes)}
              className="text-caption text-fg-muted underline underline-offset-2 hover:text-fg"
            >
              {comAberturas ? 'Esconder aberturas' : `Mostrar aberturas (${aberturas - 1})`}
            </button>
          )}
        </div>
      )}
    </section>
  )
}

/** Quantas linhas o historico mostra antes do "Mostrar tudo". */
const MAIS_RECENTES = 10

/** O "nao andou" de um movimento chega junto dele; mais longe que isto, e outro fato. */
const MESMO_MOVIMENTO_MS = 10_000

interface Linha {
  entrada: ReportHistoryEntryViewModel
  frase: string
}

/**
 * As linhas que a tela mostra, da mais nova para a mais antiga.
 *
 * - **A primeira abertura fica**, como "Aberto pela primeira vez pelo time": e o fato
 *   que conta (o tempo que o time levou para olhar). As outras so com `comAberturas`.
 * - **O "nao andou" entra na linha do movimento** que o causou: "Movido de A para B ·
 *   quem relatou continua vendo a mesma etapa". Sozinho (sem movimento perto), fica
 *   como linha propria.
 */
function arrumar(entradas: ReportHistoryEntryViewModel[], comAberturas: boolean): Linha[] {
  const linhas: Linha[] = []
  let jaAbriu = false

  for (const entrada of entradas) {
    if (entrada.Type === 'ReportViewed') {
      if (!jaAbriu) {
        jaAbriu = true
        linhas.push({ entrada, frase: 'Aberto pela primeira vez pelo time' })
      } else if (comAberturas) linhas.push({ entrada, frase: 'Aberto de novo' })
      continue
    }

    if (entrada.Type === 'ReportPublicStageUnmapped') {
      const movimento = [...linhas]
        .reverse()
        .find((linha) => linha.entrada.Type === 'ReportStateChanged')
      const perto =
        movimento &&
        Math.abs(Date.parse(entrada.OccurredAt) - Date.parse(movimento.entrada.OccurredAt)) <=
          MESMO_MOVIMENTO_MS
      if (movimento && perto && !movimento.frase.includes(' · ')) {
        movimento.frase = `${movimento.frase} · quem relatou continua vendo a mesma etapa`
        continue
      }
    }

    linhas.push({ entrada, frase: descrever(entrada) })
  }

  return linhas.reverse()
}

const DESCRICOES: Record<ReportEventType, string> = {
  ReportCreated: 'Relato recebido',
  ReportViewed: 'Alguém do time abriu',
  ReportStateChanged: 'Movido',
  ReportInternalCommented: 'Comentário entre o time',
  ReportPublicCommented: 'Comentário para quem relatou',

  // As duas frases falam do **outro lado**, e usam o mesmo vocabulario do resto
  // do painel ("quem relatou"), e nao o do banco. O rotulo da etapa nao entra
  // aqui porque o historico nao o carrega: ele vive na carga do evento, e traze-lo
  // exigiria alargar a resposta para todas as linhas por causa de duas.
  ReportPublicStageChanged: 'Andou para quem relatou',
  ReportPublicStageUnmapped: 'Quem relatou continua vendo a mesma etapa',

  // **Sem o desfecho e sem o motivo.** O evento carrega o desfecho na carga, e o
  // historico nao a traz — alargar a resposta de todas as linhas por causa de uma
  // seria caro pelo mesmo motivo que o rotulo da etapa ficou de fora. O motivo nao
  // esta nem la: ele mora no encerramento, que e de onde a pagina publica o le.
  ReportClosed: 'Relato encerrado',

  // As duas frases dizem **quem** agiu, e nao o que. E a diferenca que da sentido
  // a etapa: todas as outras linhas do historico sao o time mexendo no relato, e
  // estas duas sao a pessoa do outro lado respondendo. A nota nao entra aqui — ela
  // aparece no bloco do encerramento, junto do motivo que a explica.
  ReportConfirmed: 'Quem relatou confirmou que resolveu',
  ReportReopened: 'Quem relatou reabriu',

  // **As duas dizem de quem e a vez**, que e o assunto do passo que as criou.
  // "Devolvido" e nao "comentado": a diferenca entre pedir contexto e recusar e
  // exatamente o que o historico precisava parar de embaralhar.
  ReportInfoRequested: 'Devolvido pedindo informação',
  ReportReplied: 'Quem relatou respondeu',

  // **"Deixou de estar encerrado", e nao "reaberto".** Reabrir e quem relatou
  // dizendo que o problema continua; isto e o time saindo da coluna que encerra e
  // desfazendo o proprio encerramento. Usar a mesma palavra faria a linha do tempo
  // atribuir a pessoa de fora um movimento que ela nunca soube que aconteceu.
  ReportClosureCancelled: 'Deixou de estar encerrado',
  // "Liberado", e nao "publicado": o relato so aparece de fato se o projeto
  // estiver publico, e a linha do tempo nao sabe disso. Dizer "publicado" num
  // projeto privado seria a linha afirmando uma coisa que nao aconteceu.
  ReportPublished: 'Liberado para o público',
  ReportModerationRejected: 'Não vai para o público',
  TeamCardCreated: 'Criou o card',
  TeamCardEdited: 'Editou o título ou a descrição',
  CardArchived: 'Arquivou',
  CardUnarchived: 'Desarquivou',
  CardTitleChanged: 'Reescreveu o título',
  CardAssigneeChanged: 'Mudou o responsável',
  CardPriorityChanged: 'Mudou a prioridade',
  CardLabelsChanged: 'Mudou as etiquetas',
  CardDueDateChanged: 'Mudou o prazo',
  CardLinked: 'Ganhou um vínculo',
  CardUnlinked: 'Perdeu um vínculo',
  CardSprintChanged: 'Mudou de sprint',
  CardPointsChanged: 'Mudou a estimativa',
}

/**
 * O vinculo na linha do tempo, visto deste card: o tipo vem do evento, e o numero e o
 * do outro card. Tipo que esta versao nao conhece cai na frase geral.
 */
const VINCULOS: Record<string, { ganhou: (n: string) => string; perdeu: (n: string) => string }> = {
  duplicate_of: {
    ganhou: (n) => `Marcado como duplicado de #${n}`,
    perdeu: (n) => `Deixou de ser duplicado de #${n}`,
  },
  duplicated_by: {
    ganhou: (n) => `#${n} marcado como duplicado deste`,
    perdeu: (n) => `#${n} deixou de ser duplicado deste`,
  },
  blocks: {
    ganhou: (n) => `Passou a bloquear #${n}`,
    perdeu: (n) => `Deixou de bloquear #${n}`,
  },
  blocked_by: {
    ganhou: (n) => `Bloqueado por #${n}`,
    perdeu: (n) => `Deixou de ser bloqueado por #${n}`,
  },
  relates_to: {
    ganhou: (n) => `Relacionado a #${n}`,
    perdeu: (n) => `Deixou de estar relacionado a #${n}`,
  },
}

/**
 * A frase de cada linha.
 *
 * Tipo que esta versao nao conhece aparece com o proprio valor, em vez de sumir:
 * a API pode ganhar um tipo antes de o painel ser atualizado, e linha do tempo com
 * buraco e pior do que linha do tempo com nome feio.
 */
function descrever(entrada: ReportHistoryEntryViewModel): string {
  const campo = descreverCampo(entrada)
  if (campo !== null) return campo

  if (entrada.Type !== 'ReportStateChanged') {
    return DESCRICOES[entrada.Type] ?? entrada.Type
  }

  // Sem coluna de origem: o relato entrou na fila agora, e nao veio de lugar
  // nenhum. "Movido de nenhuma para Backlog" seria uma frase que descreve um
  // caminho que ninguem percorreu.
  const destino = entrada.ToStateName ?? 'outra coluna'

  return entrada.FromStateName
    ? `Movido de ${entrada.FromStateName} para ${destino}`
    : `Colocado em ${destino}`
}

/**
 * As linhas dos campos do card, com o que mudou. A prioridade e as etiquetas vem
 * com o nome da epoca; quem passou pelo card, com o nome de agora — o evento guarda
 * so quem e, e nao como se chamava.
 */
function descreverCampo(entrada: ReportHistoryEntryViewModel): string | null {
  switch (entrada.Type) {
    case 'CardTitleChanged':
      return entrada.TitleRestored ? 'Tirou o título do time' : 'Reescreveu o título'
    case 'CardAssigneeChanged':
      // Nulo e ninguem; o texto vazio e alguem sem nome nem e-mail — que nao pode
      // virar "ficou sem responsavel".
      return entrada.To === null
        ? 'Ficou sem responsável'
        : `Passou para ${entrada.To || 'alguém sem nome'}`
    case 'CardPriorityChanged':
      return entrada.To ? `Prioridade: ${entrada.To}` : 'Ficou sem prioridade'
    case 'CardDueDateChanged':
      return entrada.To ? `Prazo: ${formatDay(entrada.To)}` : 'Ficou sem prazo'
    case 'CardLinked':
    case 'CardUnlinked': {
      const frases = entrada.From ? VINCULOS[entrada.From] : undefined
      if (!frases || !entrada.To) return null
      return entrada.Type === 'CardLinked' ? frases.ganhou(entrada.To) : frases.perdeu(entrada.To)
    }
    case 'CardSprintChanged':
      // Nulo e o backlog: o nome da epoca, como o da coluna.
      return entrada.To
        ? entrada.From
          ? `De ${entrada.From} para ${entrada.To}`
          : `Planejado na ${entrada.To}`
        : `De ${entrada.From ?? 'uma sprint'} para o backlog`
    case 'CardPointsChanged':
      return entrada.To !== null
        ? `Estimativa: ${formatPoints(entrada.To)}`
        : 'Ficou sem estimativa'
    case 'CardLabelsChanged': {
      const mudancas = [
        ...entrada.Added.map((nome) => `+ ${nome}`),
        ...entrada.Removed.map((nome) => `− ${nome}`),
      ]
      return mudancas.length > 0 ? `Etiquetas: ${mudancas.join(', ')}` : 'Mudou as etiquetas'
    }
    default:
      return null
  }
}

/** Os pontos como o time le: "2,5", sem o ".0" de quem guardou. */
function formatPoints(valor: string): string {
  const numero = Number(valor)
  return Number.isFinite(numero) ? numero.toLocaleString('pt-BR') : valor
}
