import { useCallback, useEffect, useRef } from 'react'
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
  const { data, loading, failed, revalidate } = useAsyncResource(
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

  return (
    <section className="border-border border-t pt-4">
      <h3 className="mb-2.5 font-medium text-detail text-fg">O que já aconteceu</h3>

      {loading && (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      )}

      {failed && (
        <p className="text-caption text-fg-muted leading-normal">
          O histórico não carregou. O relato acima está completo.
        </p>
      )}

      {data && data.length > 0 && (
        <ol className="flex flex-col gap-2">
          {data.map((entrada) => (
            <li
              key={entrada.PublicId}
              className="flex flex-wrap items-baseline gap-x-2 text-detail"
            >
              <span className="text-fg">{descrever(entrada)}</span>
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
    </section>
  )
}

const DESCRICOES: Record<ReportEventType, string> = {
  ReportCreated: 'Relato recebido',
  ReportViewed: 'Alguém do time abriu',
  ReportStateChanged: 'Movido',
  ReportInternalCommented: 'Comentário entre o time',
  ReportPublicCommented: 'Comentário para quem relatou',

  // As duas frases falam do **outro lado**, e usam o mesmo vocabulário do resto
  // do painel ("quem relatou"), e não o do banco. O rótulo da etapa não entra
  // aqui porque o histórico não o carrega: ele vive na carga do evento, e trazê-lo
  // exigiria alargar a resposta para todas as linhas por causa de duas.
  ReportPublicStageChanged: 'Andou para quem relatou',
  ReportPublicStageUnmapped: 'Não andou: coluna fora da jornada',

  // **Sem o desfecho e sem o motivo.** O evento carrega o desfecho na carga, e o
  // histórico não a traz — alargar a resposta de todas as linhas por causa de uma
  // seria caro pelo mesmo motivo que o rótulo da etapa ficou de fora. O motivo não
  // está nem lá: ele mora no encerramento, que é de onde a página pública o lê.
  ReportClosed: 'Relato encerrado',

  // As duas frases dizem **quem** agiu, e não o quê. É a diferença que dá sentido
  // à etapa: todas as outras linhas do histórico são o time mexendo no relato, e
  // estas duas são a pessoa do outro lado respondendo. A nota não entra aqui — ela
  // aparece no bloco do encerramento, junto do motivo que a explica.
  ReportConfirmed: 'Quem relatou confirmou que resolveu',
  ReportReopened: 'Quem relatou reabriu',

  // **As duas dizem de quem é a vez**, que é o assunto do passo que as criou.
  // "Devolvido" e não "comentado": a diferença entre pedir contexto e recusar é
  // exatamente o que o histórico precisava parar de embaralhar.
  ReportInfoRequested: 'Devolvido pedindo informação',
  ReportReplied: 'Quem relatou respondeu',

  // **"Deixou de estar encerrado", e não "reaberto".** Reabrir é quem relatou
  // dizendo que o problema continua; isto é o time saindo da coluna que encerra e
  // desfazendo o próprio encerramento. Usar a mesma palavra faria a linha do tempo
  // atribuir à pessoa de fora um movimento que ela nunca soube que aconteceu.
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
