import { useEffect, useRef } from 'react'
import {
  useLocation,
  useNavigate,
  useNavigationType,
  useOutletContext,
  useParams,
} from 'react-router-dom'
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
  /**
   * Os cards na ordem em que a tela os mostra — a da lista, com o recorte e os filtros,
   * ou a do quadro, coluna por coluna. E dela que saem o anterior e o proximo do card
   * aberto. Sem ela, vale a ordem de `reports`.
   */
  ordem?: string[]
  /** Quem olha configura o projeto: o card mostra o atalho para o Andamento publico. */
  podeConfigurar?: boolean
  /** A regra do prazo perto (Ciclo): o card aberto destaca o prazo como a lista. */
  soonDays?: number
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
 *
 * **Anterior e proximo seguem a tela de onde se veio**: a ordem e os filtros da lista,
 * ou o quadro coluna por coluna. A triagem anda de card em card sem fechar e abrir —
 * e andar troca o endereco no lugar (`replace`), para o voltar do navegador levar a
 * lista, e nao a cada card visto no caminho.
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
    ordem,
    podeConfigurar,
    soonDays,
  } = useOutletContext<ReportListContext>()
  const navigate = useNavigate()

  const resumo = reports?.find((report) => report.PublicId === reportPublicId) ?? null

  const sequencia = ordem ?? reports?.map((report) => report.PublicId) ?? []
  const indice = sequencia.indexOf(reportPublicId)
  const anterior = indice > 0 ? (sequencia[indice - 1] ?? null) : null
  const proximo =
    indice >= 0 && indice < sequencia.length - 1 ? (sequencia[indice + 1] ?? null) : null

  /**
   * **Fechar volta no historico quando se veio da lista**, e so troca o endereco
   * quando o link foi aberto direto. Trocar sempre deixava a lista anterior no
   * historico, e o primeiro "voltar" do navegador depois de fechar nao mudava nada na
   * tela. Os cards abertos dentro do card (o pai, a subtarefa, o vinculado) entram no
   * historico, e fechar volta todos de uma vez.
   *
   * As entradas desde o card aberto pela lista ficam guardadas pela chave, com a de
   * agora: o voltar e o avancar do navegador chegam iguais (`POP`), e so a chave diz
   * para qual se foi. Contando passos, avancar descontava um — e o X levava ao card
   * anterior, e nao a lista.
   */
  const location = useLocation()
  const tipo = useNavigationType()
  const veioDaLista = useRef(tipo === 'PUSH')
  const caminho = useRef({ chaves: [location.key], aqui: 0 })
  useEffect(() => {
    const { chaves, aqui } = caminho.current
    if (chaves[aqui] === location.key) return
    if (tipo === 'PUSH')
      caminho.current = { chaves: [...chaves.slice(0, aqui + 1), location.key], aqui: aqui + 1 }
    else if (tipo === 'REPLACE')
      caminho.current = {
        chaves: chaves.map((chave, indice) => (indice === aqui ? location.key : chave)),
        aqui,
      }
    else if (chaves.includes(location.key))
      caminho.current = { chaves, aqui: chaves.indexOf(location.key) }
  }, [location.key, tipo])

  return (
    <ReportDialog
      // A chave forca um dialogo novo ao trocar de relato pela URL. Sem ela, o
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
      podeConfigurar={podeConfigurar ?? false}
      soonDays={soonDays}
      anterior={anterior}
      proximo={proximo}
      aoIrPara={(id) => navigate(`../${id}`, { replace: true })}
      aoFechar={() => {
        // `..` e a lista, com o recorte e a rolagem onde estavam.
        if (veioDaLista.current) navigate(-(caminho.current.aqui + 1))
        else navigate('..', { replace: true })
      }}
    />
  )
}
