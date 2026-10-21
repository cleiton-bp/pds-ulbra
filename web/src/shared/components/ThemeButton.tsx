import { useEffect, useRef, useState } from 'react'
import { cn } from '@/shared/lib/cn'
import { selectThemeLabel, useThemeStore } from '@/shared/lib/themeStore'

/**
 * Sol e lua, e nao texto. O desenho diz **onde a pessoa esta** — sol no tema claro,
 * lua no escuro —, e o rotulo diz para onde ela vai ("Mudar para o tema escuro"), no
 * `aria-label` e no `title`. Um responde a pergunta que o outro deixa.
 *
 * **Os dois desenhos ficam no botao o tempo todo**, um por cima do outro: ao trocar,
 * o que sai gira e some enquanto o outro gira e aparece. Trocar o `svg` inteiro
 * faria o desenho pular de um para o outro, sem o movimento.
 *
 * **A noite chega com estrelas, e o dia com um clarao.** Sao passageiros: nascem na
 * troca, piscam e somem — nada fica fixo no botao alem do sol ou da lua. Por isso sao
 * desenhados so durante a troca, e nao escondidos: um elemento que existe o tempo todo
 * com opacidade zero continua ocupando a arvore e o leitor de tela. Com movimento
 * reduzido a troca e seca, de proposito, e nem estrela nem clarao aparecem.
 *
 * **Some na tela estreita** por padrao: no celular o topo do painel tem o seletor, o
 * sino e a conta, e o botao empurrava o menu da conta para fora da tela. La o tema
 * continua no menu da conta. A tela de entrada nao tem esse menu, e pede o botao
 * sempre a vista (`alwaysVisible`).
 *
 * Em `shared` porque a casca e a tela de entrada desenham o mesmo botao.
 */
export function ThemeButton({ alwaysVisible = false }: { alwaysVisible?: boolean }) {
  const label = useThemeStore(selectThemeLabel)
  const theme = useThemeStore((state) => state.theme)
  const toggle = useThemeStore((state) => state.toggle)
  const efeito = useEfeitoDaTroca(theme)

  const noite = theme === 'dark'

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Mudar para o ${label.toLowerCase()}`}
      title={`Mudar para o ${label.toLowerCase()}`}
      className={cn(
        'group relative size-8 flex-none rounded-lg border border-border bg-surface-raised text-fg-muted transition-all duration-150 hover:bg-surface-sunken hover:text-fg active:scale-90',
        alwaysVisible ? 'block' : 'hidden sm:block',
      )}
    >
      <Sol visivel={!noite} />
      <Lua visivel={noite} />

      {efeito?.tipo === 'noite' && <Estrelas key={efeito.vez} />}
      {efeito?.tipo === 'dia' && <Clarao key={efeito.vez} />}
    </button>
  )
}

/**
 * O que acompanha a troca: estrelas quando escurece, o clarao quando clareia. Dura o
 * tempo da animacao e some. `vez` muda a cada troca, para a chave do React recomecar a
 * animacao mesmo em duas trocas seguidas para o mesmo lado.
 */
function useEfeitoDaTroca(theme: 'light' | 'dark') {
  const [efeito, setEfeito] = useState<{ tipo: 'noite' | 'dia'; vez: number } | null>(null)
  const anterior = useRef(theme)
  const vezes = useRef(0)

  // Lido uma vez: quem muda a preferencia no meio da sessao recarrega a pagina.
  const [semMovimento] = useState(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  )

  useEffect(() => {
    // So a troca anima; a pagina abrindo ja no escuro nao e uma noite chegando.
    if (anterior.current === theme) return
    anterior.current = theme
    if (semMovimento) return

    vezes.current += 1
    setEfeito({ tipo: theme === 'dark' ? 'noite' : 'dia', vez: vezes.current })

    const relogio = setTimeout(() => setEfeito(null), DURACAO_DO_EFEITO)
    return () => clearTimeout(relogio)
  }, [theme, semMovimento])

  return efeito
}

/** Um pouco mais que a estrela mais atrasada leva para piscar e sumir. */
const DURACAO_DO_EFEITO = 1300

/** O movimento de cada desenho: entra girando para o lugar, sai girando e encolhendo. */
const DESENHO =
  'absolute inset-0 m-auto size-4 transition-all duration-300 ease-out motion-reduce:transition-none'

function Sol({ visivel }: { visivel: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn(
        DESENHO,
        // Com o mouse em cima, os raios giram um pouco: o sol e vivo, nao um carimbo.
        visivel
          ? 'rotate-0 scale-100 opacity-100 group-hover:rotate-45'
          : '-rotate-90 scale-50 opacity-0',
      )}
    >
      <circle cx="8" cy="8" r="3" />
      <path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.13 1.13M11.47 11.47l1.13 1.13M3.4 12.6l1.13-1.13M11.47 4.53l1.13-1.13" />
    </svg>
  )
}

function Lua({ visivel }: { visivel: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn(
        DESENHO,
        // A lua balanca para o outro lado, para a troca ler como um giro so.
        visivel
          ? 'rotate-0 scale-100 opacity-100 group-hover:-rotate-12'
          : 'rotate-90 scale-50 opacity-0',
      )}
    >
      <path d="M8 2a4 4 0 0 0 6 6 6 6 0 1 1-6-6Z" />
    </svg>
  )
}

/**
 * As estrelas da noite chegando: quatro, de tamanhos diferentes, cada uma piscando
 * num instante — em volta da lua e uma delas fora do botao, que e o que faz parecer
 * ceu e nao enfeite. A posicao e o atraso sao de cada estrela, e nao uma classe por
 * estrela, porque sao quatro combinacoes que so este botao usa.
 */
const ESTRELAS = [
  { id: 'alta', style: { top: 3, right: 4, width: 6, animationDelay: '0ms' } },
  { id: 'fora', style: { top: -4, right: -3, width: 5, animationDelay: '120ms' } },
  { id: 'esquerda', style: { top: 12, left: 4, width: 4, animationDelay: '260ms' } },
  { id: 'baixa', style: { bottom: 4, right: 7, width: 4, animationDelay: '380ms' } },
]

function Estrelas() {
  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0 text-fg">
      {ESTRELAS.map((estrela) => (
        <svg
          key={estrela.id}
          viewBox="0 0 8 8"
          fill="currentColor"
          aria-hidden="true"
          className="absolute animate-twinkle"
          style={estrela.style}
        >
          <path d="M4 0 4.9 3.1 8 4 4.9 4.9 4 8 3.1 4.9 0 4 3.1 3.1Z" />
        </svg>
      ))}
    </span>
  )
}

/** O clarao do dia chegando: um anel que nasce no sol, cresce e some. */
function Clarao() {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-1.5 animate-flare rounded-full border border-fg"
    />
  )
}
