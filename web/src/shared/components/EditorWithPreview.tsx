import { type ReactNode, useState } from 'react'
import { BottomSheet } from '@/shared/components/BottomSheet'
import { PreviaNaFolha } from '@/shared/components/PreviewSection'
import { useMediaQuery } from '@/shared/hooks/useMediaQuery'
import { cn } from '@/shared/lib/cn'
import { guideTarget } from '@/shared/tour/guideStore'

/**
 * O editor de duas colunas das telas que mudam o que se ve — O botão, Formulário,
 * Anexos, Tipos de relato: **a esquerda, os controles; a direita, a previa presa ao
 * rolar**, a partir de `lg`. A previa no meio da coluna fazia quem mexia la embaixo rolar
 * para cima e para baixo a cada mudanca. Abaixo de `lg`, uma coluna, com a previa no
 * topo.
 *
 * **60% para os controles, 40% para a previa.** Metade e metade apertava o que se
 * configura (o passo a passo com codigo, na Privacidade, ficava estreito demais), e a
 * previa cabe inteira em menos: o formulario dela tem a largura de um formulario.
 *
 * **Os controles vem antes da previa no codigo**, e a previa so e desenhada no topo
 * (`order-first`): quem anda pelo Tab chega aos controles primeiro, e nao atravessa o
 * quadro da previa para comecar.
 *
 * **`-top-5`, e nao `top-6`**: o navegador mede o "grudar" a partir de dentro do
 * respiro de cima da area que rola (40 px), e com `top-6` a previa grudava a 64 px do
 * topo, com um vao branco em cima que so sumia no fim da tela. Assim ela gruda a uns
 * 20 px.
 *
 * Como usar: os grupos (`SettingsGroup`) vao em `children`, e a `PreviewSection` vai em
 * `preview` — direto, sem embrulho, porque e o pai dela que gruda e muda de ordem.
 *
 * **No celular e no tablet em pe, com `previewEmFolha`**, a previa sai do topo e abre numa
 * folha de baixo por um botao flutuante, "Ver prévia", preso ao pe da tela. A previa alta
 * no topo empurrava as escolhas para baixo, e quem mudava a cor la embaixo nao via o
 * resultado; presa no alto, ela tirava um terco da tela. Ao lado do botao, a tela pode
 * por uma acao (`acaoNoCelular`): em O botão, o Publicar quando ha mudanca, que no
 * titulo tambem saia da vista.
 */
export function EditorWithPreview({
  preview,
  children,
  className,
  previewEmFolha = false,
  acaoNoCelular,
  tituloDaPrevia = 'Prévia',
  folhaAlta = false,
}: {
  /** A previa, na coluna da direita, presa ao rolar. */
  preview: ReactNode
  /** Os controles, na coluna da esquerda, um embaixo do outro. */
  children: ReactNode
  className?: string
  /** No celular, a previa numa folha, pelo botao flutuante. Sem isto, ela fica no topo. */
  previewEmFolha?: boolean
  /** Ao lado do "Ver prévia", no celular: o Publicar da tela, por exemplo. */
  acaoNoCelular?: ReactNode
  /** O titulo da folha: o nome da previa ("Como aparece no card"), que la sai da moldura. */
  tituloDaPrevia?: string
  /**
   * A folha quase da altura da tela, com a previa preenchendo o que sobra: e a do
   * formulario (`PreviewSection`), que com a altura fixa aparecia cortado pela metade e
   * rolava duas vezes, a folha e o formulario.
   */
  folhaAlta?: boolean
}) {
  const estreita = useMediaQuery('(max-width: 63.99rem)')
  const [folha, setFolha] = useState(false)

  if (estreita && previewEmFolha)
    return (
      <div className={cn('flex min-w-0 flex-col gap-3', className)} {...guideTarget('opcoes')}>
        {children}
        {/* Preso ao pe da janela, no meio, acima da barra de gestos do telefone. So o botao
            recebe toque: a faixa em volta deixa passar para o que esta embaixo. */}
        <div className="pointer-events-none fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-sticky flex justify-center gap-2 px-4">
          <button
            type="button"
            onClick={() => setFolha(true)}
            {...guideTarget('previa')}
            className="pointer-events-auto flex h-11 animate-fade-in items-center gap-2 rounded-full border border-border bg-surface-raised px-4 font-medium text-body text-fg shadow-lg transition-transform duration-150 ease-out active:scale-[0.97] motion-reduce:transition-none dark:bg-surface-strong"
          >
            <svg
              viewBox="0 0 16 16"
              className="size-4 flex-none"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z" />
              <circle cx="8" cy="8" r="2" />
            </svg>
            Ver prévia
          </button>
          {acaoNoCelular && (
            <div className="pointer-events-auto flex animate-fade-in items-center rounded-full shadow-lg [&>button]:h-11 [&>button]:rounded-full [&>button]:px-5">
              {acaoNoCelular}
            </div>
          )}
        </div>
        <BottomSheet open={folha} onOpenChange={setFolha} title={tituloDaPrevia} alta={folhaAlta}>
          {/* Na folha, a previa perde a moldura e o titulo dela, que viram os da folha; o
              estado ("ainda não salvo") fica. Todas seguem o mesmo desenho: uma `section`
              com um `header` de titulo e estado. */}
          <div className="flex flex-1 flex-col [&>section>header>h2]:hidden [&>section>header]:justify-start [&>section]:rounded-none [&>section]:border-0 [&>section]:bg-transparent [&>section]:p-0">
            <PreviaNaFolha.Provider value>{preview}</PreviaNaFolha.Provider>
          </div>
        </BottomSheet>
      </div>
    )

  return (
    <div
      className={cn(
        // `grid-cols-1` e a coluna unica com minimo zero: sem ela, no celular a coluna
        // crescia ate o quadro de exemplo caber inteiro, e a tela rolava para o lado.
        'grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start',
        className,
      )}
    >
      <div
        className="flex min-w-0 flex-col gap-3 lg:col-start-1 lg:row-start-1"
        {...guideTarget('opcoes')}
      >
        {children}
      </div>
      <div
        className="order-first min-w-0 lg:sticky lg:-top-5 lg:order-none lg:col-start-2 lg:row-start-1"
        {...guideTarget('previa')}
      >
        {preview}
      </div>
    </div>
  )
}
