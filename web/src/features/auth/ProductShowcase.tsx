import {
  type RefObject,
  useEffect,
  useId,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
} from 'react'
import { type CardPriorityViewModel, MAX_REPORT_ANSWER_LENGTH } from '@/contracts'
import {
  GAVETA,
  IDA_E_VOLTA,
  MOLA,
  MOLA_MS,
  noLayout,
  pararAnimacoes,
  semMovimento as preferePoucoMovimento,
  SAIDA,
} from '@/features/auth/movimento'
import { Brand } from '@/shared/components/Brand'
import { Button } from '@/shared/components/Button'
import { CARD_COLOR_CLASSES, CARD_COLOR_GLYPH } from '@/shared/components/CardChip'
import { type MiniCardProps, PersonAvatar, PriorityIcon } from '@/shared/components/cardFace'
import { MiniBoard, type MiniBoardColumn } from '@/shared/components/MiniBoard'
import { ReportTypeIconSvg } from '@/shared/components/ReportTypeGlyph'
import {
  type StatusTone,
  TONE_DOT,
  TONE_EDGE,
  TONE_FG,
  TONE_SURFACE,
} from '@/shared/components/statusTone'
import { cn } from '@/shared/lib/cn'

/**
 * O caminho de um relato, feito pelo visitante com as proprias maos.
 *
 * A esquerda e o site de um cliente, com o botao Relatar no canto; a direita, o painel
 * do time. O visitante relata como quem usa o sistema (escolhe o tipo, escreve do jeito
 * dele, envia e recebe o protocolo), passa a ser o time (arrasta o card de coluna, ou usa
 * o botao do card) e volta a ser quem relatou, que le a etapa mudar e diz se resolveu.
 * **A coluna e do time, e a etapa e de quem relatou**: e o que esta maquete mostra
 * acontecendo, sem ninguem avisar ninguem.
 *
 * **Nada anda sozinho, e nada se mexe de qualquer jeito.** Cada passo espera o clique, e
 * cada movimento tem um motivo e a curva dele:
 * - o Relatar vira o painel (o painel nasce recortado no tamanho e na cor do botao);
 * - enviar tem o tempo de enviar, o protocolo sai impresso letra por letra, e o card so
 *   chega ao quadro quando o ponto termina de atravessar o fio, assentando numa mola;
 * - o card arrastado levanta, inclina na direcao e na velocidade da mao, a coluna de
 *   destino abre espaco, e um gesto rapido de lado tambem joga o card;
 * - os outros cards andam para abrir e fechar espaco, em vez de pular;
 * - do lado de fora, o "agora" desliza de uma etapa para a outra e o trilho se enche.
 *
 * Quando o visitante para, um cursor de guia desliza ate o proximo alvo e toca nele (no
 * maximo tres vezes por passo, e nunca com o movimento reduzido). Com o movimento reduzido,
 * tudo acontece na hora, so com troca de opacidade.
 *
 * Os textos sao os de fabrica (o botao, o formulario, os tipos, a confirmacao, as etapas,
 * a pergunta do fim e a reabertura), e o quadro e o `MiniBoard` das previas da
 * configuracao. **E maquete, e o cartucho "Simulação" fica a vista**: nada sai daqui, nem
 * o que o visitante digita.
 */

/** O evento que a pagina dispara para chamar o guia na hora ("Experimentar sem entrar"). */
export const MOSTRAR_A_MAQUETE = 'maquete:mostrar'

/** O protocolo que quem relata recebe. */
const PROTOCOLO = 'H7QK-3M2X-P9WD'

/** As letras que passam pelo protocolo antes de ele assentar: as mesmas que ele usa. */
const SIMBOLOS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

/** O numero do card, como o time fala dele. */
const NUMERO_DO_CARD = 128

/** A confirmacao de fabrica, igual a da API e a da previa do formulario. */
const CONFIRMACAO = 'Recebemos o seu relato, e você acompanha o andamento pelo link abaixo.'

/** O raio do painel da ferramenta, para onde o recorte do botao cresce. */
const RAIO_DO_PAINEL = 12

/**
 * Os tipos de fabrica, cada um com um exemplo pronto para o visitante so clicar em Enviar.
 * O Defeito mostra a primeira das tres perguntas dele; Melhoria e Duvida, a caixa livre.
 */
const TIPOS = [
  {
    nome: 'Defeito',
    icon: 'Bug',
    color: 'Red',
    titulo: 'O botão de pagar não responde',
    pergunta: 'O que você tentou fazer?',
    resposta: 'Pagar com cartão',
  },
  {
    nome: 'Melhoria',
    icon: 'Improvement',
    color: 'Green',
    titulo: 'Guardar o cartão para a próxima compra',
    pergunta: 'O que você gostaria que mudasse, e por quê?',
    resposta: 'Digitar o cartão a cada compra cansa',
  },
  {
    nome: 'Dúvida',
    icon: 'Question',
    color: 'Purple',
    titulo: 'Dá para parcelar a compra?',
    pergunta: 'Qual é a sua dúvida?',
    resposta: 'Não achei onde escolher as parcelas',
  },
] as const

type Tipo = (typeof TIPOS)[number]

/**
 * As etapas que quem relatou le, com os textos de fabrica. Tres, e nao as cinco de
 * fabrica: e a jornada de um projeto que nasceu do quadro simples e ligou cada coluna a
 * uma etapa.
 */
const JORNADA = [
  { rotulo: 'Recebido', descricao: 'Seu relato chegou até a equipe e está na fila para ser lido.' },
  {
    rotulo: 'Em desenvolvimento',
    descricao: 'A equipe está trabalhando na solução do que você relatou.',
  },
  { rotulo: 'Concluído', descricao: 'A solução foi publicada e o seu relato está encerrado.' },
]

/** As colunas do quadro simples, cada uma ligada a uma etapa. */
const COLUNAS: MiniBoardColumn[] = [
  { id: 'a-fazer', name: 'A fazer', publicStage: 'Recebido' },
  { id: 'fazendo', name: 'Fazendo', publicStage: 'Em desenvolvimento' },
  { id: 'feito', name: 'Feito', publicStage: 'Concluído' },
]

const ULTIMA = COLUNAS.length - 1

/**
 * O tom de cada coluna, e da etapa ligada a ela: cinza no que chegou, azul no que o time
 * esta fazendo, verde no que terminou. E a cor que o quadro de verdade ja da as colunas, e
 * aqui ela acende dos dois lados no mesmo instante.
 */
const TOM_DA_COLUNA: StatusTone[] = ['todo', 'doing', 'done']
const TONS: Record<string, StatusTone> = { 'a-fazer': 'todo', fazendo: 'doing', feito: 'done' }

/** A cor de cada tipo, no ponto que atravessa o fio e no anel do card que chega. */
const COR_DO_TIPO: Record<Tipo['color'], { ponto: string; anel: string }> = {
  Red: { ponto: 'bg-chip-red-glyph', anel: 'border-chip-red-glyph' },
  Green: { ponto: 'bg-chip-green-glyph', anel: 'border-chip-green-glyph' },
  Purple: { ponto: 'bg-chip-purple-glyph', anel: 'border-chip-purple-glyph' },
}

const ALTA: CardPriorityViewModel = {
  PublicId: 'alta',
  Name: 'Alta',
  Color: 'Orange',
  IsActive: true,
}
const MEDIA: CardPriorityViewModel = {
  PublicId: 'media',
  Name: 'Média',
  Color: 'Yellow',
  IsActive: true,
}
const BAIXA: CardPriorityViewModel = {
  PublicId: 'baixa',
  Name: 'Baixa',
  Color: 'Blue',
  IsActive: true,
}

/** Quem pega o card quando ele sai de A fazer. */
const ANA = { UserPublicId: '', Name: 'Ana Souza', AvatarUrl: null, InTeam: true }

/**
 * Os cards do quadro um pouco menos acolchoados no celular, onde a coluna tem uns 90: com
 * o respiro de fabrica, "Cupom" quebrava no meio da palavra.
 */
const CARD_DO_QUADRO = 'max-sm:p-2'

/**
 * O que ja existia em cada coluna. Quadro vazio parece produto novo, e o card do relato
 * precisa chegar num lugar onde ja se trabalha.
 */
const OUTROS_CARDS: Readonly<Partial<Record<string, readonly MiniCardProps[]>>> = {
  'a-fazer': [{ title: 'Cupom não aplica', priority: MEDIA, className: CARD_DO_QUADRO }],
  fazendo: [
    {
      title: 'Foto some ao ampliar',
      priority: BAIXA,
      assignee: 'Bruno Lima',
      className: CARD_DO_QUADRO,
    },
  ],
  feito: [{ title: 'Texto do rodapé', assignee: 'Ana Souza', className: CARD_DO_QUADRO }],
}

/** O carrinho do site de exemplo. O total e a soma, para ninguem desconfiar da conta. */
const ITENS = [
  { nome: 'Camiseta básica, tamanho M', preco: 'R$ 59,90' },
  { nome: 'Caneca de cerâmica', preco: 'R$ 34,90' },
]

/** O motivo que vem escrito na reabertura, para o visitante so confirmar. */
const MOTIVO = 'No celular, o botão continua sem responder.'

/** Os passos do trilho, um por vez de quem age: quem relata, o time, o time, quem relatou. */
const PASSOS = ['Quem usa relata', 'O time pega o card', 'O time entrega', 'Quem relatou confirma']

type Desfecho = 'pergunta' | 'nota' | 'confirmado' | 'reabrindo'

/** Tudo o que aconteceu na maquete ate agora. */
interface Historia {
  /** A ferramenta aberta no site. */
  aberta: boolean
  tipo: number
  titulo: string
  resposta: string
  /** O visitante mexeu no texto: trocar de tipo deixa de reescrever por ele. */
  escreveu: boolean
  enviado: boolean
  /** O lado de quem relata mostra a pagina do protocolo, e nao mais o site. */
  andamento: boolean
  coluna: number
  /**
   * A etapa que quem relatou ve. **So anda para a frente**, como no produto: o time
   * voltar o card nao mexe na pagina de quem espera, e so quem relatou, ao reabrir,
   * faz a jornada voltar ao comeco.
   */
  etapaPublica: number
  /** O que quem relatou respondeu, com o card na ultima coluna. */
  desfecho: Desfecho
  nota: number | null
  motivo: string
  reaberto: boolean
}

export const INICIO: Historia = {
  aberta: false,
  tipo: 0,
  titulo: TIPOS[0].titulo,
  resposta: TIPOS[0].resposta,
  escreveu: false,
  enviado: false,
  andamento: false,
  coluna: 0,
  etapaPublica: 0,
  desfecho: 'pergunta',
  nota: null,
  motivo: MOTIVO,
  reaberto: false,
}

type Gesto =
  | { faz: 'abrir' }
  | { faz: 'fechar' }
  | { faz: 'escolher'; indice: number }
  | { faz: 'escrever'; campo: 'titulo' | 'resposta' | 'motivo'; valor: string }
  | { faz: 'enviar' }
  | { faz: 'acompanhar' }
  | { faz: 'mover'; coluna: number }
  | { faz: 'responder'; resolveu: boolean }
  | { faz: 'avaliar'; nota: number | null }
  | { faz: 'reabrir' }
  | { faz: 'desistir' }
  | { faz: 'ir'; passo: number }
  | { faz: 'recomecar' }

/** Exportado para o teste, que conduz a historia sem precisar arrastar no jsdom. */
export function seguir(historia: Historia, gesto: Gesto): Historia {
  switch (gesto.faz) {
    case 'abrir':
      return { ...historia, aberta: true }
    case 'fechar':
      return { ...historia, aberta: false }
    case 'escolher': {
      const tipo = TIPOS[gesto.indice]
      if (!tipo) return historia
      return historia.escreveu
        ? { ...historia, tipo: gesto.indice }
        : { ...historia, tipo: gesto.indice, titulo: tipo.titulo, resposta: tipo.resposta }
    }
    case 'escrever':
      return {
        ...historia,
        [gesto.campo]: gesto.valor,
        escreveu: historia.escreveu || gesto.campo !== 'motivo',
      }
    case 'enviar':
      return historia.titulo.trim() ? { ...historia, enviado: true, coluna: 0 } : historia
    case 'acompanhar':
      return { ...historia, andamento: true }
    case 'mover':
      // Confirmado, o relato acabou: o card fica onde esta.
      if (!historia.enviado || historia.desfecho === 'confirmado') return historia
      return {
        ...historia,
        coluna: gesto.coluna,
        etapaPublica: Math.max(historia.etapaPublica, gesto.coluna),
        andamento: true,
        desfecho: 'pergunta',
      }
    case 'responder':
      return { ...historia, desfecho: gesto.resolveu ? 'nota' : 'reabrindo' }
    case 'avaliar':
      return { ...historia, desfecho: 'confirmado', nota: gesto.nota }
    case 'reabrir':
      // De fabrica, o card reaberto volta para a primeira coluna, e o motivo e obrigatorio.
      return historia.motivo.trim()
        ? { ...historia, desfecho: 'pergunta', coluna: 0, etapaPublica: 0, reaberto: true }
        : historia
    case 'desistir':
      return { ...historia, desfecho: 'pergunta' }
    case 'ir':
      return irPara(historia, gesto.passo)
    case 'recomecar':
      return INICIO
  }
}

/** O comeco de cada passo do trilho. O que o visitante escreveu continua escrito. */
function irPara(historia: Historia, passo: number): Historia {
  const textos = {
    tipo: historia.tipo,
    titulo: historia.titulo.trim() ? historia.titulo : (TIPOS[historia.tipo] ?? TIPOS[0]).titulo,
    resposta: historia.resposta,
    escreveu: historia.escreveu,
    motivo: historia.motivo,
  }
  if (passo <= 0) return { ...INICIO, ...textos }
  return {
    ...INICIO,
    ...textos,
    aberta: true,
    enviado: true,
    andamento: passo > 1,
    coluna: Math.min(passo - 1, ULTIMA),
    etapaPublica: Math.min(passo - 1, ULTIMA),
  }
}

/** Em que passo do trilho a historia esta; o numero de passos quer dizer "acabou". */
function passoDa(historia: Historia): number {
  if (!historia.enviado) return 0
  if (historia.desfecho === 'confirmado') return PASSOS.length
  return Math.min(historia.coluna + 1, PASSOS.length - 1)
}

/** A frase de cima: o que fazer agora, numa frase so. */
function dicaDa(historia: Historia, tentouPagar: boolean): string {
  if (!historia.enviado) {
    if (historia.aberta) return 'Escolha o tipo, escreva do seu jeito se quiser e clique em Enviar.'
    return tentouPagar
      ? 'Use o Relatar, no canto da página, para contar ao time o que aconteceu.'
      : 'Clique em Relatar, no canto da página, como faria quem usa o seu sistema.'
  }
  if (historia.desfecho === 'confirmado')
    return 'Esse é o caminho inteiro de um relato, do botão até a confirmação.'
  if (historia.coluna === ULTIMA) {
    if (historia.desfecho === 'nota')
      return 'A nota é opcional, e quem relatou também pode preferir não responder.'
    if (historia.desfecho === 'reabrindo')
      return 'Quem reabre conta o que ainda acontece, e o card volta para a primeira coluna.'
    return 'Agora responda como quem relatou: isso resolveu?'
  }
  if (historia.coluna < historia.etapaPublica)
    return 'A etapa de quem relatou não volta quando o time recua o card.'
  if (historia.coluna === 1)
    return 'Do lado de fora a etapa mudou junto, e agora o card vai para Feito.'
  if (historia.reaberto)
    return 'O card voltou para A fazer com o motivo de quem reabriu, e o time segue dali.'
  return 'Agora você é o time: arraste o card para Fazendo, ou use o botão dele.'
}

type Lado = 'site' | 'quadro'

const LADOS: { id: Lado; rotulo: string }[] = [
  { id: 'site', rotulo: 'Quem relata' },
  { id: 'quadro', rotulo: 'O time' },
]

/** A travessia do ponto pelo fio: ida quando o relato sai do site, volta quando o card anda. */
interface Pulso {
  sentido: 'ida' | 'volta'
  /** Na ida, a cor do tipo do relato; na volta, o tom da coluna para onde o card foi. */
  cor: string
  vez: number
}

/** O que o lado do site faz com os cliques do visitante. */
interface AcoesDoSite {
  tentarPagar: (botao: HTMLButtonElement) => void
  abrir: () => void
  fechar: () => void
  escolher: (indice: number) => void
  escrever: (campo: 'titulo' | 'resposta' | 'motivo', valor: string) => void
  enviar: () => void
  acompanhar: () => void
  responder: (resolveu: boolean) => void
  avaliar: (nota: number | null) => void
  reabrir: () => void
  desistir: () => void
}

/** `element.animate` quando existe: o jsdom dos testes nao tem, e la tudo acontece na hora. */
function animar(
  elemento: Element | null | undefined,
  quadros: Keyframe[],
  opcoes: KeyframeAnimationOptions,
): Animation | null {
  return elemento?.animate?.(quadros, opcoes) ?? null
}

/**
 * A maquete inteira. `fim` aparece embaixo quando o relato termina: e a hora em que o
 * visitante acabou de ver o produto funcionar, e quem monta a pagina poe ali a entrada.
 */
export function ProductShowcase({ fim }: { fim?: React.ReactNode }) {
  const raiz = useRef<HTMLDivElement>(null)
  const [historia, contar] = useReducer(seguir, INICIO)
  const [tentouPagar, setTentouPagar] = useState(false)
  /** No celular cabe um lado por vez; na tela larga os dois aparecem e isto nao conta. */
  const [lado, setLado] = useState<Lado>('site')
  const [pulso, setPulso] = useState<Pulso | null>(null)
  /** Chegou de fora (envio, trilho, reabertura) e cai no quadro; movido, voa de onde estava. */
  const [chegou, setChegou] = useState(true)
  /** O card ja esta no quadro: depois do envio ele espera o ponto atravessar o fio. */
  const [noQuadro, setNoQuadro] = useState(false)
  /** Quantas vezes a pagina pediu o guia na hora. */
  const [chamado, setChamado] = useState(0)
  const relogios = useRef<ReturnType<typeof setTimeout>[]>([])

  // Lido uma vez: quem muda a preferencia no meio da sessao recarrega a pagina.
  const [semMovimento] = useState(preferePoucoMovimento)

  useEffect(() => () => relogios.current.forEach(clearTimeout), [])

  useEffect(() => {
    const chamar = () => setChamado((vez) => vez + 1)
    window.addEventListener(MOSTRAR_A_MAQUETE, chamar)
    return () => window.removeEventListener(MOSTRAR_A_MAQUETE, chamar)
  }, [])

  function depois(ms: number, fazer: () => void) {
    relogios.current.push(setTimeout(fazer, semMovimento ? 0 : ms))
  }

  /**
   * Leva o foco ao proximo alvo quando o de agora some da tela (o botao Relatar, ao abrir
   * a ferramenta), sem rolar a pagina, e so se o foco ja estava aqui dentro.
   */
  function focar(alvo: string) {
    const dono = document.activeElement
    if (dono && dono !== document.body && !raiz.current?.contains(dono)) return
    relogios.current.push(
      setTimeout(() =>
        raiz.current
          ?.querySelector<HTMLElement>(`[data-foco="${alvo}"]`)
          ?.focus({ preventScroll: true }),
      ),
    )
  }

  function pulsar(sentido: Pulso['sentido'], cor: string) {
    setPulso((atual) => ({ sentido, cor, vez: (atual?.vez ?? 0) + 1 }))
  }

  const site: AcoesDoSite = {
    tentarPagar(botao) {
      setTentouPagar(true)
      if (semMovimento) return
      // O botao quebrado do exemplo treme, cada vez menos, e nao faz nada: e o defeito.
      animar(
        botao,
        [
          { translate: '0' },
          { translate: '-6px 0' },
          { translate: '5px 0' },
          { translate: '-3px 0' },
          { translate: '2px 0' },
          { translate: '0' },
        ],
        { duration: 420, easing: 'ease-out' },
      )
    },
    abrir() {
      contar({ faz: 'abrir' })
      focar('titulo')
    },
    fechar() {
      contar({ faz: 'fechar' })
      focar('relatar')
    },
    escolher: (indice) => contar({ faz: 'escolher', indice }),
    escrever: (campo, valor) => contar({ faz: 'escrever', campo, valor }),
    enviar() {
      if (!historia.titulo.trim()) return
      contar({ faz: 'enviar' })
      setChegou(true)
      setNoQuadro(false)
      pulsar('ida', COR_DO_TIPO[(TIPOS[historia.tipo] ?? TIPOS[0]).color].ponto)
      focar('acompanhar')
      // O card so chega quando o ponto termina de atravessar o fio, e no celular o lado do
      // time aparece depois do protocolo lido.
      depois(560, () => setNoQuadro(true))
      depois(1300, () => setLado('quadro'))
    },
    acompanhar() {
      contar({ faz: 'acompanhar' })
      focar('andamento')
    },
    responder(resolveu) {
      contar({ faz: 'responder', resolveu })
      focar(resolveu ? 'estrela' : 'motivo')
    },
    avaliar(nota) {
      contar({ faz: 'avaliar', nota })
      focar('recomecar')
    },
    reabrir() {
      if (!historia.motivo.trim()) return
      contar({ faz: 'reabrir' })
      setChegou(true)
      pulsar('ida', TONE_DOT.todo)
      focar('andamento')
      depois(900, () => setLado('quadro'))
    },
    desistir() {
      contar({ faz: 'desistir' })
      focar('sim')
    },
  }

  function mover(coluna: number, peloBotao: boolean) {
    if (coluna === historia.coluna) return
    contar({ faz: 'mover', coluna })
    setChegou(false)
    pulsar('volta', TONE_DOT[TOM_DA_COLUNA[coluna] ?? 'todo'])
    if (peloBotao) focar(coluna < ULTIMA ? 'mover' : 'card')
    // Na ultima coluna a vez e de quem relatou, que esta do outro lado.
    if (coluna === ULTIMA) depois(800, () => setLado('site'))
  }

  function ir(passo: number) {
    contar({ faz: 'ir', passo })
    setChegou(true)
    setNoQuadro(passo > 0)
    setLado(passo === 0 || passo === PASSOS.length - 1 ? 'site' : 'quadro')
  }

  function recomecar() {
    relogios.current.forEach(clearTimeout)
    relogios.current = []
    contar({ faz: 'recomecar' })
    setTentouPagar(false)
    setPulso(null)
    setChegou(true)
    setNoQuadro(false)
    setLado('site')
    focar('relatar')
  }

  const passo = passoDa(historia)
  const comecou = historia.aberta || historia.enviado || tentouPagar
  const dica = dicaDa(historia, tentouPagar)

  return (
    <div ref={raiz} className="relative">
      <div className="flex items-center justify-between gap-4 max-sm:px-2">
        <h2 id="experimente" className="scroll-mt-20 font-semibold text-fg text-notice">
          Experimente o caminho de um relato
        </h2>

        {/* Escondido, e nao fora da arvore: aparecer no primeiro clique nao mexe no titulo. */}
        <Button
          size="sm"
          variant="secondary"
          data-foco="recomecar"
          onClick={recomecar}
          className={cn('flex-none', !comecou && 'invisible')}
        >
          Recomeçar
        </Button>
      </div>
      {/* A regiao viva e a mesma; a frase de dentro e que troca, e entra em foco.
          **A altura nao muda com a frase.** Uma dica de duas linhas depois de uma de uma
          empurrava a demonstracao inteira para baixo no meio do clique: no computador
          cada frase cabe numa linha (ate uns 78 caracteres), e abaixo dele a caixa ja
          guarda duas. */}
      <p
        aria-live="polite"
        className="mt-1 max-w-[64ch] text-body text-fg-muted max-lg:min-h-[2lh] max-sm:px-2"
      >
        <span key={dica} className="inline-block animate-materializa">
          {dica}
        </span>
      </p>

      <Alternador lado={lado} aoTrocar={setLado} />

      <div className="mt-4 grid items-stretch gap-4 lg:mt-6 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:gap-0">
        {/* No celular, o lado que volta entra do lado de onde ele mora: sair de `display:
            none` recomeca a animacao. Na tela larga, os dois chegam com a pagina. */}
        <div
          className={cn(
            'flex min-w-0 flex-col motion-safe:lg:animate-materializa lg:[animation-delay:360ms]',
            lado === 'site' ? 'motion-safe:max-lg:animate-entra-da-esquerda' : 'max-lg:hidden',
          )}
        >
          <p className="mb-2 hidden text-detail text-fg-muted lg:block">Quem usa o seu sistema</p>
          <LadoDoSite
            historia={historia}
            tentouPagar={tentouPagar}
            acoes={site}
            semMovimento={semMovimento}
          />
        </div>

        <Fio pulso={pulso} />

        <div
          className={cn(
            'flex min-w-0 flex-col motion-safe:lg:animate-materializa lg:[animation-delay:440ms]',
            lado === 'quadro' ? 'motion-safe:max-lg:animate-entra-da-direita' : 'max-lg:hidden',
          )}
        >
          <p className="mb-2 hidden text-detail text-fg-muted lg:block">O seu time, no painel</p>
          <QuadroDoTime
            historia={historia}
            noQuadro={noQuadro}
            chegou={chegou}
            semMovimento={semMovimento}
            aoPegar={() => setChegou(false)}
            aoMover={mover}
          />
        </div>
      </div>

      <Trilho passo={passo} aoIr={ir} />

      {passo === PASSOS.length && fim && (
        <div className="mt-8 flex animate-materializa flex-col gap-4 rounded-xl border border-border bg-surface-raised p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <p className="font-medium text-fg text-lead">Quer esse botão no seu sistema?</p>
          {fim}
        </div>
      )}

      <Guia
        raiz={raiz}
        chave={`${passo}-${historia.aberta}-${historia.andamento}-${historia.desfecho}-${lado}-${noQuadro}`}
        ativo={!semMovimento && passo < PASSOS.length}
        chamado={chamado}
      />
    </div>
  )
}

/** O seletor do celular, com o indicador que desliza de um lado ao outro. */
function Alternador({ lado, aoTrocar }: { lado: Lado; aoTrocar: (lado: Lado) => void }) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: um grupo de botoes, e nao um formulario: `fieldset` diria a quem usa leitor de tela que ha campos ali
    <div
      role="group"
      aria-label="Lado da simulação"
      className="relative mx-2 mt-5 grid grid-cols-2 rounded-lg bg-landing-mat-strong p-1 sm:mx-0 lg:hidden"
    >
      <span
        aria-hidden="true"
        className={cn(
          'absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-md bg-surface-raised shadow-xs transition-transform duration-300 ease-[var(--ease-in-out)] motion-reduce:transition-none',
          lado === 'quadro' && 'translate-x-full',
        )}
      />
      {LADOS.map(({ id, rotulo }) => (
        <button
          key={id}
          type="button"
          aria-pressed={lado === id}
          onClick={() => aoTrocar(id)}
          className={cn(
            'relative h-9 rounded-md text-detail transition-colors duration-200 pointer-coarse:h-11',
            lado === id ? 'font-medium text-fg' : 'text-fg-muted',
          )}
        >
          {rotulo}
        </button>
      ))}
    </div>
  )
}

/** O alvo da vez que esta a vista: o lado escondido no celular nao conta. */
function alvoDaVez(dono: HTMLElement): HTMLElement | null {
  for (const elemento of dono.querySelectorAll<HTMLElement>('[data-vez]')) {
    if (elemento.getClientRects().length > 0 && getComputedStyle(elemento).visibility !== 'hidden')
      return elemento
  }
  return null
}

/**
 * O guia de quem parou: um cursor que desliza ate o proximo alvo (o que tem `data-vez`) e
 * toca nele, com um anel que se abre no ponto do toque. Some ao primeiro movimento do
 * visitante, volta depois de uns segundos parado, no maximo tres vezes por passo, e so com
 * a maquete na tela. Nao clica em nada: so mostra onde.
 */
function Guia({
  raiz,
  chave,
  ativo,
  chamado,
}: {
  raiz: RefObject<HTMLDivElement | null>
  chave: string
  ativo: boolean
  chamado: number
}) {
  const cursor = useRef<HTMLSpanElement>(null)
  const toque = useRef<HTMLSpanElement>(null)

  // biome-ignore lint/correctness/useExhaustiveDependencies: a chave e o chamado sao gatilhos, para recomecar a contagem a cada passo e a cada pedido.
  useEffect(() => {
    const dono = raiz.current
    const ponteiro = cursor.current
    const anel = toque.current
    if (!ativo || !dono || !ponteiro || !anel || typeof IntersectionObserver === 'undefined') return

    let vezes = 0
    let naTela = false
    let acabou = false
    let relogio: ReturnType<typeof setTimeout> | undefined
    let animacoes: Animation[] = []

    const sumir = () => {
      for (const animacao of animacoes) animacao.cancel()
      animacoes = []
    }
    const agendar = (ms: number) => {
      clearTimeout(relogio)
      if (!acabou && vezes < 3) relogio = setTimeout(mostrar, ms)
    }
    const mexeu = () => {
      sumir()
      agendar(4200)
    }
    const tocar = (animacao: Animation | null) => {
      if (!animacao) return Promise.resolve()
      animacoes.push(animacao)
      return animacao.finished
    }

    async function mostrar() {
      const alvo = alvoDaVez(dono as HTMLElement)
      if (!naTela || !alvo || document.hidden || !ponteiro || !anel || !dono) {
        agendar(1600)
        return
      }
      vezes += 1
      const base = dono.getBoundingClientRect()
      const caixa = alvo.getBoundingClientRect()
      const x = caixa.left - base.left + Math.min(caixa.width * 0.62, caixa.width - 8)
      const y = caixa.top - base.top + caixa.height * 0.62
      const de = `translate(${x + 64}px, ${y + 54}px)`
      const ate = `translate(${x}px, ${y}px)`
      try {
        await Promise.all([
          tocar(
            animar(ponteiro, [{ opacity: 0 }, { opacity: 1 }], { duration: 200, fill: 'forwards' }),
          ),
          tocar(
            animar(ponteiro, [{ transform: `${de} scale(1)` }, { transform: `${ate} scale(1)` }], {
              duration: 780,
              easing: IDA_E_VOLTA,
              fill: 'forwards',
            }),
          ),
        ])
        await Promise.all([
          tocar(
            animar(
              ponteiro,
              [
                { transform: `${ate} scale(1)` },
                { transform: `${ate} scale(0.82)` },
                { transform: `${ate} scale(1)` },
              ],
              { duration: 280, easing: SAIDA, fill: 'forwards' },
            ),
          ),
          tocar(
            animar(
              anel,
              [
                { transform: `${ate} translate(-50%, -50%) scale(0.3)`, opacity: 0.55 },
                { transform: `${ate} translate(-50%, -50%) scale(1.6)`, opacity: 0 },
              ],
              { duration: 640, easing: SAIDA, fill: 'forwards' },
            ),
          ),
        ])
        await tocar(
          animar(ponteiro, [{ opacity: 1 }, { opacity: 0 }], {
            duration: 260,
            delay: 200,
            fill: 'forwards',
          }),
        )
        sumir()
        agendar(5600)
      } catch {
        // Interrompido por quem mexeu: o `mexeu` ja reagendou.
      }
    }

    const observador = new IntersectionObserver(
      ([entrada]) => {
        naTela = !!entrada && entrada.intersectionRatio >= 0.3
      },
      { threshold: [0, 0.3, 0.6] },
    )
    observador.observe(dono)
    dono.addEventListener('pointerdown', mexeu)
    dono.addEventListener('pointermove', mexeu)
    dono.addEventListener('keydown', mexeu)
    agendar(chamado > 0 ? 900 : 2600)

    return () => {
      acabou = true
      clearTimeout(relogio)
      sumir()
      observador.disconnect()
      dono.removeEventListener('pointerdown', mexeu)
      dono.removeEventListener('pointermove', mexeu)
      dono.removeEventListener('keydown', mexeu)
    }
  }, [raiz, chave, ativo, chamado])

  return (
    <>
      <span
        ref={toque}
        aria-hidden="true"
        className="pointer-events-none absolute top-0 left-0 z-sticky size-10 rounded-full border-2 border-fg opacity-0"
      />
      <span
        ref={cursor}
        aria-hidden="true"
        className="pointer-events-none absolute top-0 left-0 z-sticky origin-top-left opacity-0"
      >
        <svg viewBox="0 0 24 24" className="size-6 drop-shadow-md" aria-hidden="true">
          <path
            d="M5 3l13.5 8.7-6.3 1.2 3.7 7-2.7 1.4-3.7-7.1L5 18.6z"
            className="fill-fg stroke-surface-raised"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </>
  )
}

/** A janela de cada lado: a barra de endereco, o cartucho e o conteudo. */
function Moldura({
  legenda,
  cartucho,
  children,
}: {
  legenda: string
  cartucho?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-border bg-surface-raised text-left shadow-sm">
      <div className="flex items-center gap-2.5 border-border border-b bg-surface-sunken px-3.5 py-2.5">
        <span className="flex gap-1.5" aria-hidden="true">
          <span className="size-2 rounded-full bg-surface-strong" />
          <span className="size-2 rounded-full bg-surface-strong" />
          <span className="size-2 rounded-full bg-surface-strong" />
        </span>
        <span className="min-w-0 truncate rounded-md bg-surface px-2.5 py-1 font-mono text-caption text-fg-muted">
          {legenda}
        </span>
        {cartucho && (
          <span className="ml-auto flex-none rounded-full border border-border px-2 py-0.5 text-caption text-fg-muted">
            {cartucho}
          </span>
        )}
      </div>

      <div className="relative flex min-h-104 flex-1 flex-col p-3 sm:p-5">{children}</div>
    </div>
  )
}

/** O recorte do painel no tamanho e no lugar do botao Relatar, em pilula. */
function recorteDoBotao(painel: HTMLElement, botao: HTMLElement): string {
  const a = painel.getBoundingClientRect()
  const b = botao.getBoundingClientRect()
  const px = (valor: number) => `${Math.max(0, Math.round(valor))}px`
  return `inset(${px(b.top - a.top)} ${px(a.right - b.right)} ${px(a.bottom - b.bottom)} ${px(b.left - a.left)} round ${px(b.height / 2)})`
}

/** O lado de quem relata: o site com a ferramenta, e depois a pagina do protocolo. */
function LadoDoSite({
  historia,
  tentouPagar,
  acoes,
  semMovimento,
}: {
  historia: Historia
  tentouPagar: boolean
  acoes: AcoesDoSite
  semMovimento: boolean
}) {
  const painel = useRef<HTMLDivElement>(null)
  const botao = useRef<HTMLButtonElement>(null)
  const conteudo = useRef<HTMLDivElement>(null)
  const alturaAntes = useRef(0)
  const enviadoAntes = useRef(historia.enviado)

  // O painel nasce do botao: recortado no tamanho, no lugar e na cor do Relatar, ele cresce
  // ate o tamanho dele, e o conteudo entra em foco quando ja ha espaco para ele.
  useLayoutEffect(() => {
    const p = painel.current
    const b = botao.current
    if (!historia.aberta || !p || !b || semMovimento) return
    const cor = getComputedStyle(b).backgroundColor
    const fundo = getComputedStyle(p).backgroundColor
    animar(
      p,
      [
        { clipPath: recorteDoBotao(p, b), backgroundColor: cor },
        { clipPath: `inset(0px 0px 0px 0px round ${RAIO_DO_PAINEL}px)`, backgroundColor: fundo },
      ],
      { duration: 460, easing: GAVETA },
    )
    animar(
      conteudo.current,
      [
        { opacity: 0, filter: 'blur(4px)', transform: 'translateY(6px)' },
        { opacity: 0, filter: 'blur(4px)', transform: 'translateY(6px)', offset: 0.25 },
        { opacity: 1, filter: 'blur(0px)', transform: 'none' },
      ],
      { duration: 460, easing: SAIDA },
    )
  }, [historia.aberta, semMovimento])

  // Do formulario para a confirmacao, o painel muda de altura andando, e nao de um salto.
  useLayoutEffect(() => {
    const p = painel.current
    const mudou = enviadoAntes.current !== historia.enviado
    enviadoAntes.current = historia.enviado
    if (!p || !mudou || !historia.enviado || !alturaAntes.current || semMovimento) return
    animar(p, [{ height: `${alturaAntes.current}px` }, { height: `${p.offsetHeight}px` }], {
      duration: 320,
      easing: SAIDA,
    })
  })

  useEffect(() => {
    alturaAntes.current = painel.current?.offsetHeight ?? 0
  })

  /** Fechar e o caminho de volta: o painel encolhe para dentro do botao, mais rapido. */
  function fechar() {
    const p = painel.current
    const b = botao.current
    if (!p || !b || semMovimento || !p.animate) {
      acoes.fechar()
      return
    }
    const cor = getComputedStyle(b).backgroundColor
    const fundo = getComputedStyle(p).backgroundColor
    animar(conteudo.current, [{ opacity: 1 }, { opacity: 0 }], {
      duration: 120,
      easing: 'ease-out',
      fill: 'forwards',
    })
    animar(
      p,
      [
        { clipPath: `inset(0px 0px 0px 0px round ${RAIO_DO_PAINEL}px)`, backgroundColor: fundo },
        { clipPath: recorteDoBotao(p, b), backgroundColor: cor },
      ],
      { duration: 280, easing: SAIDA, fill: 'forwards' },
    )?.finished.then(
      () => acoes.fechar(),
      () => {},
    )
  }

  if (historia.andamento) {
    return (
      <Moldura legenda={`…/acompanhar/${PROTOCOLO}`} cartucho="Simulação">
        <Acompanhamento historia={historia} acoes={acoes} semMovimento={semMovimento} />
      </Moldura>
    )
  }

  return (
    <Moldura legenda="loja.exemplo.com/checkout" cartucho="Simulação">
      <Loja tentouPagar={tentouPagar} aoTentarPagar={acoes.tentarPagar} />

      {/* O botao fica montado com a ferramenta aberta, escondido embaixo dela: e dele que o
          painel nasce e para ele que volta. Reaparece sem transicao, porque o painel acabou
          de virar ele. */}
      <button
        ref={botao}
        type="button"
        data-foco="relatar"
        data-vez={historia.aberta ? undefined : ''}
        tabIndex={historia.aberta ? -1 : undefined}
        aria-hidden={historia.aberta || undefined}
        onClick={acoes.abrir}
        className={cn(
          'absolute right-4 bottom-4 rounded-full bg-landing-store px-4 py-2 font-medium text-detail text-landing-store-fg shadow-md transition-[scale,filter] duration-150 ease-[var(--ease-out)] hover:brightness-90 active:scale-[0.97] motion-reduce:transition-none pointer-coarse:py-2.5',
          historia.aberta &&
            'pointer-events-none scale-95 opacity-0 transition-[opacity,scale] duration-150',
        )}
      >
        Relatar
      </button>

      {historia.aberta && (
        <div
          ref={painel}
          className="absolute inset-x-3 bottom-3 overflow-hidden rounded-xl border border-border bg-surface-lifted shadow-lg sm:inset-x-auto sm:right-4 sm:bottom-4 sm:w-80"
        >
          <div ref={conteudo} className="p-4">
            {historia.enviado ? (
              <Confirmacao aoAcompanhar={acoes.acompanhar} />
            ) : (
              <Formulario
                historia={historia}
                acoes={acoes}
                aoFechar={fechar}
                semMovimento={semMovimento}
              />
            )}
          </div>
        </div>
      )}
    </Moldura>
  )
}

/** A pagina de pagamento do site de exemplo, com o botao que nao funciona. */
function Loja({
  tentouPagar,
  aoTentarPagar,
}: {
  tentouPagar: boolean
  aoTentarPagar: (botao: HTMLButtonElement) => void
}) {
  return (
    <div className="flex flex-col">
      <p className="font-semibold text-body text-fg">Finalizar compra</p>

      <ul aria-label="Carrinho do site de exemplo" className="mt-3 flex flex-col gap-2.5">
        {ITENS.map((item) => (
          <li key={item.nome} className="flex items-center gap-3 text-detail">
            <span className="size-9 flex-none rounded-md bg-surface-sunken" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-fg">{item.nome}</span>
            <span className="text-fg-muted tabular-nums">{item.preco}</span>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex items-center justify-between border-border border-t pt-3 text-detail">
        <span className="text-fg-muted">Total</span>
        <span className="font-medium text-fg tabular-nums">R$ 94,80</span>
      </div>

      <button
        type="button"
        onClick={(evento) => aoTentarPagar(evento.currentTarget)}
        className="mt-4 h-9 self-start rounded-lg border border-landing-store bg-surface-raised px-5 text-detail text-fg transition-[scale,background-color] duration-150 ease-[var(--ease-out)] hover:bg-surface-sunken active:scale-[0.97] pointer-coarse:h-10"
      >
        Pagar com cartão
      </button>
      {tentouPagar && (
        <p className="mt-2 animate-materializa text-caption text-fg-muted">
          O botão não respondeu.
        </p>
      )}
    </div>
  )
}

/** O formulario da ferramenta, com campos de verdade: o que o visitante escreve vira o card. */
function Formulario({
  historia,
  acoes,
  aoFechar,
  semMovimento,
}: {
  historia: Historia
  acoes: AcoesDoSite
  aoFechar: () => void
  semMovimento: boolean
}) {
  const id = useId()
  const tipo = TIPOS[historia.tipo] ?? TIPOS[0]
  const [enviando, setEnviando] = useState(false)
  const relogio = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const temTitulo = historia.titulo.trim().length > 0
  // No toque (`pointer-coarse:`), o fechar, os tipos, o campo e o Enviar crescem ate uns 40
  // para o dedo; com o mouse o formulario segue o desenho compacto da ferramenta.
  const campo =
    'mt-1 h-8 w-full rounded-lg border border-border-control bg-surface-raised px-2.5 text-detail text-fg transition-colors duration-150 disabled:text-fg-muted'

  useEffect(() => () => clearTimeout(relogio.current), [])

  /** Enviar leva o tempo de enviar: o botao mostra que esta indo antes da confirmacao. */
  function enviar() {
    if (!temTitulo || enviando) return
    if (semMovimento) {
      acoes.enviar()
      return
    }
    setEnviando(true)
    relogio.current = setTimeout(() => acoes.enviar(), 520)
  }

  return (
    <form
      aria-label="Formulário de relato de exemplo"
      onSubmit={(evento) => {
        evento.preventDefault()
        enviar()
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-semibold text-body text-fg">Conte o que aconteceu</h3>
        <button
          type="button"
          aria-label="Fechar"
          onClick={aoFechar}
          disabled={enviando}
          className="-mt-1 -mr-1 flex size-7 flex-none items-center justify-center rounded-md text-fg-muted transition-[background-color,color,scale] duration-150 hover:bg-surface-sunken hover:text-fg active:scale-[0.94] pointer-coarse:-mt-2.5 pointer-coarse:-mr-2.5 pointer-coarse:size-10"
        >
          <svg viewBox="0 0 12 12" className="size-3" aria-hidden="true">
            <path
              d="M2.5 2.5l7 7M9.5 2.5l-7 7"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      <fieldset className="mt-3 min-w-0" disabled={enviando}>
        <legend className="text-caption text-fg-muted">O que é</legend>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {TIPOS.map((opcao, indice) => {
            const marcado = indice === historia.tipo
            return (
              <button
                key={opcao.nome}
                type="button"
                aria-pressed={marcado}
                onClick={() => acoes.escolher(indice)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-caption transition duration-150 active:scale-[0.96] pointer-coarse:px-3 pointer-coarse:py-2.5',
                  marcado
                    ? 'border-landing-store bg-landing-store text-landing-store-fg'
                    : 'border-border text-fg-muted hover:border-border-control hover:text-fg',
                )}
              >
                <ReportTypeIconSvg
                  icon={opcao.icon}
                  className={marcado ? 'text-landing-store-fg' : CARD_COLOR_GLYPH[opcao.color]}
                />
                {opcao.nome}
              </button>
            )
          })}
        </div>
      </fieldset>

      <label htmlFor={`${id}-titulo`} className="mt-3 block text-caption text-fg-muted">
        Em poucas palavras, o que aconteceu?
      </label>
      <input
        id={`${id}-titulo`}
        data-foco="titulo"
        value={historia.titulo}
        maxLength={80}
        disabled={enviando}
        onChange={(evento) => acoes.escrever('titulo', evento.target.value)}
        className={cn(campo, 'pointer-coarse:h-10')}
      />

      <label htmlFor={`${id}-resposta`} className="mt-2.5 block text-caption text-fg-muted">
        {tipo.pergunta}
      </label>
      {/* Caixa de varias linhas, como a do quadro de verdade, com o mesmo limite de uma
          resposta: quem quer testar com o proprio texto ve ele inteiro. Cresce com o que
          se escreve ate um teto, e da para puxar pelo canto. */}
      <textarea
        id={`${id}-resposta`}
        value={historia.resposta}
        rows={2}
        maxLength={MAX_REPORT_ANSWER_LENGTH}
        disabled={enviando}
        onChange={(evento) => acoes.escrever('resposta', evento.target.value)}
        className={cn(
          campo,
          'field-sizing-content h-auto max-h-40 min-h-14 resize-y py-1.5 leading-normal',
        )}
      />

      <div className="mt-3 flex items-center justify-between gap-3">
        {/* O print da tela, com a area marcada: o anexo que a ferramenta captura e a pessoa
            marca ali mesmo. */}
        <span className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-caption text-fg-muted">
          <svg viewBox="0 0 20 14" className="h-3.5 w-5 flex-none" aria-hidden="true">
            <rect x="0.5" y="0.5" width="19" height="13" rx="1.5" className="fill-surface-strong" />
            <rect
              x="11"
              y="3"
              width="6"
              height="5"
              rx="1"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.2"
              className="text-chip-red-glyph"
            />
          </svg>
          print marcado
        </span>

        {/* O rotulo e o giro trocam desfocando, e nao de um quadro para o outro. */}
        <button
          type="submit"
          disabled={!temTitulo}
          aria-busy={enviando || undefined}
          data-vez={temTitulo && !enviando ? '' : undefined}
          className="relative rounded-lg bg-landing-store px-3.5 py-1.5 font-medium text-caption text-landing-store-fg transition-[scale,filter] duration-150 ease-[var(--ease-out)] enabled:hover:brightness-90 enabled:active:scale-[0.97] disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-fg-disabled motion-reduce:transition-none pointer-coarse:px-4 pointer-coarse:py-3"
        >
          <span
            className={cn(
              'block transition-[opacity,filter] duration-200',
              enviando && 'opacity-0 blur-[2px]',
            )}
          >
            Enviar
          </span>
          <span
            aria-hidden="true"
            className={cn(
              'absolute inset-0 flex items-center justify-center transition-[opacity,filter] duration-200',
              enviando ? 'opacity-100' : 'opacity-0 blur-[2px]',
            )}
          >
            <svg
              viewBox="0 0 16 16"
              className="size-3.5 animate-[spin_700ms_linear_infinite]"
              aria-hidden="true"
            >
              <circle
                cx="8"
                cy="8"
                r="6"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeDasharray="26 12"
              />
            </svg>
          </span>
        </button>
      </div>
    </form>
  )
}

/** Uma letra sorteada para cada posicao ainda nao impressa; o traco fica onde esta. */
function embaralhar(valor: string, prontos: number): string {
  return [...valor]
    .map((letra, indice) =>
      letra === '-' || indice < prontos
        ? letra
        : (SIMBOLOS[Math.floor(Math.random() * SIMBOLOS.length)] ?? letra),
    )
    .join('')
}

/**
 * O protocolo saindo impresso: as letras sorteadas assentam uma a uma, da esquerda para a
 * direita. Quem le com leitor de tela recebe o protocolo pronto, e nao o sorteio.
 */
function Codigo({ valor, aoTerminar }: { valor: string; aoTerminar?: () => void }) {
  const [semMovimento] = useState(preferePoucoMovimento)
  const [impressao, setImpressao] = useState(() =>
    semMovimento
      ? { texto: valor, prontos: valor.length }
      : { texto: embaralhar(valor, 0), prontos: 0 },
  )
  const avisar = useRef(aoTerminar)
  avisar.current = aoTerminar

  useEffect(() => {
    if (semMovimento) {
      avisar.current?.()
      return
    }
    const inicio = performance.now()
    let ultimo = -1
    let quadro = 0
    const passo = () => {
      const t = performance.now() - inicio
      const tique = Math.floor(t / 40)
      if (tique !== ultimo) {
        ultimo = tique
        const prontos = Math.floor(t / 36)
        setImpressao({ texto: embaralhar(valor, prontos), prontos })
      }
      if (t < valor.length * 36) quadro = requestAnimationFrame(passo)
      else {
        setImpressao({ texto: valor, prontos: valor.length })
        avisar.current?.()
      }
    }
    quadro = requestAnimationFrame(passo)
    return () => cancelAnimationFrame(quadro)
  }, [valor, semMovimento])

  return (
    <p className="font-mono text-lead tracking-wide">
      <span className="sr-only">{valor}</span>
      {/* A letra sorteada fica em cinza; a que assentou passa para a tinta. */}
      <span aria-hidden="true">
        {[...impressao.texto].map((letra, indice) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: a posicao e a identidade da letra no protocolo.
            key={indice}
            className={cn(
              'transition-colors duration-150',
              letra === '-' || indice < impressao.prontos ? 'text-fg' : 'text-fg-muted',
            )}
          >
            {letra}
          </span>
        ))}
      </span>
    </p>
  )
}

/**
 * O que quem relata le logo depois de enviar, com o link que leva ao andamento. Mesmo
 * desenho da `SentConfirmation` das previas, montado aqui para o protocolo sair impresso.
 */
function Confirmacao({ aoAcompanhar }: { aoAcompanhar: () => void }) {
  const [carimbado, setCarimbado] = useState(false)
  return (
    <div className="flex flex-col gap-3">
      <p className="animate-materializa text-body text-fg leading-normal">{CONFIRMACAO}</p>
      <div className="relative animate-materializa rounded-lg border border-border bg-surface-raised p-4 [animation-delay:70ms]">
        <p className="mb-1.5 text-detail text-fg-muted">Protocolo</p>
        <Codigo valor={PROTOCOLO} aoTerminar={() => setCarimbado(true)} />
        {/* Quando a ultima letra assenta, o carimbo da primeira etapa cai na caixa, no tom
            cinza de Recebido: e a etapa que a pessoa vai ler primeiro pelo link. */}
        {carimbado && (
          <span
            aria-hidden="true"
            className="-rotate-6 absolute top-3.5 right-3.5 animate-carimbo rounded-md border-2 border-chip-gray-glyph px-1.5 py-0.5 font-semibold text-caption text-chip-gray-fg"
          >
            Recebido
          </span>
        )}
      </div>
      <button
        type="button"
        data-foco="acompanhar"
        onClick={aoAcompanhar}
        className="animate-materializa self-start text-detail text-fg underline underline-offset-4 transition-colors duration-150 [animation-delay:140ms] hover:text-fg-muted pointer-coarse:-my-3 pointer-coarse:py-3"
      >
        Acompanhar este relato
      </button>
    </div>
  )
}

/** A pagina que quem relatou abre pelo link: o titulo que escreveu, o protocolo e as etapas. */
function Acompanhamento({
  historia,
  acoes,
  semMovimento,
}: {
  historia: Historia
  acoes: AcoesDoSite
  semMovimento: boolean
}) {
  const lista = useRef<HTMLOListElement>(null)
  const [marca, setMarca] = useState<{ x: number; y: number; anda: boolean } | null>(null)

  // O "agora" e um so, e anda de uma etapa para a outra: medido no lugar novo antes da
  // pintura, ele desliza ate la em vez de sumir de uma linha e nascer na outra.
  // biome-ignore lint/correctness/useExhaustiveDependencies: a etapa publica e o gatilho; a medida e lida do DOM.
  useLayoutEffect(() => {
    const rotulo = lista.current?.querySelector<HTMLElement>('[data-etapa-atual]')
    // Escondido (o lado do site no celular, enquanto o visitante move o card), o rotulo
    // mede zero e o "agora" cairia em cima de Recebido: quem mede e o observador abaixo,
    // quando a lista volta a aparecer.
    if (!rotulo || rotulo.offsetParent === null) return
    const x = rotulo.offsetLeft + rotulo.offsetWidth + 8
    const y = rotulo.offsetTop
    setMarca((antes) => ({ x, y, anda: antes !== null && !semMovimento }))
  }, [historia.etapaPublica])

  // A lista volta a aparecer (a troca de lado no celular) ou muda de largura (o celular
  // deitado quebra a linha em outro lugar): o "agora" vai para a etapa de agora, andando.
  useLayoutEffect(() => {
    const dono = lista.current
    if (!dono || typeof ResizeObserver === 'undefined') return
    const observador = new ResizeObserver(() => {
      const rotulo = dono.querySelector<HTMLElement>('[data-etapa-atual]')
      if (!rotulo || rotulo.offsetParent === null) return
      const x = rotulo.offsetLeft + rotulo.offsetWidth + 8
      const y = rotulo.offsetTop
      setMarca((antes) =>
        antes && antes.x === x && antes.y === y
          ? antes
          : { x, y, anda: antes !== null && !semMovimento },
      )
    })
    observador.observe(dono)
    return () => observador.disconnect()
  }, [semMovimento])

  return (
    <div className="flex h-full flex-1 animate-materializa flex-col">
      <p className="text-caption text-fg-muted">Este é o registro do que você enviou.</p>
      <h3
        tabIndex={-1}
        data-foco="andamento"
        className="mt-1 break-words font-semibold text-body text-fg outline-none"
      >
        {historia.titulo}
      </h3>
      <p className="mt-0.5 text-caption text-fg-muted">
        Protocolo <span className="font-mono text-fg">{PROTOCOLO}</span>
      </p>

      {historia.reaberto && (
        <div className="mt-3 animate-materializa rounded-lg border border-border bg-surface-sunken px-3 py-2">
          <p className="font-medium text-detail text-fg">Você reabriu este relato</p>
          <p className="mt-0.5 break-words text-caption text-fg-muted">{historia.motivo}</p>
        </div>
      )}

      <p className="mt-4 font-semibold text-detail text-fg">Andamento</p>
      <ol ref={lista} className="relative mt-2 flex flex-col">
        {JORNADA.map((etapa, indice) => {
          const atual = indice === historia.etapaPublica
          const passou = indice < historia.etapaPublica
          const ultimo = indice === JORNADA.length - 1
          const tom = TOM_DA_COLUNA[indice] ?? 'todo'
          const tomSeguinte = TOM_DA_COLUNA[indice + 1] ?? 'todo'
          return (
            <li
              key={etapa.rotulo}
              aria-current={atual ? 'step' : undefined}
              className="flex gap-2.5"
            >
              <div className="flex flex-none flex-col items-center">
                <span
                  className={cn(
                    'mt-1.5 size-2.5 flex-none rounded-full transition duration-300 ease-[var(--ease-out)]',
                    // Passou: cheio no tom. Agora: anel no tom, maior. Futuro: vazado, sem cor.
                    atual && cn('scale-125 border-2 bg-surface', TONE_EDGE[tom]),
                    passou && TONE_DOT[tom],
                    !atual && !passou && 'border border-border-control',
                  )}
                  aria-hidden="true"
                />
                {/* O trecho do trilho se enche de cima para baixo, na cor da etapa a que chega. */}
                {!ultimo && (
                  <span className="relative w-px flex-1 bg-border" aria-hidden="true">
                    <span
                      className={cn(
                        'absolute inset-0 origin-top transition-transform duration-500 ease-[var(--ease-in-out)] motion-reduce:transition-none',
                        TONE_DOT[tomSeguinte],
                        passou ? 'scale-y-100' : 'scale-y-0',
                      )}
                    />
                  </span>
                )}
              </div>

              <div className={cn('min-w-0', !ultimo && 'pb-3')}>
                <span
                  data-etapa-atual={atual ? '' : undefined}
                  className={cn(
                    'text-detail transition-colors duration-300',
                    atual ? 'font-medium text-fg' : 'text-fg-muted',
                  )}
                >
                  {etapa.rotulo}
                </span>
                {atual && (
                  <p className="mt-0.5 animate-materializa text-caption text-fg-muted leading-relaxed [animation-delay:120ms]">
                    {etapa.descricao}
                  </p>
                )}
              </div>
            </li>
          )
        })}

        {marca && (
          <span
            style={{ transform: `translate(${marca.x}px, ${marca.y}px)` }}
            className={cn(
              'absolute top-0 left-0 rounded-full border px-1.5 text-caption',
              TONE_SURFACE[TOM_DA_COLUNA[historia.etapaPublica] ?? 'todo'],
              TONE_FG[TOM_DA_COLUNA[historia.etapaPublica] ?? 'todo'],
              // Anda e troca de cor junto: a etapa nova chega com o tom dela.
              marca.anda && 'transition duration-[420ms] ease-[var(--ease-in-out)]',
            )}
          >
            agora
          </span>
        )}
      </ol>

      {historia.coluna === ULTIMA && <Fechamento historia={historia} acoes={acoes} />}
    </div>
  )
}

/** O fim do relato, do lado de quem relatou: a pergunta, a nota ou a reabertura. */
function Fechamento({ historia, acoes }: { historia: Historia; acoes: AcoesDoSite }) {
  const id = useId()

  if (historia.desfecho === 'confirmado') {
    return (
      <div className="mt-auto animate-materializa rounded-lg border border-border bg-surface-sunken px-3.5 py-3">
        <p className="text-detail text-fg">Você confirmou que isso resolveu.</p>
        <p className="mt-1 text-caption text-fg-muted">
          {historia.nota === null
            ? 'Você preferiu não dar uma nota.'
            : `Sua nota: ${historia.nota} de 5.`}
        </p>
      </div>
    )
  }

  if (historia.desfecho === 'nota') {
    return (
      <div className="mt-auto animate-materializa border-border border-t pt-3">
        <Estrelas aoEscolher={acoes.avaliar} />
        <button
          type="button"
          onClick={() => acoes.avaliar(null)}
          className="mt-1.5 text-caption text-fg-muted underline underline-offset-4 transition-colors duration-150 hover:text-fg pointer-coarse:-mt-1.5 pointer-coarse:-mb-3 pointer-coarse:py-3"
        >
          Prefiro não responder
        </button>
      </div>
    )
  }

  if (historia.desfecho === 'reabrindo') {
    return (
      <form
        className="mt-auto animate-materializa border-border border-t pt-3"
        onSubmit={(evento) => {
          evento.preventDefault()
          acoes.reabrir()
        }}
      >
        <label htmlFor={`${id}-motivo`} className="block text-detail text-fg">
          O que ainda está acontecendo?
        </label>
        <textarea
          id={`${id}-motivo`}
          data-foco="motivo"
          rows={2}
          maxLength={200}
          value={historia.motivo}
          onChange={(evento) => acoes.escrever('motivo', evento.target.value)}
          className="mt-1.5 w-full resize-none rounded-lg border border-border-control bg-surface-raised px-2.5 py-1.5 text-detail text-fg leading-relaxed"
        />
        <div className="mt-2 flex flex-wrap gap-2">
          <Button type="submit" size="sm" variant="primary" disabled={!historia.motivo.trim()}>
            Reabrir o relato
          </Button>
          <Button size="sm" variant="quiet" onClick={acoes.desistir}>
            Voltar
          </Button>
        </div>
      </form>
    )
  }

  return (
    <div className="mt-auto animate-materializa border-border border-t pt-3">
      <p className="text-detail text-fg">E para você, isso resolveu?</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="primary"
          data-foco="sim"
          data-vez=""
          onClick={() => acoes.responder(true)}
        >
          Sim, resolveu
        </Button>
        <Button size="sm" onClick={() => acoes.responder(false)}>
          Não, ainda não
        </Button>
      </div>
    </div>
  )
}

/**
 * As cinco estrelas da nota. Acendem em sequencia ate onde o ponteiro ou o foco esta, e a
 * escolhida da um pulo antes de a resposta ir, para o clique ter onde cair.
 */
function Estrelas({ aoEscolher }: { aoEscolher: (nota: number) => void }) {
  const [realce, setRealce] = useState(0)
  const [escolhida, setEscolhida] = useState(0)
  const relogio = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const acesas = escolhida || realce

  useEffect(() => () => clearTimeout(relogio.current), [])

  function escolher(nota: number, estrela: HTMLButtonElement) {
    if (escolhida) return
    setEscolhida(nota)
    if (preferePoucoMovimento()) {
      aoEscolher(nota)
      return
    }
    animar(estrela, [{ scale: '1' }, { scale: '1.35' }, { scale: '1' }], {
      duration: 380,
      easing: SAIDA,
    })
    relogio.current = setTimeout(() => aoEscolher(nota), 260)
  }

  return (
    <fieldset className="min-w-0">
      <legend className="text-detail text-fg">Como foi o atendimento do seu relato?</legend>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: so apaga o realce quando o ponteiro sai; cada estrela e um botao de verdade */}
      <div className="mt-2 flex items-center gap-0.5" onMouseLeave={() => setRealce(0)}>
        {[1, 2, 3, 4, 5].map((nota) => (
          <button
            key={nota}
            type="button"
            aria-label={`Nota ${nota}`}
            data-foco={nota === 1 ? 'estrela' : undefined}
            onClick={(evento) => escolher(nota, evento.currentTarget)}
            onMouseEnter={() => setRealce(nota)}
            onFocus={() => setRealce(nota)}
            onBlur={() => setRealce(0)}
            className="rounded-md p-1 transition-[scale] duration-150 ease-[var(--ease-out)] hover:scale-110 active:scale-95 motion-reduce:transition-none pointer-coarse:p-2.5"
          >
            <svg
              viewBox="0 0 20 20"
              style={{ transitionDelay: nota <= acesas ? `${(nota - 1) * 30}ms` : '0ms' }}
              className={cn(
                'size-5 transition-[fill,stroke] duration-150',
                nota <= acesas
                  ? 'fill-rating-fill stroke-rating-edge'
                  : 'fill-transparent stroke-rating-empty',
              )}
              aria-hidden="true"
            >
              <path
                d="M10 2.5l2.3 4.8 5.2.7-3.8 3.6.9 5.2L10 14.3l-4.6 2.5.9-5.2-3.8-3.6 5.2-.7z"
                strokeWidth="1.3"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        ))}
      </div>
    </fieldset>
  )
}

/**
 * O fio entre os dois lados, so em tela larga: empilhado, a sequencia ja conta. O ponto
 * vai do site ao painel quando o relato sai, e volta quando o time move o card.
 */
function Fio({ pulso }: { pulso: Pulso | null }) {
  return (
    <div className="hidden w-16 items-center px-3 pt-7 lg:flex" aria-hidden="true">
      <div className="relative h-px w-full bg-border">
        {pulso && (
          <span
            key={pulso.vez}
            className={cn(
              '-top-0.5 absolute size-1.5 animate-travel-once rounded-full',
              pulso.cor,
              pulso.sentido === 'ida'
                ? 'left-0 [--distancia:2.5rem]'
                : 'right-0 [--distancia:-2.5rem]',
            )}
          />
        )}
      </div>
    </div>
  )
}

/** O que a mao esta fazendo com o card, quadro a quadro, fora do estado do React. */
interface Mao {
  x0: number
  y0: number
  ponteiro: number
  dx: number
  dy: number
  /** A velocidade de lado, em pixel por milissegundo, suavizada. */
  vx: number
  ultimoX: number
  ultimoT: number
  ultimoMovimento: number
  giro: number
  escala: number
  quadro: number
  pegou: boolean
}

/** De onde o card solto parte para o lugar novo. */
interface Voo {
  de: { x: number; y: number }
  dx: number
  dy: number
  giro: number
  escala: number
}

/** Cada card do quadro pelo titulo, que nao se repete. */
function chaveDe(elemento: HTMLElement): string {
  return elemento.querySelector('p')?.textContent ?? elemento.textContent ?? ''
}

/**
 * O lado do time: o quadro das previas da configuracao, com o card do relato que o
 * visitante arrasta de coluna, ou move pelo botao do card (o caminho do teclado).
 *
 * O card arrastado e desenhado direto no elemento a cada quadro, e nao pelo estado do
 * React: levanta (escala 1,035), inclina com a velocidade da mao (ate 9 graus, voltando a
 * zero quando a mao para) e segue o ponteiro. A coluna de destino abre o lugar dele. Solto,
 * ele voa de onde esta ate o lugar novo e assenta na mola; um gesto rapido de lado leva a
 * coluna vizinha mesmo sem chegar nela.
 */
function QuadroDoTime({
  historia,
  noQuadro,
  chegou,
  semMovimento,
  aoPegar,
  aoMover,
}: {
  historia: Historia
  noQuadro: boolean
  chegou: boolean
  semMovimento: boolean
  aoPegar: () => void
  aoMover: (coluna: number, peloBotao: boolean) => void
}) {
  const quadro = useRef<HTMLDivElement>(null)
  const card = useRef<HTMLElement>(null)
  const voo = useRef<Voo | null>(null)
  const mao = useRef<Mao | null>(null)
  const lugares = useRef(new Map<string, { x: number; y: number }>())
  const [vez, setVez] = useState(0)
  const [pegando, setPegando] = useState(false)
  const [alvo, setAlvo] = useState<number | null>(null)
  const [altura, setAltura] = useState(0)
  const temCard = historia.enviado && noQuadro
  const livre = temCard && historia.desfecho !== 'confirmado'

  function irmaos(): HTMLElement[] {
    return Array.from(
      quadro.current?.querySelectorAll<HTMLElement>(
        'li[data-column-id] > div > :not([data-voo]):not([data-vaga])',
      ) ?? [],
    )
  }

  /**
   * Onde o card esta **dentro do quadro**, e nao na tela. Medido na tela, rolar a pagina
   * ou a frase de cima mudar de tamanho parecia o card ter andado: no proximo desenho
   * (o clique em "Pagar com cartao", por exemplo) todos voavam pela distancia rolada.
   */
  function dentroDoQuadro(elemento: HTMLElement): { x: number; y: number } {
    const lugar = noLayout(elemento)
    const base = quadro.current ? noLayout(quadro.current) : { x: 0, y: 0 }
    return { x: lugar.x - base.x, y: lugar.y - base.y }
  }

  function medir() {
    for (const elemento of irmaos()) {
      if (elemento.offsetParent === null) lugares.current.delete(chaveDe(elemento))
      else lugares.current.set(chaveDe(elemento), dentroDoQuadro(elemento))
    }
  }

  // Os outros cards abrem e fecham espaco andando: cada um que mudou de lugar no layout
  // parte, de mentira, de onde estava, e chega ao lugar novo.
  useLayoutEffect(() => {
    for (const elemento of irmaos()) {
      const chave = chaveDe(elemento)
      // Escondido (o lado do time no celular), o elemento nao tem lugar: medir dali daria
      // zero, e ao aparecer ele voaria de um canto. Esquecido, ele so aparece no lugar.
      if (elemento.offsetParent === null) {
        lugares.current.delete(chave)
        continue
      }
      const agora = dentroDoQuadro(elemento)
      const antes = lugares.current.get(chave)
      lugares.current.set(chave, agora)
      if (!antes || semMovimento) continue
      const dx = antes.x - agora.x
      const dy = antes.y - agora.y
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue
      pararAnimacoes(elemento)
      animar(
        elemento,
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0px, 0px)' }],
        { duration: 460, easing: SAIDA },
      )
    }
  })

  // O card solto (pela mao ou pelo botao) voa de onde estava ate o lugar novo, e assenta.
  // biome-ignore lint/correctness/useExhaustiveDependencies: a vez e a coluna sao gatilhos; o voo e lido da ref.
  useLayoutEffect(() => {
    const elemento = card.current
    const v = voo.current
    voo.current = null
    if (!elemento || !v) return
    elemento.style.transform = ''
    if (semMovimento || elemento.offsetParent === null) return
    const para = noLayout(elemento)
    const dx = v.de.x + v.dx - para.x
    const dy = v.de.y + v.dy - para.y
    pararAnimacoes(elemento)
    animar(
      elemento,
      [
        { transform: `translate(${dx}px, ${dy}px) rotate(${v.giro}deg) scale(${v.escala})` },
        { transform: 'translate(0px, 0px) rotate(0deg) scale(1)' },
      ],
      { duration: MOLA_MS, easing: MOLA },
    )
  }, [vez, historia.coluna, semMovimento])

  useEffect(() => () => cancelAnimationFrame(mao.current?.quadro ?? 0), [])

  function colunaEm(x: number): number | null {
    const colunas = quadro.current?.querySelectorAll<HTMLElement>('[data-column-id]') ?? []
    for (const [indice, coluna] of Array.from(colunas).entries()) {
      const caixa = coluna.getBoundingClientRect()
      if (x >= caixa.left && x <= caixa.right) return indice
    }
    return null
  }

  function desenhar(m: Mao) {
    if (card.current)
      card.current.style.transform = `translate(${m.dx}px, ${m.dy}px) rotate(${m.giro}deg) scale(${m.escala})`
  }

  /** Um quadro do arrasto: o giro persegue a velocidade da mao, e volta a zero com ela parada. */
  function quadroDaMao() {
    const m = mao.current
    if (!m) return
    const parada = performance.now() - m.ultimoMovimento > 60
    const giroAlvo = parada ? 0 : Math.max(-9, Math.min(9, m.vx * 8))
    m.giro += (giroAlvo - m.giro) * 0.16
    m.escala += (1.035 - m.escala) * 0.25
    desenhar(m)
    medir()
    m.quadro = requestAnimationFrame(quadroDaMao)
  }

  function pegar(evento: React.PointerEvent<HTMLElement>) {
    // Um dedo so: o segundo toque no meio do arrasto nao faz o card pular.
    if (!livre || evento.button !== 0 || mao.current) return
    // O botao de mover e clique, e nao comeco de arrasto.
    if ((evento.target as HTMLElement).closest('button')) return
    const agora = performance.now()
    mao.current = {
      x0: evento.clientX,
      y0: evento.clientY,
      ponteiro: evento.pointerId,
      dx: 0,
      dy: 0,
      vx: 0,
      ultimoX: evento.clientX,
      ultimoT: agora,
      ultimoMovimento: agora,
      giro: 0,
      escala: 1,
      quadro: 0,
      pegou: false,
    }
    evento.currentTarget.setPointerCapture?.(evento.pointerId)
  }

  function arrastar(evento: React.PointerEvent<HTMLElement>) {
    const m = mao.current
    if (!m || m.ponteiro !== evento.pointerId) return
    const dx = evento.clientX - m.x0
    const dy = evento.clientY - m.y0
    if (!m.pegou) {
      // Uns pixels de folga: tremer o dedo no clique nao arrasta.
      if (Math.hypot(dx, dy) < 5) return
      m.pegou = true
      aoPegar()
      setPegando(true)
      setAltura(card.current?.offsetHeight ?? 0)
      if (!semMovimento) m.quadro = requestAnimationFrame(quadroDaMao)
    }
    const agora = performance.now()
    const dt = Math.max(1, agora - m.ultimoT)
    m.vx = m.vx * 0.6 + ((evento.clientX - m.ultimoX) / dt) * 0.4
    m.ultimoX = evento.clientX
    m.ultimoT = agora
    m.ultimoMovimento = agora
    m.dx = dx
    m.dy = dy
    if (semMovimento) {
      m.escala = 1
      desenhar(m)
    }
    const coluna = colunaEm(evento.clientX)
    setAlvo((antes) => (antes === coluna ? antes : coluna))
  }

  function soltar(evento: React.PointerEvent<HTMLElement>, valeOGesto = true) {
    const m = mao.current
    if (!m || m.ponteiro !== evento.pointerId) return
    mao.current = null
    cancelAnimationFrame(m.quadro)
    if (!m.pegou) return
    let destino = valeOGesto ? colunaEm(evento.clientX) : historia.coluna
    // Jogar tambem vale: um gesto rapido de lado leva o card a coluna vizinha.
    if (
      valeOGesto &&
      (destino === null || destino === historia.coluna) &&
      Math.abs(m.vx) > 0.45 &&
      Math.abs(m.dx) > 12
    )
      destino = historia.coluna + Math.sign(m.vx)
    const elemento = card.current
    voo.current = {
      de: elemento ? noLayout(elemento) : { x: 0, y: 0 },
      dx: m.dx,
      dy: m.dy,
      giro: m.giro,
      escala: m.escala,
    }
    setPegando(false)
    setAlvo(null)
    setVez((v) => v + 1)
    if (destino !== null) {
      const coluna = Math.max(0, Math.min(ULTIMA, destino))
      if (coluna !== historia.coluna) aoMover(coluna, false)
    }
  }

  function moverPeloBotao(coluna: number) {
    const elemento = card.current
    voo.current = {
      de: elemento ? noLayout(elemento) : { x: 0, y: 0 },
      dx: 0,
      dy: 0,
      giro: 0,
      escala: 1.03,
    }
    setVez((v) => v + 1)
    aoMover(coluna, true)
  }

  const destino = pegando && alvo !== null && alvo !== historia.coluna ? alvo : null

  return (
    <Moldura legenda="painel › Trabalho">
      <div ref={quadro} className="flex h-full flex-1 flex-col">
        <div className="flex items-center justify-between gap-3 border-border border-b pb-3">
          <Brand />
          <span className="text-caption text-fg-muted">Loja Online</span>
        </div>

        {/* No celular cada coluna fica com uns 90: so as palavras longas ("desenvolvimento")
            hifenizam, em vez de passar por baixo da coluna vizinha; as curtas quebram inteiras. */}
        <MiniBoard
          className="mt-3 gap-1.5 overflow-visible max-sm:hyphens-auto max-sm:[hyphenate-limit-chars:10_4_4] sm:gap-2"
          columns={COLUNAS}
          cardColumnId={COLUNAS[historia.coluna]?.id ?? null}
          highlightColumnId={destino === null ? null : (COLUNAS[destino]?.id ?? null)}
          dropSlot={
            destino === null ? undefined : (
              <div
                key={destino}
                data-vaga=""
                aria-hidden="true"
                style={{ height: altura }}
                className={cn(
                  'animate-abre-vaga rounded-lg border border-dashed',
                  TONE_EDGE[TOM_DA_COLUNA[destino] ?? 'todo'],
                )}
              />
            )
          }
          otherCards={OUTROS_CARDS}
          tones={TONS}
          stageLitColumnId={temCard ? (COLUNAS[historia.etapaPublica]?.id ?? null) : null}
          columnClassName="w-auto min-w-0 flex-1"
          cardSlot={
            temCard ? (
              <CardDoRelato
                ref={card}
                historia={historia}
                livre={livre}
                pegando={pegando}
                chegou={chegou}
                semMovimento={semMovimento}
                aoPegar={pegar}
                aoArrastar={arrastar}
                aoSoltar={(evento) => soltar(evento)}
                aoCancelar={(evento) => soltar(evento, false)}
                aoMover={moverPeloBotao}
              />
            ) : undefined
          }
        />

        {!temCard && (
          <p className="mt-auto pt-3 text-caption text-fg-muted">
            Nenhum relato novo por enquanto.
          </p>
        )}
      </div>
    </Moldura>
  )
}

/** O card do relato, com a frente do quadro de verdade: tipo, numero, prioridade e quem pegou. */
function CardDoRelato({
  ref,
  historia,
  livre,
  pegando,
  chegou,
  semMovimento,
  aoPegar,
  aoArrastar,
  aoSoltar,
  aoCancelar,
  aoMover,
}: {
  ref: RefObject<HTMLElement | null>
  historia: Historia
  livre: boolean
  pegando: boolean
  chegou: boolean
  semMovimento: boolean
  aoPegar: (evento: React.PointerEvent<HTMLElement>) => void
  aoArrastar: (evento: React.PointerEvent<HTMLElement>) => void
  aoSoltar: (evento: React.PointerEvent<HTMLElement>) => void
  aoCancelar: (evento: React.PointerEvent<HTMLElement>) => void
  aoMover: (coluna: number) => void
}) {
  const tipo: Tipo = TIPOS[historia.tipo] ?? TIPOS[0]
  const proxima = historia.coluna < ULTIMA ? COLUNAS[historia.coluna + 1] : undefined
  // O time pega o card ao move-lo: a prioridade e quem esta com ele chegam junto, e
  // ficam na reabertura, que muda a coluna e nao o dono.
  const pego = historia.coluna >= 1 || historia.reaberto
  // So o card que chega de fora traz o anel; o movido pela mao ja esta onde o olho esta.
  const [anel] = useState(() => chegou && !semMovimento)

  // Chegando de fora, o card cai no quadro: desce um fio do alto, entra em foco e assenta
  // na mola. Movido, quem o anima e o voo do quadro.
  // biome-ignore lint/correctness/useExhaustiveDependencies: so na montagem; cada coluna monta um card novo.
  useLayoutEffect(() => {
    const elemento = ref.current
    if (!elemento || !chegou || semMovimento || elemento.offsetParent === null) return
    animar(elemento, [{ transform: 'translateY(-18px) scale(1.04)' }, { transform: 'none' }], {
      duration: MOLA_MS,
      easing: MOLA,
    })
    animar(
      elemento,
      [
        { opacity: 0, filter: 'blur(4px)' },
        { opacity: 1, filter: 'blur(0px)' },
      ],
      {
        duration: 320,
        easing: SAIDA,
      },
    )
  }, [])

  return (
    <article
      ref={ref}
      aria-label={`Card do relato: ${historia.titulo}`}
      tabIndex={-1}
      data-foco="card"
      data-voo="relato"
      onPointerDown={aoPegar}
      onPointerMove={aoArrastar}
      onPointerUp={aoSoltar}
      onPointerCancel={aoCancelar}
      // No celular o respiro dos outros cards do quadro (`CARD_DO_QUADRO`): com 10 de cada
      // lado, o numero do card nao cabia na coluna de uns 90.
      className={cn(
        'relative rounded-lg border bg-surface-lifted p-2 text-left outline-none transition-shadow duration-200 sm:p-3',
        livre && 'cursor-grab touch-none select-none hover:border-border-control',
        pegando
          ? 'z-sticky cursor-grabbing border-border-control shadow-lg'
          : 'border-border shadow-xs',
      )}
    >
      {anel && (
        <span
          aria-hidden="true"
          className={cn(
            '-inset-[3px] pointer-events-none absolute animate-esfria rounded-[11px] border-2',
            COR_DO_TIPO[tipo.color].anel,
          )}
        />
      )}
      <p className="line-clamp-3 break-words text-detail text-fg leading-snug sm:text-body">
        {historia.titulo}
      </p>

      {/* No celular quem pegou o card desce para a linha de baixo quando nao cabe ao lado:
          preso a direita, o avatar ficava por cima do numero do card e da prioridade. */}
      <div className="mt-2.5 flex items-center justify-between gap-2 text-caption text-fg-muted max-sm:flex-wrap max-sm:gap-y-1.5">
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="inline-flex items-center gap-1 sm:gap-1.5">
            <span
              title={tipo.nome}
              className={cn(
                'inline-flex size-[18px] flex-none items-center justify-center rounded-sm border',
                CARD_COLOR_CLASSES[tipo.color],
              )}
            >
              <ReportTypeIconSvg icon={tipo.icon} className="size-3.5" />
              <span className="sr-only">{tipo.nome}</span>
            </span>
            <span className="font-medium text-fg-muted tabular-nums">#{NUMERO_DO_CARD}</span>
          </span>
          {pego && (
            <span className="animate-materializa [animation-delay:200ms]">
              <PriorityIcon priority={ALTA} />
            </span>
          )}
        </span>
        {pego && (
          <span className="animate-materializa [animation-delay:260ms]">
            <PersonAvatar pessoa={ANA} />
          </span>
        )}
      </div>

      {livre && proxima && (
        <button
          type="button"
          data-foco="mover"
          data-vez=""
          aria-label={`Mover para ${proxima.name}`}
          onClick={() => aoMover(historia.coluna + 1)}
          className="-mx-2 sm:-mx-3 -mb-2 sm:-mb-3 relative mt-2.5 flex w-[calc(100%+1rem)] items-center justify-center gap-1 rounded-b-lg border-border border-t py-1.5 text-caption text-fg-muted transition-[background-color,color] duration-150 hover:bg-surface-sunken hover:text-fg sm:w-[calc(100%+1.5rem)] pointer-coarse:py-2.5"
        >
          <span
            aria-hidden="true"
            className={cn(
              'size-1.5 flex-none rounded-full',
              TONE_DOT[TOM_DA_COLUNA[historia.coluna + 1] ?? 'todo'],
            )}
          />
          Para {proxima.name}
          <svg viewBox="0 0 12 12" className="size-3 flex-none max-sm:hidden" aria-hidden="true">
            <path
              d="M4.5 2.5L8 6l-3.5 3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}
    </article>
  )
}

/**
 * Os passos da simulacao, no desenho do trilho dos primeiros passos. Cada no e um botao
 * que leva ao comeco daquele passo, para quem quer ver o fim sem fazer o caminho. O trecho
 * entre dois nos se enche da esquerda para a direita quando o passo e feito.
 */
function Trilho({ passo, aoIr }: { passo: number; aoIr: (passo: number) => void }) {
  return (
    <nav aria-label="Passos da simulação" className="mt-6 max-sm:px-2">
      <ol
        className="grid"
        style={{ gridTemplateColumns: `repeat(${PASSOS.length}, minmax(0, 1fr))` }}
      >
        {PASSOS.map((rotulo, indice) => {
          const feito = indice < passo
          const atual = indice === passo
          return (
            <li key={rotulo} className="relative flex flex-col items-center">
              {indice < PASSOS.length - 1 && (
                <span
                  className="absolute top-[11px] left-1/2 h-0.5 w-full bg-border"
                  aria-hidden="true"
                >
                  <span
                    className={cn(
                      'block h-full origin-left bg-landing-done transition-transform duration-500 ease-[var(--ease-in-out)] motion-reduce:transition-none',
                      feito ? 'scale-x-100' : 'scale-x-0',
                    )}
                  />
                </span>
              )}
              <button
                type="button"
                aria-current={atual ? 'step' : undefined}
                onClick={() => aoIr(indice)}
                className="group relative flex flex-col items-center rounded-md px-1 pt-1.5 pb-1"
              >
                <span
                  className={cn(
                    'size-3 flex-none rounded-full transition duration-300 ease-[var(--ease-out)] group-hover:scale-125 motion-reduce:transition-none',
                    feito
                      ? 'bg-landing-done'
                      : atual
                        ? 'scale-125 border-2 border-fg bg-surface-raised'
                        : 'border border-fg-muted bg-landing-mat',
                  )}
                  aria-hidden="true"
                />
                <span
                  className={cn(
                    'mt-2 text-center text-caption leading-tight transition-colors duration-150',
                    atual
                      ? 'font-medium text-fg'
                      : feito
                        ? 'text-fg'
                        : 'text-fg-muted group-hover:text-fg',
                  )}
                >
                  {rotulo}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
