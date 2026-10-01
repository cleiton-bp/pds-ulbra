import { type ChangeEvent, type ReactNode, useEffect, useRef, useState } from 'react'
import {
  ATTACHMENT_DISPLAY_SIZES,
  type AttachmentDisplaySize,
  type PublicMediaSettingsViewModel,
} from '@/contracts'
import type { Anexo } from '@/embed/attachments'
import { acceptAttribute, extensionOf, hasRoom } from '@/embed/attachments'
import { cn } from '@/shared/lib/cn'
import {
  DISPLAY_GRID_CLASS,
  DISPLAY_IMAGE_CLASS,
  DISPLAY_SIZE_FRACTION,
  DISPLAY_SIZE_LABEL,
  displaySizeClass,
} from '@/shared/lib/displaySize'
import { fileBadge } from '@/shared/lib/fileFormats'
import { formatBytes } from '@/shared/lib/formatBytes'

/** A classe dos botoes de anexar. Exportada para os botoes extras ficarem iguais. */
export const ATTACH_BUTTON_CLASS = cn(
  'h-8 rounded-lg border border-border bg-surface px-3 text-detail text-fg',
  'enabled:hover:bg-surface-sunken disabled:cursor-not-allowed disabled:text-fg-disabled',
)

/** O botao escolhido, na cor de quem instalou — a mesma do editor. */
const ESCOLHIDO =
  'bg-[var(--widget-accent,var(--accent))] text-[var(--widget-ink,var(--accent-fg))]'

/**
 * Escolher arquivos antes de enviar: as imagens no relato, os botoes e a recusa.
 *
 * **"Adicionar" poe a imagem logo abaixo do texto**, no tamanho escolhido — um terco
 * da linha, meia, tres quartos ou a linha inteira — e na ordem em que entrou. E o
 * relato como o time vai ve-lo, e como a pessoa vai reencontra-lo no acompanhamento:
 * o mesmo desenho, na mesma grade (ver `displaySize`).
 *
 * **Nao sobe nada.** E so a lista local — quem envia e quem monta a tela, depois de
 * o texto existir do lado de la.
 *
 * **Os botoes extras entram por fora** (`actions`), porque capturar existe no
 * quadro e nao na pagina de acompanhamento. O seletor e o mesmo nos dois lugares,
 * e e isso que este componente garante.
 *
 * **Toda imagem da lista abre no editor** (`onEdit`) — a escolhida, a colada e a
 * capturada. E por ali que a pessoa esconde o que nao quer mostrar antes de enviar.
 *
 * **O arquivo que nao e imagem vai numa lista logo abaixo das imagens** — o nome, o
 * tamanho, e o "remover". Nao ha o que mostrar de um PDF ou de um log, e do lado de
 * la ele e sempre baixado. Tem botao proprio, que so aparece quando o projeto aceita
 * arquivo.
 */
export function AttachmentPicker({
  media,
  anexos,
  recusa,
  onAdd,
  onRemove,
  actions,
  onEdit,
  onResize,
  disabled = false,
}: {
  media: PublicMediaSettingsViewModel
  anexos: Anexo[]
  recusa: string | null
  onAdd: (arquivos: File[]) => void
  onRemove: (id: string) => void
  /** Botoes a mais, ao lado de "Anexar imagem" e "Anexar arquivo". */
  actions?: ReactNode
  /** Abre a imagem no editor. Sem ele, a imagem so mostra. */
  onEdit?: (id: string) => void
  /** Muda o tamanho em que a imagem aparece. Sem ele, fica o de fabrica. */
  onResize?: (id: string, size: AttachmentDisplaySize) => void
  /**
   * A lista esta travada: o texto esta indo, e o envio leva a lista como ela esta.
   * Um arquivo tirado agora subiria mesmo assim, e um posto agora nao subiria.
   */
  disabled?: boolean
}) {
  const raiz = useRef<HTMLDivElement>(null)
  const seletorDeImagem = useRef<HTMLInputElement>(null)
  const seletorDeArquivo = useRef<HTMLInputElement>(null)
  // Cada categoria com o seu limite: cheio de imagem, ainda cabe arquivo.
  const aceitaImagem = media.Kinds.some((kind) => kind.Kind === 'Image')
  const aceitaArquivo = media.Kinds.some((kind) => kind.Kind === 'File')
  // Travada a lista, a imagem nao muda mais: o arquivo que sobe e o de agora.
  const podeEditar = !!onEdit && !disabled
  const imagens = anexos.filter((anexo) => anexo.kind === 'Image')
  const arquivos = anexos.filter((anexo) => anexo.kind === 'File')
  const temImagem = imagens.length > 0

  /**
   * Tira da lista e leva o foco ao "Remover" seguinte — ou ao anterior, ou ao botao de
   * anexar. Sem isto, o botao que tinha o foco some, e quem usa teclado volta ao comeco
   * da pagina.
   */
  function removerLevandoFoco(id: string) {
    const botoes = Array.from(
      raiz.current?.querySelectorAll<HTMLButtonElement>('button[data-remover]') ?? [],
    )
    const indice = botoes.findIndex((botao) => botao.dataset.remover === id)
    const vizinho = botoes[indice + 1]?.dataset.remover ?? botoes[indice - 1]?.dataset.remover
    onRemove(id)
    requestAnimationFrame(() => {
      const alvo = vizinho
        ? raiz.current?.querySelector<HTMLButtonElement>(`button[data-remover="${vizinho}"]`)
        : raiz.current?.querySelector<HTMLButtonElement>('button[data-anexar]:not(:disabled)')
      alvo?.focus()
    })
  }

  /** O arquivo escolhido entra, e o seletor zera — para o mesmo poder voltar depois de removido. */
  const escolheu = (event: ChangeEvent<HTMLInputElement>) => {
    const escolhidos = Array.from(event.target.files ?? [])
    event.target.value = ''
    onAdd(escolhidos)
  }

  return (
    <div ref={raiz} className="flex flex-col gap-2">
      {/* Primeiro as imagens, e depois os botoes: e isso que as poe logo abaixo do
          texto, onde elas vao aparecer. */}
      {imagens.length > 0 && (
        <ul aria-label="Imagens a enviar" className={DISPLAY_GRID_CLASS}>
          {imagens.map((anexo) => (
            <li
              key={anexo.id}
              className={cn('flex min-w-0 flex-col gap-1', displaySizeClass(anexo.displaySize))}
              title={`${anexo.file.name} — ${formatBytes(anexo.file.size)}`}
            >
              <div className="relative">
                <div className="overflow-hidden rounded-lg border border-border bg-surface-sunken">
                  {podeEditar && anexo.kind === 'Image' ? (
                    <button
                      type="button"
                      onClick={() => onEdit?.(anexo.id)}
                      aria-label={`Editar ${anexo.file.name}`}
                      // O contorno do foco por dentro: por fora, a caixa que corta os
                      // cantos da imagem o cortaria inteiro.
                      className="block w-full focus-visible:outline-offset-[-2px]"
                    >
                      <Previa anexo={anexo} />
                      <span
                        aria-hidden="true"
                        className="absolute top-1 left-1 flex h-5 w-5 items-center justify-center rounded-full bg-surface/90 text-fg"
                      >
                        <svg
                          aria-hidden="true"
                          viewBox="0 0 20 20"
                          className="h-3 w-3"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="m12.5 4 3.5 3.5L7.5 16H4v-3.5z" />
                        </svg>
                      </span>
                    </button>
                  ) : (
                    <Previa anexo={anexo} />
                  )}
                </div>

                {!disabled && (
                  <button
                    type="button"
                    onClick={() => removerLevandoFoco(anexo.id)}
                    data-remover={anexo.id}
                    aria-label={`Remover ${anexo.file.name}`}
                    className="absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-surface/90 text-detail text-fg"
                  >
                    ×
                  </button>
                )}
              </div>

              {onResize && anexo.kind === 'Image' && (
                <Tamanhos anexo={anexo} disabled={disabled} onResize={onResize} />
              )}
            </li>
          ))}
        </ul>
      )}

      {arquivos.length > 0 && (
        <ul aria-label="Arquivos a enviar" className="flex flex-col gap-1.5">
          {arquivos.map((anexo) => (
            <li
              key={anexo.id}
              className="flex min-w-0 items-center gap-2 rounded-lg border border-border bg-surface-raised py-1 pr-1 pl-1.5"
            >
              <span
                aria-hidden="true"
                className="flex h-7 min-w-9 flex-none items-center justify-center rounded-md bg-surface-sunken px-1 font-medium text-caption text-fg-muted"
              >
                {fileBadge(extensionOf(anexo.file.name))}
              </span>
              <span className="min-w-0 flex-1 truncate text-detail text-fg" title={anexo.file.name}>
                {anexo.file.name}
              </span>
              <span className="flex-none text-caption text-fg-muted">
                {formatBytes(anexo.file.size)}
              </span>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => removerLevandoFoco(anexo.id)}
                  data-remover={anexo.id}
                  aria-label={`Remover ${anexo.file.name}`}
                  className="flex h-6 w-6 flex-none items-center justify-center rounded-full text-detail text-fg enabled:hover:bg-surface-sunken"
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {aceitaImagem && (
          <button
            type="button"
            onClick={() => seletorDeImagem.current?.click()}
            data-anexar
            disabled={!hasRoom(anexos, media, 'Image') || disabled}
            className={ATTACH_BUTTON_CLASS}
          >
            Anexar imagem
          </button>
        )}

        {aceitaArquivo && (
          <button
            type="button"
            onClick={() => seletorDeArquivo.current?.click()}
            data-anexar
            disabled={!hasRoom(anexos, media, 'File') || disabled}
            className={ATTACH_BUTTON_CLASS}
          >
            Anexar arquivo
          </button>
        )}

        {actions}

        {aceitaImagem && <span className="text-caption text-fg-muted">ou cole um print aqui</span>}
      </div>

      {/* Escondidos, e abertos pelos botoes: o seletor nativo nao aceita a cor do
          cliente nem cabe em 360 pixels com o nome do arquivo ao lado. O `accept`
          ja faz o navegador esconder o que nao serve — um seletor por categoria, para
          o da imagem nao oferecer PDF, e o do arquivo nao oferecer print. */}
      {aceitaImagem && (
        <input
          ref={seletorDeImagem}
          type="file"
          multiple
          accept={acceptAttribute(media, 'Image')}
          aria-label="Escolher imagem para anexar"
          className="hidden"
          onChange={escolheu}
        />
      )}
      {aceitaArquivo && (
        <input
          ref={seletorDeArquivo}
          type="file"
          multiple
          accept={acceptAttribute(media, 'File')}
          aria-label="Escolher arquivo para anexar"
          className="hidden"
          onChange={escolheu}
        />
      )}

      {temImagem && !disabled && (podeEditar || onResize) && (
        <p className="text-caption text-fg-muted leading-normal">
          {podeEditar && 'Clique numa imagem para marcar ou esconder algo antes de enviar. '}
          {onResize && 'Embaixo dela, escolha o tamanho em que ela aparece.'}
        </p>
      )}

      {recusa && (
        <p role="alert" className="text-caption text-error-fg leading-normal">
          {recusa}
        </p>
      )}
    </div>
  )
}

/** A imagem como vai aparecer no relato. A mesma classe da leitura: ver `displaySize`. */
function Previa({ anexo }: { anexo: Anexo }) {
  return anexo.preview ? (
    <img src={anexo.preview} alt={anexo.file.name} className={DISPLAY_IMAGE_CLASS} />
  ) : (
    <span className="flex aspect-video w-full items-center justify-center text-caption text-fg-muted">
      imagem
    </span>
  )
}

/**
 * Os quatro tamanhos, logo abaixo da imagem.
 *
 * **Sempre a vista, e nao so no passar do mouse**: no telefone nao ha mouse, e o
 * tamanho que so aparece escondido e o tamanho que ninguem escolhe.
 *
 * **Embaixo, e nao por cima.** Por cima, cobririam a faixa baixa — um aviso de erro
 * capturado sai com 900 por 120, e pequeno fica com 14 pixels de altura — e passariam
 * da imagem pequena num telefone estreito, por cima dos da vizinha. Embaixo, eles
 * quebram a linha quando a imagem e estreita, e nunca cobrem nada.
 *
 * **Cada botao desenha a imagem dentro da linha** — um terco, meia, tres quartos,
 * inteira — e diz o nome ao leitor de tela e ao passar o mouse. Com 24 pixels, o
 * minimo para o dedo.
 */
function Tamanhos({
  anexo,
  disabled,
  onResize,
}: {
  anexo: Anexo
  disabled: boolean
  onResize: (id: string, size: AttachmentDisplaySize) => void
}) {
  return (
    <fieldset aria-label={`Tamanho de ${anexo.file.name}`} className="flex flex-wrap">
      {ATTACHMENT_DISPLAY_SIZES.map((tamanho) => (
        <button
          key={tamanho}
          type="button"
          aria-pressed={anexo.displaySize === tamanho}
          aria-label={DISPLAY_SIZE_LABEL[tamanho]}
          title={DISPLAY_SIZE_LABEL[tamanho]}
          disabled={disabled}
          onClick={() => onResize(anexo.id, tamanho)}
          className={cn(
            'flex h-6 w-6 items-center justify-center rounded-md',
            'disabled:cursor-not-allowed disabled:opacity-60',
            anexo.displaySize === tamanho ? ESCOLHIDO : 'text-fg enabled:hover:bg-surface-sunken',
          )}
        >
          <IconeDeTamanho fracao={DISPLAY_SIZE_FRACTION[tamanho]} />
        </button>
      ))}
    </fieldset>
  )
}

/** A linha do texto, e a imagem ocupando a fracao dela. */
function IconeDeTamanho({ fracao }: { fracao: number }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none">
      <rect
        x="1.5"
        y="3.5"
        width="13"
        height="9"
        rx="1.5"
        stroke="currentColor"
        strokeOpacity="0.5"
      />
      <rect x="3" y="5" width={10 * fracao} height="6" rx="0.75" fill="currentColor" />
    </svg>
  )
}

/**
 * Os arquivos depois de enviar o texto: na fila, subindo, enviado, com falha ou
 * recusado.
 *
 * **A frase da falha diz primeiro que o texto esta salvo.** E o que a pessoa precisa
 * saber quando um arquivo nao vai: que nao perdeu o que escreveu.
 *
 * **Recusado nao oferece "Tentar de novo".** A API disse que o envio fechou ou
 * encheu, que o projeto nao aceita, ou que o arquivo nao serve — repetir levaria a
 * mesma resposta, e o botao so ensinaria a pessoa a clicar em vao.
 *
 * **Cada recusado diz o seu motivo, embaixo dele.** Num envio podem ser motivos
 * diferentes — um grande demais, outro alem da cota —, e uma frase so, no fim,
 * contaria o de um e calaria o do outro.
 *
 * **Falhou oferece tambem desistir.** Tentar de novo pode continuar falhando — a
 * rede de quem relata, o armazenamento fora —, e sem saida o arquivo prenderia a
 * lista na tela ate a pagina recarregar.
 *
 * **O leitor de tela ouve o andamento, e nao cada porcentagem.** A porcentagem anda
 * varias vezes por segundo, e anunciar cada avanco afogaria o resto: o aviso muda
 * quando um arquivo termina e quando o envio acaba — ver `resumoDoEnvio`. **Ele nasce
 * vazio e ganha o texto logo depois**: aviso que ja entra escrito na pagina, o leitor
 * de tela costuma nao anunciar. A tela que tira a lista de cena quando tudo foi diz o
 * fim num aviso dela — ver `resumoDoFim`.
 *
 * @param savedNote O que foi salvo, dito do jeito da tela — "o relato", "a resposta".
 * @param onDiscard Tira da lista o arquivo que falhou. Sem ele, so tentar de novo.
 */
export function AttachmentProgress({
  anexos,
  onRetry,
  onDiscard,
  savedNote,
}: {
  anexos: Anexo[]
  onRetry: (anexo: Anexo) => void
  onDiscard?: (anexo: Anexo) => void
  savedNote: string
}) {
  const resumo = resumoDoEnvio(anexos)
  const [aviso, setAviso] = useState('')
  useEffect(() => setAviso(resumo), [resumo])

  if (anexos.length === 0) return null

  // A falha que da para tentar de novo e a que pede um gesto: ela vai para a frase.
  // Os recusados ja dizem o motivo na propria linha.
  const falha = anexos.find((anexo) => anexo.status === 'failed')
  const recusados = anexos.filter((anexo) => anexo.status === 'refused').length

  return (
    <div className="rounded-lg border border-border bg-surface-raised p-4">
      <p role="status" className="sr-only">
        {aviso}
      </p>
      <p className="mb-2 text-detail text-fg-muted">Arquivos</p>
      <ul className="flex flex-col gap-1.5">
        {anexos.map((anexo) => (
          <li key={anexo.id} className="flex flex-col gap-0.5 text-detail">
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate text-fg">{anexo.file.name}</span>
              <span className="flex-none text-fg-muted">
                {anexo.status === 'waiting' && 'na fila'}
                {anexo.status === 'sending' && `${Math.round(anexo.progress * 100)}%`}
                {anexo.status === 'done' && 'enviado'}
                {anexo.status === 'refused' && 'não enviado'}
                {anexo.status === 'failed' && (
                  <span className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => onRetry(anexo)}
                      className="font-medium text-fg underline underline-offset-4"
                    >
                      Tentar de novo
                    </button>
                    {onDiscard && (
                      <button
                        type="button"
                        onClick={() => onDiscard(anexo)}
                        className="text-fg-muted underline underline-offset-4"
                      >
                        Desistir
                      </button>
                    )}
                  </span>
                )}
              </span>
            </div>
            {anexo.status === 'refused' && anexo.error && (
              <p className="text-caption text-fg-muted leading-normal">{anexo.error}</p>
            )}
          </li>
        ))}
      </ul>

      {falha ? (
        <p className="mt-2 text-caption text-fg-muted leading-normal">
          {savedNote} Só o arquivo não foi junto — {falha.error ?? 'tente de novo.'}
        </p>
      ) : (
        recusados > 0 && (
          <p className="mt-2 text-caption text-fg-muted leading-normal">
            {savedNote}{' '}
            {recusados === 1
              ? 'Só o arquivo marcado não foi junto.'
              : 'Só os arquivos marcados não foram juntos.'}
          </p>
        )
      )}
    </div>
  )
}

/**
 * O andamento do envio numa frase, para o leitor de tela. **So muda quando o estado
 * muda** — um arquivo terminou, o envio acabou —, e nunca com a porcentagem.
 */
export function resumoDoEnvio(anexos: Anexo[]): string {
  const total = anexos.length
  const enviados = anexos.filter((anexo) => anexo.status === 'done').length
  const andando = anexos.some((anexo) => anexo.status === 'waiting' || anexo.status === 'sending')
  const naoForam = total - enviados

  if (total === 1) {
    if (andando) return 'Enviando o arquivo.'
    return naoForam === 0 ? 'Arquivo enviado.' : 'O arquivo não foi enviado.'
  }

  if (andando) return `Enviando os arquivos: ${enviados} de ${total} enviados.`
  if (naoForam === 0) return 'Todos os arquivos foram enviados.'
  return naoForam === 1 ? '1 arquivo não foi enviado.' : `${naoForam} arquivos não foram enviados.`
}

/**
 * O fim do envio, para a tela que tira a lista de cena quando **todos** foram — o
 * acompanhamento, que mostra o arquivo no lugar dele depois de reler. Sem isto, o
 * aviso ia embora com a lista, antes de dizer "enviado". Nulo quando algum nao foi:
 * ai a lista fica na tela, e o aviso dela diz.
 *
 * Leia **antes** de fechar o envio: fechado, a lista ja esta vazia.
 */
export function resumoDoFim(anexos: Anexo[]): string | null {
  if (anexos.length === 0 || anexos.some((anexo) => anexo.status !== 'done')) return null
  return resumoDoEnvio(anexos)
}
