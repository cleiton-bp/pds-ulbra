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
