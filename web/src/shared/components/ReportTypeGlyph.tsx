import type { CardReportTypeViewModel, ReportTypeIcon } from '@/contracts'
import { cn } from '@/shared/lib/cn'

/**
 * Os desenhos dos tipos de relato — no card do painel, na tela Tipos de relato e no
 * botao da ferramenta.
 *
 * **Moram aqui, e nao no Trabalho**, porque tres lugares que nao se importam entre si
 * desenham o mesmo tipo: a tela de Trabalho, a de configuracao e o quadro que roda no
 * site do cliente. Um desenho por lugar divergiria no primeiro ajuste.
 *
 * **Cada um com forma propria**, no traco de 12x12 dos outros glifos: o defeito e um
 * ponto, a melhoria uma seta para cima, a duvida uma interrogacao, a ideia uma
 * lampada, o elogio um coracao e o resto um balao de conversa. A cor e do tipo, e vem
 * de quem desenha; a forma e o que separa um do outro para quem nao distingue a cor.
 */

/** O nome de cada desenho, para o seletor da configuracao e para quem nao ve. */
export const REPORT_TYPE_ICON_NAMES: Record<ReportTypeIcon, string> = {
  Bug: 'Defeito',
  Improvement: 'Melhoria',
  Question: 'Dúvida',
  Idea: 'Ideia',
  Praise: 'Elogio',
  Other: 'Outro',
}

/**
 * So os tracos, para ir dentro de um `svg` de `viewBox="0 0 12 12"` com
 * `stroke="currentColor"`. Desenho que esta versao nao conhece cai num circulo
 * neutro, em vez de sumir: a API pode ganhar um desenho antes de o pacote publicado
 * ser atualizado.
 */
export function ReportTypeGlyph({ icon }: { icon: ReportTypeIcon }) {
  switch (icon) {
    case 'Bug':
      return <circle cx="6" cy="6" r="2.2" fill="currentColor" stroke="none" />
    case 'Improvement':
      return <path d="M6 8.8V3.4M3.8 5.6 6 3.4l2.2 2.2" />
    case 'Question':
      return (
        <>
          <path d="M4.5 4.7a1.6 1.6 0 1 1 2.2 1.4c-.5.2-.7.6-.7 1.1" />
          <circle cx="6" cy="8.9" r=".55" fill="currentColor" stroke="none" />
        </>
      )
    case 'Idea':
      // A lampada: o bulbo, a base reta e o pe — o que ainda nao existe.
      return <path d="M4.6 7.6a2.7 2.7 0 1 1 2.8 0M4.6 7.6h2.8M5 9.4h2" />
    case 'Praise':
      // O coracao, so o contorno: o elogio tambem e relato.
      return <path d="M6 9.2 3.1 6.4a1.8 1.8 0 0 1 2.9-2.2 1.8 1.8 0 0 1 2.9 2.2Z" />
    case 'Other':
      // O balao de conversa: o que nao cabe nos outros.
      return <path d="M2.6 3.2h6.8v4.6H5.6L3.8 9.4V7.8H2.6Z" />
    default:
      return <circle cx="6" cy="6" r="2" />
  }
}

/** O desenho inteiro, no traco dos glifos do painel. Decorativo: o nome vem de quem usa. */
export function ReportTypeIconSvg({
  icon,
  className,
}: {
  icon: ReportTypeIcon
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 12 12"
      className={cn('size-3 flex-none', className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <ReportTypeGlyph icon={icon} />
    </svg>
  )
}

/**
 * O nome do tipo como o painel o escreve: o desativado vem marcado, como a
 * prioridade — continua no relato, e nao e mais oferecido.
 */
export function reportTypeName(type: Pick<CardReportTypeViewModel, 'Name' | 'IsActive'>): string {
  return type.IsActive ? type.Name : `${type.Name} (desativado)`
}
