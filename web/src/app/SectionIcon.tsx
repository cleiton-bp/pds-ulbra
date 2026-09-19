import type { ConsoleSection } from '@/app/navigation'
import { cn } from '@/shared/lib/cn'

/**
 * Um glifo por secao da lateral.
 *
 * Menu so de texto obriga a **ler** para achar, e a lateral e onde se procura de
 * relance — a forma chega antes da palavra. Sao os mesmos 12x12 e o mesmo traco
 * do `LockIcon`, que ocupa esta coluna nas secoes bloqueadas: alinhados, os dois
 * grupos parecem a mesma lista com estados diferentes, e nao duas listas.
 */
export function SectionIcon({
  section,
  className,
}: {
  section: ConsoleSection['key']
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 12 12"
      className={cn('flex-none', className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {section === 'start' && (
        // Bandeira fincada: "e daqui que se comeca".
        <>
          <path d="M3 10.6V1.8" />
          <path d="M3 2.4h6.2L7.9 4.4l1.3 2H3" />
        </>
      )}

      {section === 'keys' && (
        // Chave: anel e haste com um dente.
        <>
          <circle cx="4.2" cy="4.2" r="2.3" />
          <path d="M5.85 5.85 10.2 10.2" />
          <path d="M8.7 7.3 7.4 8.6" />
        </>
      )}

      {section === 'cycle' && (
        // Seta fechando uma volta: o relato sai, roda, e volta a quem o escreveu.
        // A ponta aberta e o ponto — a volta so fecha quando a pessoa responde.
        <>
          <path d="M10 6a4 4 0 1 1-1.4-3.05" />
          <path d="M10.4 1.5v2.1H8.3" />
        </>
      )}

      {section === 'reports' && (
        // Balao de fala: o que aparece nesta secao e alguem falando, e nao um
        // registro que o sistema produziu.
        <>
          <rect x="1.4" y="2" width="9.2" height="6.6" rx="1.6" />
          <path d="M4.1 8.6 3.5 10.6 6.1 8.6" />
        </>
      )}

      {section === 'tool' && (
        // O canto de uma pagina com a pilula parada nele: e literalmente o que
        // esta secao decide.
        <>
          <path d="M1.7 8.4V2.6a.9.9 0 0 1 .9-.9h6.8a.9.9 0 0 1 .9.9v2.2" />
          <rect x="5.4" y="6.9" width="5" height="3.2" rx="1.6" />
        </>
      )}

      {section === 'states' && (
        // Tres colunas lado a lado: e literalmente a fila que esta secao desenha.
        <>
          <rect x="1.4" y="2.2" width="2.6" height="7.6" rx="0.9" />
          <rect x="4.7" y="2.2" width="2.6" height="7.6" rx="0.9" />
          <rect x="8" y="2.2" width="2.6" height="7.6" rx="0.9" />
        </>
      )}

      {section === 'stages' && (
        // Uma linha com tres marcos: e a linha do tempo que quem relatou ve, e
        // nao as colunas de `states` — as duas telas se confundem, e os glifos
        // sao a primeira coisa que as separa de relance.
        <>
          <path d="M1.6 6h8.8" />
          <circle cx="2.4" cy="6" r="1.1" />
          <circle cx="6" cy="6" r="1.1" />
          <circle cx="9.6" cy="6" r="1.1" />
        </>
      )}

      {section === 'settings' && (
        // Controles deslizantes, e nao engrenagem: a 12px a engrenagem vira borrao.
        <>
          <path d="M1.6 4h8.8M1.6 8h8.8" />
          <circle cx="4.3" cy="4" r="1.35" />
          <circle cx="7.7" cy="8" r="1.35" />
        </>
      )}
    </svg>
  )
}
