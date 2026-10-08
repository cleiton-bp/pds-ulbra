import { useNavigate, useOutletContext, useParams } from 'react-router-dom'
import type {
  ReportDetailViewModel,
  ReportStateCountViewModel,
  ReportSummaryViewModel,
  SprintViewModel,
} from '@/contracts'
import type { SemAoVivo } from '@/features/reports/LiveStatus'
import { ReportDialog } from '@/features/reports/ReportDialog'
import type { WorkListener } from '@/features/reports/useWorkRealtime'

/** O que a lista entrega para a rota do detalhe, por contexto de rota. */
export interface ReportListContext {
  projectPublicId: string
  /** O que ja foi carregado. `null` enquanto a primeira pagina nao chegou. */
  reports: ReportSummaryViewModel[] | null
  /** As colunas da fila, na ordem, vindas da contagem que a lista ja carregou. */
  colunas: ReportStateCountViewModel[] | null
  /** Avisa a lista de que este card mudou — de coluna, de texto ou de arquivo. */
  aoMudar: (report: ReportSummaryViewModel) => void
  /** Ouve os avisos do tempo real da tela, para o card aberto se atualizar sozinho. */
  assinarAvisos?: (ouvinte: WorkListener) => () => void
  /** Por que a tela esta sem atualizacao ao vivo, quando esta. */
  semAoVivo?: SemAoVivo
  /** Uma subtarefa nasceu no card aberto: a lista e o quadro a poem na tela. */
  aoCriarSubtarefa?: (subtarefa: ReportDetailViewModel) => void
  /** As sprints que nao fecharam, com a sprint ligada; nulo sem sprints. */
  sprints?: SprintViewModel[] | null
}

/**
 * O relato aberto, na rota filha da lista.
 *
 * **E rota filha, e nao uma tela no lugar da lista**, porque a lista continua
 * montada atras: quem estava na pagina tres, com um recorte escolhido, volta
 * exatamente para onde estava ao fechar. Uma tela separada perderia as duas
 * coisas e obrigaria a carregar tudo de novo.
 *
 * **O resumo vem da lista quando ela ja o tem**, e e o que faz o relato aparecer
 * na hora do clique. Quando o link e aberto direto — outra aba, colado num grupo,
 * pagina recarregada —, a lista pode nao ter aquele relato, e ai o dialogo busca
 * tudo sozinho.
 */
export function ReportDetailRoute() {
  const { reportPublicId = '' } = useParams()
  const {
    projectPublicId,
    reports,
    colunas,
    aoMudar,
    assinarAvisos,
    semAoVivo,
    aoCriarSubtarefa,
    sprints,
  } = useOutletContext<ReportListContext>()
  const navigate = useNavigate()

  const resumo = reports?.find((report) => report.PublicId === reportPublicId) ?? null

  return (
    <ReportDialog
      // A chave força um dialogo novo ao trocar de relato pela URL. Sem ela, o
      // estado do anterior sobreviveria e o contexto de um apareceria debaixo do
      // texto do outro por um instante.
      key={reportPublicId}
      projectPublicId={projectPublicId}
      reportPublicId={reportPublicId}
      resumo={resumo}
      colunas={colunas}
      aoMudar={aoMudar}
      assinarAvisos={assinarAvisos}
      semAoVivo={semAoVivo ?? null}
      aoCriarSubtarefa={aoCriarSubtarefa}
      sprints={sprints ?? null}
      // `..` e a lista, com o recorte e a rolagem onde estavam. `replace` mantem
      // o botao voltar do navegador levando para antes de a lista abrir, e nao de
      // volta para o relato que a pessoa acabou de fechar.
      aoFechar={() => navigate('..', { replace: true })}
    />
  )
}
