import { useEffect, useRef, useState } from 'react'
import type { CardPriorityViewModel } from '@/contracts'
import { Brand } from '@/shared/components/Brand'
import { CARD_COLOR_GLYPH } from '@/shared/components/CardChip'
import type { MiniCardProps } from '@/shared/components/cardFace'
import { MiniBoard, type MiniBoardColumn } from '@/shared/components/MiniBoard'
import { ReportTypeIconSvg } from '@/shared/components/ReportTypeGlyph'
import { SentConfirmation } from '@/shared/components/SentConfirmation'
import { cn } from '@/shared/lib/cn'

/**
 * O produto acontecendo, em laco e nos dois lados ao mesmo tempo.
 *
 * A esquerda e o site do cliente. A pessoa abre a ferramenta pelo botao dela, escolhe
 * o tipo, responde as perguntas curtas e envia; recebe um protocolo; e depois **o mesmo
 * lado vira a pagina que ela abre pelo link**, com o andamento do relato — a mesma trilha
 * de uma entrega, com o passo de agora aceso e o que vem depois apagado.
 *
 * A direita e o painel do time: o relato chega como card no quadro, alguem do time o
 * move de coluna, e embaixo de cada coluna esta o que quem relatou le com o card ali.
 * **A coluna e do time; a etapa e de quem relatou.** A ligacao entre as duas e o que faz
 * o andamento andar sozinho, sem ninguem avisar a mao.
 *
 * Os textos sao os de fabrica — o botao, o titulo do formulario, os tipos e as
 * perguntas, a confirmacao, as etapas — e o quadro e o `MiniBoard` das previas da
 * configuracao, montado com a frente do card de verdade. O formulario e a pagina de
 * acompanhamento sao desenhados a mao, compactos, porque a ferramenta de verdade roda num
 * quadro proprio que nao cabe numa maquete.
 *
 * **E maquete, e o cartucho "Simulação" fica a vista.** Nada aqui e captura de tela de
 * algo que roda.
 */

/** O que a pessoa digita em "O que aconteceu?". */
const RELATO = 'O botão de finalizar não responde no pagamento.'

/** O protocolo que ela recebe. */
const PROTOCOLO = 'H7QK-3M2X-P9WD'

/** Os tipos de fabrica, como a ferramenta os oferece; o escolhido e o primeiro. */
const TIPOS = [
  { nome: 'Defeito', icon: 'Bug', color: 'Red' },
  { nome: 'Melhoria', icon: 'Improvement', color: 'Green' },
  { nome: 'Dúvida', icon: 'Question', color: 'Purple' },
] as const

/**
 * As etapas que quem relatou le, com os textos de fabrica. Tres, e nao as cinco de
 * fabrica: e a jornada de um projeto que nasceu do quadro simples e ligou cada coluna a
 * uma etapa — a de cada empresa e dela.
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

/**
 * O que ja existia em cada coluna. Quadro vazio parece produto novo, e o card do relato
 * precisa chegar num lugar onde ja se trabalha.
 */
const OUTROS_CARDS: Readonly<Partial<Record<string, readonly MiniCardProps[]>>> = {
  'a-fazer': [{ title: 'Cupom não aplica', priority: MEDIA }],
  fazendo: [{ title: 'Foto some ao ampliar', priority: BAIXA, assignee: 'Bruno Lima' }],
  feito: [{ title: 'Texto do rodapé', assignee: 'Ana Souza' }],
}

const ETAPAS = [
  { rotulo: 'A pessoa relata', duracao: 5600 },
  { rotulo: 'Recebe o protocolo', duracao: 3200 },
  { rotulo: 'Chega no quadro do time', duracao: 3600 },
  { rotulo: 'O time move, ela acompanha', duracao: 3800 },
  { rotulo: 'Resolvido, ela confirma', duracao: 4400 },
]

/**
 * Em que coluna o card esta, por etapa — e, como cada coluna esta ligada a uma etapa da
 * jornada, tambem o passo que quem relatou le. `-1` e "ainda nao chegou".
 */
const DEGRAU = [-1, -1, 0, 1, 2]

/** Quanto a ferramenta espera fechada, so com o botao, antes de abrir. */
const ESPERA_DO_BOTAO = 1100

export function ProductShowcase() {
  const raiz = useRef<HTMLDivElement>(null)
  const [etapa, setEtapa] = useState(0)
  const [naTela, setNaTela] = useState(false)
  const [digitado, setDigitado] = useState('')
  /** A ferramenta aberta. Na primeira etapa ela comeca fechada: o botao e o que o site mostra. */
  const [aberta, setAberta] = useState(false)

  // Lido uma vez: quem muda a preferencia no meio da sessao recarrega a pagina.
  const [semMovimento] = useState(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  )

  // Fora da tela o laco para. Nao e economia teatral: sao dois temporizadores
  // redesenhando um bloco que ninguem esta vendo.
  useEffect(() => {
    const elemento = raiz.current
    if (!elemento) return

    const observador = new IntersectionObserver(([entrada]) => setNaTela(!!entrada?.isIntersecting))
    observador.observe(elemento)
    return () => observador.disconnect()
  }, [])

  useEffect(() => {
    if (semMovimento || !naTela) return

    const relogio = setTimeout(
      () => setEtapa((atual) => (atual + 1) % ETAPAS.length),
      ETAPAS[etapa]?.duracao ?? 3000,
    )
    return () => clearTimeout(relogio)
  }, [etapa, naTela, semMovimento])

  // A primeira etapa em tres tempos: o botao parado, a ferramenta abrindo, a resposta
  // sendo digitada. Nas outras ela ja esta aberta e o texto ja esta escrito.
  useEffect(() => {
    if (semMovimento || etapa !== 0) {
      setAberta(true)
      setDigitado(RELATO)
      return
    }

    setAberta(false)
    setDigitado('')

    let escrito = 0
    let maquina: ReturnType<typeof setInterval> | undefined
    const abrir = setTimeout(() => {
      setAberta(true)
      maquina = setInterval(() => {
        escrito += 1
        setDigitado(RELATO.slice(0, escrito))
        if (escrito >= RELATO.length && maquina) clearInterval(maquina)
      }, 26)
    }, ESPERA_DO_BOTAO)

    return () => {
      clearTimeout(abrir)
      if (maquina) clearInterval(maquina)
    }
  }, [etapa, semMovimento])

  // Sem movimento a maquete nao anda: mostra o fim, que e onde a historia chega.
  const passo = semMovimento ? ETAPAS.length - 1 : etapa
  const degrau = DEGRAU[passo] ?? -1

  return (
    <div ref={raiz}>
      <div className="grid items-stretch gap-4 lg:grid-cols-[1fr_auto_1fr] lg:gap-0">
        <SiteDoCliente passo={passo} degrau={degrau} aberta={aberta} digitado={digitado} />

        <Fio sentido={passo === 2 ? 'ida' : passo >= 3 ? 'volta' : null} />

        <QuadroDoTime degrau={degrau} />
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
        {ETAPAS.map((item, indice) => (
          <button
            key={item.rotulo}
            type="button"
            onClick={() => setEtapa(indice)}
            className={cn(
              'flex items-center gap-2 text-detail transition-colors',
              indice === passo ? 'text-fg' : 'text-fg-muted hover:text-fg',
            )}
          >
            <span
              className={cn(
                'size-1.5 rounded-full transition-colors',
                indice === passo ? 'bg-accent' : 'bg-muted-dot',
              )}
              aria-hidden="true"
            />
            {item.rotulo}
          </button>
        ))}
      </div>
    </div>
  )
}

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
    <div className="overflow-hidden rounded-xl border border-border bg-surface-raised text-left">
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

      <div className="relative h-104 p-5">{children}</div>
    </div>
  )
}

/**
 * O lado de quem relata. Enquanto o relato nao existe, e o site do cliente com a
 * ferramenta; depois, e a pagina que a pessoa abre pelo link.
 */
function SiteDoCliente({
  passo,
  degrau,
  aberta,
  digitado,
}: {
  passo: number
  degrau: number
  aberta: boolean
  digitado: string
}) {
  if (degrau >= 0) {
    return (
      <Moldura legenda={`…/acompanhar/${PROTOCOLO}`} cartucho="Simulação">
        <Acompanhamento degrau={degrau} />
      </Moldura>
    )
  }

  return (
    <Moldura legenda="loja.exemplo.com/checkout" cartucho="Simulação">
      <div className="flex flex-col gap-3" aria-hidden="true">
        <div className="h-3 w-2/5 rounded bg-surface-strong" />
        <div className="h-2 w-4/5 rounded bg-surface-sunken" />
        <div className="h-2 w-3/5 rounded bg-surface-sunken" />
        <div className="mt-1 grid grid-cols-2 gap-3">
          <div className="h-14 rounded-lg bg-surface-sunken" />
          <div className="h-14 rounded-lg bg-surface-sunken" />
        </div>
      </div>

      {aberta ? (
        // Ancorada no canto, como a ferramenta de verdade: abre por cima da pagina.
        <div className="absolute inset-x-4 bottom-4 animate-slide-up rounded-xl border border-border bg-surface p-4 sm:left-auto sm:w-76">
          {passo === 0 ? <Formulario digitado={digitado} /> : <Enviado />}
        </div>
      ) : (
        // O botao de fabrica: pilula, so o texto, a vinte pixels do canto.
        <span
          className="absolute right-5 bottom-5 animate-nudge rounded-full bg-accent px-4 py-2 font-medium text-accent-fg text-detail"
          aria-hidden="true"
        >
          Relatar
        </span>
      )}
    </Moldura>
  )
}

function Formulario({ digitado }: { digitado: string }) {
  const terminou = digitado.length >= RELATO.length

  return (
    <>
      <h3 className="font-semibold text-fg text-body">Conte o que aconteceu</h3>

      <p className="mt-3 text-caption text-fg-muted">O que é</p>
      <ul className="mt-1.5 flex flex-wrap gap-1.5">
        {TIPOS.map((tipo, indice) => (
          <li
            key={tipo.nome}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-caption',
              indice === 0 ? 'border-fg bg-surface-sunken text-fg' : 'border-border text-fg-muted',
            )}
          >
            <ReportTypeIconSvg icon={tipo.icon} className={CARD_COLOR_GLYPH[tipo.color]} />
            {tipo.nome}
          </li>
        ))}
      </ul>

      <p className="mt-3 text-caption text-fg-muted">O que você tentou fazer?</p>
      <p className="mt-1 rounded-lg border border-border bg-surface-sunken px-3 py-1.5 text-detail text-fg">
        Pagar com cartão
      </p>

      <p className="mt-2.5 text-caption text-fg-muted">O que aconteceu?</p>
      <p className="mt-1 min-h-9 rounded-lg border border-border bg-surface-sunken px-3 py-1.5 text-detail text-fg leading-relaxed">
        {digitado}
        {/* O cursor so existe enquanto alguem escreve. Parado depois da ultima
            letra, ele vira um risco que ninguem sabe o que e. */}
        {!terminou && (
          <span
            className="ml-px inline-block h-3.5 w-px translate-y-0.5 animate-pulse-soft bg-fg"
            aria-hidden="true"
          />
        )}
      </p>

      {terminou && (
        <div className="mt-3 flex items-center justify-between gap-3">
          {/* O print da tela, com a area marcada: o anexo que a ferramenta captura e a
              pessoa marca ali mesmo. */}
          <span className="inline-flex animate-pop items-center gap-1.5 rounded-md border border-border px-2 py-1 text-caption text-fg-muted">
            <svg viewBox="0 0 20 14" className="h-3.5 w-5 flex-none" aria-hidden="true">
              <rect
                x="0.5"
                y="0.5"
                width="19"
                height="13"
                rx="1.5"
                className="fill-surface-strong"
              />
              <rect
                x="11"
                y="3"
                width="6"
                height="5"
                rx="1"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.2"
                className="text-fg"
              />
            </svg>
            print marcado
          </span>

          <span className="rounded-lg bg-accent px-3 py-1.5 font-medium text-accent-fg text-caption">
            Enviar
          </span>
        </div>
      )}
    </>
  )
}

/**
 * O que a ferramenta mostra depois de enviar: a mesma peca da confirmacao de verdade,
 * com o texto de fabrica e o protocolo.
 */
function Enviado() {
  return (
    <div className="flex animate-pop flex-col gap-3">
      <SentConfirmation
        message="Recebemos. Anote o protocolo — é com ele que você acompanha."
        values={{ protocolo: PROTOCOLO }}
        trackingCode={PROTOCOLO}
      />

      {/* O link aparece uma vez so, na confirmacao: e por ele que a pessoa volta. */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-caption">
        <span className="text-fg underline underline-offset-2">Acompanhar este relato</span>
        <span className="rounded-md border border-border px-2 py-1 text-fg-muted">
          Copiar protocolo
        </span>
      </div>
    </div>
  )
}

/**
 * A pagina que quem relatou abre pelo link: o protocolo, o andamento com o passo de
 * agora, e no fim a pergunta que fecha o relato — e a pessoa que confirma que resolveu.
 */
function Acompanhamento({ degrau }: { degrau: number }) {
  const encerrado = degrau === JORNADA.length - 1

  return (
    <div className="flex h-full flex-col">
      <h3 className="font-semibold text-fg text-body">Seu relato</h3>
      <p className="mt-0.5 text-caption text-fg-muted">
        Protocolo <span className="font-mono text-fg">{PROTOCOLO}</span>
      </p>

      <p className="mt-4 font-semibold text-fg text-detail">Andamento</p>
      <ol className="mt-2 flex flex-col">
        {JORNADA.map((etapa, indice) => {
          const atual = indice === degrau
          const passou = indice < degrau
          const ultimo = indice === JORNADA.length - 1

          return (
            <li key={etapa.rotulo} className="flex gap-2.5">
              <div className="flex flex-none flex-col items-center">
                <Marcador atual={atual} passou={passou} />
                {!ultimo && (
                  <span className={cn('w-px flex-1', passou ? 'bg-fg-muted' : 'bg-border')} />
                )}
              </div>

              <div className={cn('min-w-0', !ultimo && 'pb-3')}>
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span
                    className={cn('text-detail', atual ? 'font-medium text-fg' : 'text-fg-muted')}
                  >
                    {etapa.rotulo}
                  </span>
                  {atual && (
                    <span className="rounded-full border border-border px-1.5 text-caption text-fg-muted">
                      agora
                    </span>
                  )}
                </div>
                {atual && (
                  <p className="mt-0.5 text-caption text-fg-muted leading-relaxed">
                    {etapa.descricao}
                  </p>
                )}
              </div>
            </li>
          )
        })}
      </ol>

      {encerrado && (
        <div className="mt-auto animate-pop border-border border-t pt-3">
          <p className="text-detail text-fg">E para você, isso resolveu?</p>
          {/* E a pessoa que fecha o relato — ou o reabre, pelo "Não, ainda não". */}
          <div className="mt-2 flex flex-wrap gap-2 text-caption">
            <span className="rounded-lg bg-accent px-3 py-1.5 font-medium text-accent-fg">
              Sim, resolveu
            </span>
            <span className="rounded-lg border border-border px-3 py-1.5 text-fg-muted">
              Não, ainda não
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * O ponto de cada passo, como na pagina de verdade: cheio no que ja passou, anel no
 * passo de agora, vazio no que ainda nao chegou.
 */
function Marcador({ atual, passou }: { atual: boolean; passou: boolean }) {
  return (
    <span
      className={cn(
        'mt-1.5 size-2.5 flex-none rounded-full',
        atual && 'border-2 border-fg bg-surface',
        passou && 'bg-fg-muted',
        !atual && !passou && 'border border-border',
      )}
      aria-hidden="true"
    />
  )
}

/**
 * O fio entre os dois lados. So em tela larga: empilhado, a sequencia ja conta. O ponto
 * vai do site ao painel quando o relato chega, e volta quando o time move o card.
 */
function Fio({ sentido }: { sentido: 'ida' | 'volta' | null }) {
  return (
    <div className="hidden w-20 items-center px-3 lg:flex" aria-hidden="true">
      <div className="relative h-px w-full bg-border">
        {sentido && (
          <span
            className={cn(
              '-top-0.5 absolute size-1.5 animate-travel rounded-full bg-accent',
              sentido === 'ida' ? 'left-0 [--distancia:3.5rem]' : 'right-0 [--distancia:-3.5rem]',
            )}
          />
        )}
      </div>
    </div>
  )
}

/** O lado do time: o quadro das previas da configuracao, com o card de verdade. */
function QuadroDoTime({ degrau }: { degrau: number }) {
  const coluna = COLUNAS[degrau]?.id ?? null
  const card: MiniCardProps | undefined =
    degrau < 0
      ? undefined
      : {
          title: 'Botão de pagar não responde',
          // O time pega o card ao move-lo: a prioridade e quem esta com ele chegam junto.
          priority: degrau >= 1 ? ALTA : null,
          assignee: degrau >= 1 ? 'Ana Souza' : null,
          className: 'animate-pop',
        }

  return (
    <Moldura legenda="painel · Trabalho">
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-3 border-border border-b pb-3">
          <Brand />
          <span className="text-caption text-fg-muted">Loja Online</span>
        </div>

        <MiniBoard
          className="mt-3"
          columns={COLUNAS}
          card={card}
          cardColumnId={coluna}
          otherCards={OUTROS_CARDS}
          columnClassName="w-auto min-w-36 flex-1"
        />

        <p className="mt-auto pt-2.5 text-caption text-fg-muted">{LEGENDA_DO_QUADRO[degrau + 1]}</p>
      </div>
    </Moldura>
  )
}

/** O que esta acontecendo no quadro, por degrau — o primeiro item e "ainda nao chegou". */
const LEGENDA_DO_QUADRO = [
  'Nenhum relato novo.',
  'Chegou agora, no topo de A fazer.',
  'Ana moveu o card para Fazendo. Do lado de fora, a etapa mudou junto.',
  'Feito. Do lado de fora, quem relatou lê Concluído e diz se resolveu.',
]
