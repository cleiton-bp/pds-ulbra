import { type ClipboardEvent, type RefObject, useEffect, useRef, useState } from 'react'
import type { PublicMediaSettingsViewModel } from '@/contracts'
import { describeError } from '@/data/publicIndex'
import {
  type Anexo,
  kindFor,
  makeThumbnail,
  previewUrl,
  readVideoDuration,
  rejectReason,
  releasePreview,
} from '@/embed/attachments'
import { type ReportCredentials, sendAttachment } from '@/embed/sendAttachment'

/**
 * Os arquivos escolhidos antes de enviar, e o envio deles depois.
 *
 * **Enquanto a pessoa escreve, nada sobe.** Escolher e remover mexem so nesta
 * lista. O envio comeca depois de o texto existir do lado de la — o relato, ou a
 * resposta — e e isso que faz uma falha no arquivo nunca levar o texto junto.
 *
 * **Mora fora do quadro porque o quadro deixou de ser o unico lugar que anexa.** A
 * resposta ao pedido de informacao, na pagina de acompanhamento, faz a mesma coisa;
 * copiar a logica faria as duas divergirem na primeira correcao.
 *
 * @param generation Quem reinicia a tela no meio de um envio passa este contador:
 *   o envio em voo termina do lado de la, mas nao regrava a tela de quem ja esta em
 *   outra coisa. Quem nao reinicia nada nao precisa passar.
 * @param forReply Os arquivos vao junto de uma resposta, e nao da criacao do relato.
 */
export function useAttachmentDraft(
  media: PublicMediaSettingsViewModel | null,
  { generation, forReply = false }: { generation?: RefObject<number>; forReply?: boolean } = {},
) {
  const [anexos, setAnexos] = useState<Anexo[]>([])

  /** Espelho da lista para conferir limite sem esperar o React redesenhar. */
  const anexosRef = useRef<Anexo[]>([])
  anexosRef.current = anexos

  /** Por que o ultimo arquivo escolhido nao entrou. */
  const [recusa, setRecusa] = useState<string | null>(null)

  const propria = useRef(0)
  const geracao = generation ?? propria

  // Fechar a pagina com miniaturas na tela nao pode deixar a memoria delas presa.
  useEffect(
    () => () => {
      for (const anexo of anexosRef.current) releasePreview(anexo.preview)
    },
    [],
  )

  function trocarLista(lista: Anexo[]) {
    anexosRef.current = lista
    setAnexos(lista)
  }

  /**
   * Acrescenta arquivos a lista, recusando cedo o que nao serve.
   *
   * **Conferir aqui e cortesia, e nao trava.** Quem trava e o servidor e o
   * armazenamento. Isto so evita escolher, esperar o envio, e so entao ouvir "nao
   * serve".
   */
  async function adicionar(arquivos: File[], conhecido?: { durationSeconds: number }) {
    if (!media) return

    setRecusa(null)

    for (const file of arquivos) {
      const motivo = rejectReason(file, anexosRef.current, media)
      if (motivo) {
        setRecusa(motivo)
        continue
      }

      const kind = kindFor(file, media)
      if (!kind) continue

      let durationSeconds: number | null = null

      if (kind.MaxDurationSeconds !== null) {
        // Gravado aqui, a duracao veio do relogio — e e mais confiavel que ler o
        // arquivo, que o navegador grava sem duracao no cabecalho.
        durationSeconds = conhecido?.durationSeconds ?? (await readVideoDuration(file))

        // A API exige a duracao do video, e nao da para chuta-la.
        if (durationSeconds === null) {
          setRecusa('Não deu para ler a duração deste vídeo.')
          continue
        }

        if (durationSeconds > kind.MaxDurationSeconds) {
          setRecusa(`O vídeo passa de ${kind.MaxDurationSeconds} segundos.`)
          continue
        }
      }

      const thumbnail = await makeThumbnail(file, kind.Kind)

      trocarLista([
        ...anexosRef.current,
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          file,
          kind: kind.Kind,
          // Imagem se mostra por ela mesma quando a miniatura nao sai; video, nao.
          preview: thumbnail
            ? previewUrl(thumbnail)
            : kind.Kind === 'Image'
              ? previewUrl(file)
              : null,
          thumbnail,
          durationSeconds,
          status: 'waiting',
          progress: 0,
          error: null,
        },
      ])
    }
  }

  function remover(id: string) {
    const alvo = anexosRef.current.find((anexo) => anexo.id === id)
    releasePreview(alvo?.preview ?? null)
    trocarLista(anexosRef.current.filter((anexo) => anexo.id !== id))
    setRecusa(null)
  }

  /**
   * **Colar e anexar.** PrintScreen e Ctrl+V e como se anexa print de verdade — e
   * sem isto a pessoa teria de salvar a imagem num arquivo so para escolhe-lo.
   *
   * So age quando a colagem traz arquivo: colar texto na caixa continua sendo colar
   * texto.
   */
  function colar(event: ClipboardEvent<HTMLElement>) {
    if (!media) return

    const arquivos = Array.from(event.clipboardData.files)
    if (arquivos.length === 0) return

    event.preventDefault()
    void adicionar(arquivos)
  }

  function atualizar(id: string, mudanca: Partial<Anexo>) {
    trocarLista(
      anexosRef.current.map((anexo) => (anexo.id === id ? { ...anexo, ...mudanca } : anexo)),
    )
  }

  /** Leva um arquivo ate o fim, respeitando a geracao de quem o pediu. */
  async function enviarAnexo(credenciais: ReportCredentials, anexo: Anexo, minha: number) {
    atualizar(anexo.id, { status: 'sending', progress: 0, error: null })

    try {
      await sendAttachment(
        credenciais,
        anexo,
        (progress) => {
          if (geracao.current === minha) atualizar(anexo.id, { progress })
        },
        { forReply },
      )
      if (geracao.current === minha) atualizar(anexo.id, { status: 'done', progress: 1 })
    } catch (falha) {
      if (geracao.current === minha)
        atualizar(anexo.id, { status: 'failed', error: describeError(falha) })
    }
  }

  /** Um de cada vez: a barra de cada um anda de verdade, e a banda nao se divide. */
  async function enviarAnexos(credenciais: ReportCredentials, minha: number) {
    for (const anexo of anexosRef.current) {
      if (geracao.current !== minha) return
      await enviarAnexo(credenciais, anexo, minha)
    }
  }

  /** Esvazia a lista e devolve a memoria das miniaturas. */
  function limpar() {
    for (const anexo of anexosRef.current) releasePreview(anexo.preview)
    trocarLista([])
    setRecusa(null)
  }

  return {
    anexos,
    recusa,
    setRecusa,
    adicionar,
    remover,
    colar,
    enviarAnexo,
    enviarAnexos,
    limpar,
    /** A lista como esta agora, sem esperar o React redesenhar. */
    atual: () => anexosRef.current,
  }
}
