import { useNavigate } from 'react-router-dom'
import { Button } from '@/shared/components/Button'

/**
 * Endereco que nao existe.
 *
 * Tela inteira, e nao um pedaco dentro da casca: esta rota fica **fora** do
 * `RequireSession`, entao quem digita errado cai aqui com sessao ou sem ela, e o
 * resultado precisa ser o mesmo nos dois casos.
 */
export function NotFoundScreen() {
  const navigate = useNavigate()

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-surface px-5 py-12 text-center">
      <NotFoundArt />

      <h1 className="mt-6 font-semibold text-fg text-notice">Não encontramos essa página</h1>

      <div className="mt-7 flex flex-wrap items-center justify-center gap-2">
        <Button variant="primary" onClick={() => navigate('/projects')}>
          Ir para os projetos
        </Button>
        <Button variant="quiet" onClick={() => navigate(-1)}>
          Voltar
        </Button>
      </div>
    </main>
  )
}

/**
 * Uma unica ilustracao serve aos dois temas: o traco e `currentColor`, herdado do
 * `text-fg`, e o miolo dos digitos e `fill-surface`. Trocar o tema reatribui as
 * duas variaveis e o desenho inverte sozinho — nao ha segunda copia para manter
 * em dia, nem imagem para o navegador buscar.
 *
 * Por isso ela e **embutida** e nao um arquivo `.svg`: dentro de um `<img>` ou de
 * um `background-image` o desenho fica isolado e nao enxerga variavel nenhuma da
 * pagina.
 */
function NotFoundArt() {
  return (
    <svg
      viewBox="60 70 670 310"
      className="w-full max-w-160 text-fg"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <path
          id="cloud"
          d="M 10,20 A 12,12 0 0,1 22,10 A 18,18 0 0,1 52,10 A 12,12 0 0,1 64,20 A 10,10 0 0,1 60,32 L 14,32 A 10,10 0 0,1 10,20 Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <path
          id="sparkle"
          d="M0,-12 L3,-3 L12,0 L3,3 L0,12 L-3,3 L-12,0 L-3,-3 Z"
          fill="currentColor"
        />
        <path
          id="digit-4"
          d="M 60,0 L 0,90 L 60,90 L 60,115 L 85,115 L 85,90 L 105,90 L 105,70 L 85,70 L 85,0 Z M 60,28 L 60,70 L 25,70 Z"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinejoin="round"
        />
        <path
          id="digit-0"
          d="M 45,0 C 15,0 0,20 0,57.5 C 0,95 15,115 45,115 C 75,115 90,95 90,57.5 C 90,20 75,0 45,0 Z M 45,22 C 58,22 65,35 65,57.5 C 65,80 58,93 45,93 C 32,93 25,80 25,57.5 C 25,35 32,22 45,22 Z"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinejoin="round"
        />
      </defs>

      <path
        className="animate-trace"
        d="M 170,275 A 250,280 0 0,1 630,275"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        opacity="0.55"
      />

      <g
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M 230,170 L 570,170" />
        <path d="M 400,120 L 400,200 L 500,200" />
        <path d="M 230,170 L 230,200" />
        <path d="M 570,170 L 570,200" />
        <path d="M 330,170 L 330,150" />
        <path d="M 415,170 L 415,155" />
        <path d="M 550,170 L 550,145" />
        <line x1="90" y1="190" x2="210" y2="190" strokeDasharray="8 6" />
        <line x1="590" y1="310" x2="710" y2="310" strokeDasharray="8 6" />
      </g>

      <circle className="animate-blink" cx="230" cy="200" r="4.5" fill="currentColor" />
      <circle
        className="animate-blink [animation-delay:500ms]"
        cx="400"
        cy="120"
        r="4.5"
        fill="currentColor"
      />
      <circle
        className="animate-blink [animation-delay:1000ms]"
        cx="500"
        cy="200"
        r="4.5"
        fill="currentColor"
      />
      <circle
        className="animate-blink [animation-delay:1500ms]"
        cx="570"
        cy="200"
        r="4.5"
        fill="currentColor"
      />

      <use href="#cloud" x="140" y="80" className="animate-drift" />
      <use
        href="#cloud"
        x="600"
        y="120"
        className="animate-drift [animation-direction:alternate-reverse] [animation-duration:2500ms]"
      />
      <use
        href="#cloud"
        x="70"
        y="300"
        className="animate-drift [animation-delay:1000ms] [animation-direction:alternate-reverse] [animation-duration:2500ms]"
      />
      <use href="#cloud" x="640" y="320" className="animate-drift [animation-delay:1500ms]" />

      {/* O deslocamento vai no `<g>` e nao no `<use>`: girar um `<use>` que tem
          `x`/`y` mede a caixa antes do deslocamento, e o brilho sai de vista. */}
      <g transform="translate(470 118)">
        <use href="#sparkle" className="animate-turn" />
      </g>
      <g transform="translate(120 250)">
        <use href="#sparkle" className="animate-turn [animation-duration:12s]" />
      </g>
      <g transform="translate(670 215)">
        <use href="#sparkle" className="animate-turn [animation-duration:6s]" />
      </g>

      <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none">
        <path d="M 180,140 L 192,152 M 192,140 L 180,152" />
        <path d="M 160,285 L 172,297 M 172,285 L 160,297" />
        <path d="M 680,265 L 692,277 M 692,265 L 680,277" />
      </g>

      <g className="fill-surface" transform="translate(245, 210)">
        {/* Contorno deslocado atras do numero: e o volume que o desenho de
            referencia tem, sem precisar de sombra nem de segunda cor. */}
        <g fill="none" opacity="0.5">
          <use href="#digit-4" x="-9" y="-9" />
          <use href="#digit-0" x="103" y="-9" />
          <use href="#digit-4" x="201" y="-9" />
        </g>
        <use href="#digit-4" x="0" y="0" />
        <use href="#digit-0" x="112" y="0" />
        <use href="#digit-4" x="210" y="0" />
      </g>
    </svg>
  )
}
