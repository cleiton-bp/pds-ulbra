import type { WidgetLauncherIcon } from '@/contracts'
import { launcherIconParts } from '@/embed/launcherIcons'
import { cn } from '@/shared/lib/cn'

/**
 * Os desenhos do botao parado no site do cliente, em React — no seletor do painel e
 * onde mais o painel mostrar o icone.
 *
 * **Os tracos nao moram aqui**: vem de `embed/launcherIcons.ts`, sem framework, porque
 * o carregador desenha o mesmo botao na pagina do cliente sem React. Um desenho por
 * lugar divergiria no primeiro ajuste.
 */

/** O nome de cada desenho, para o seletor da configuracao. */
export const LAUNCHER_ICON_NAMES: Record<Exclude<WidgetLauncherIcon, 'None'>, string> = {
  Chat: 'Balão de conversa',
  Bug: 'Inseto',
  Lightbulb: 'Lâmpada',
  Question: 'Interrogação',
  Megaphone: 'Megafone',
  Star: 'Estrela',
}

/** Os desenhos, na ordem do seletor. */
export const LAUNCHER_ICONS = Object.keys(LAUNCHER_ICON_NAMES) as Array<
  Exclude<WidgetLauncherIcon, 'None'>
>

/** O desenho inteiro. Decorativo: o nome vem de quem usa (o texto do botao, ou o rotulo). */
export function LauncherIconSvg({
  icon,
  size,
  className,
}: {
  icon: WidgetLauncherIcon
  /** Em pixels: o tamanho do botao decide. */
  size: number
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={cn('flex-none', className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {launcherIconParts(icon).map((parte, index) => {
        const Tag = parte.tag
        // A ordem das pecas e fixa por desenho: o indice e a identidade delas.
        // biome-ignore lint/suspicious/noArrayIndexKey: as pecas nunca mudam de ordem
        return <Tag key={index} {...parte.attrs} />
      })}
    </svg>
  )
}
