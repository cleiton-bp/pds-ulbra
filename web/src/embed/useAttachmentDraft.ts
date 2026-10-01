import { type ClipboardEvent, type RefObject, useEffect, useRef, useState } from 'react'
import type { PublicMediaSettingsViewModel } from '@/contracts'
import { describeError, isPanelError } from '@/data/publicIndex'
import {
  type Anexo,
  kindFor,
  makeThumbnail,
  previewUrl,
  rejectReason,
  releasePreview,
} from '@/embed/attachments'
import {
  type AttachmentEnvio,
  type ReportCredentials,
  sendAttachment,
} from '@/embed/sendAttachment'

/**
 * A API recusou o arquivo de vez: o envio fechou, encheu, ou a regra do projeto
 * mudou — e o arquivo ja foi descartado do lado de la.
 *
 * **409 e a resposta que tentar de novo nao muda**, e e por isso que a tela nao
 * oferece. So as rotas da API respondem 409; o que o armazenamento recusa (400 de
 * tamanho, 403 de assinatura vencida) continua sendo falha, e tentar de novo pede
 * outra permissao.
 */
function isRefusal(falha: unknown): boolean {
  return isPanelError(falha) && falha.status === 409
}

/**
 * Os arquivos escolhidos antes de enviar, e o envio deles depois.
 *
 * **Enquanto a pessoa escreve, nada sobe.** Escolher e remover mexem so nesta
 * lista. O envio comeca depois de o texto existir do lado de la — o relato, ou a
 * resposta — e e isso que faz uma falha no arquivo nunca levar o texto junto.
 *
 * **Mora fora do quadro porque o quadro deixou de ser o unico lugar que anexa.** A
 * resposta ao pedido de informacao e a reabertura, na pagina de acompanhamento,
 * fazem a mesma coisa; copiar a logica faria as tres divergirem na primeira
 * correcao.
 *
 * @param generation Quem reinicia a tela no meio de um envio passa este contador:
 *   o envio em voo termina do lado de la, mas nao regrava a tela de quem ja esta em
 *   outra coisa. Quem nao reinicia nada nao precisa passar.
 * @param envio A que envio os arquivos pertencem: a criacao do relato, a resposta
 *   ou a reabertura.
 */
export function useAttachmentDraft(
  media: PublicMediaSettingsViewModel | null,
  {
    generation,
    envio = 'creation',
  }: { generation?: RefObject<number>; envio?: AttachmentEnvio } = {},
) {
  const [anexos, setAnexos] = useState<Anexo[]>([])

  /** Espelho da lista para conferir limite sem esperar o React redesenhar. */
  const anexosRef = useRef<Anexo[]>([])
  anexosRef.current = anexos

  /** Por que o ultimo arquivo escolhido nao entrou. */
  const [recusa, setRecusa] = useState<string | null>(null)

  /**
   * Os recusados do envio que ja terminou, para a tela dizer o que nao foi e por
   * que. Ficam fora da lista para ela voltar a servir ao proximo envio.
   */
  const [naoEnviados, setNaoEnviados] = useState<Anexo[]>([])

  /**
   * Quantas escolhas ainda estao virando item da lista — a miniatura leva um
   * instante, e varios arquivos de uma vez entram um de cada vez.
   *
   * **Quem envia espera isto zerar.** O envio sobe a lista como ela esta quando
   * comeca: um arquivo que entrasse depois nao subiria, e na reabertura sumiria
   * junto com o bloco que o mostrava.
   */
  const [preparando, setPreparando] = useState(0)

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
  async function adicionar(arquivos: File[]) {
    if (!media) return

    setRecusa(null)
    // Outro envio comecou: o aviso do anterior ja nao e sobre o que esta na tela.
    setNaoEnviados([])
    setPreparando((atual) => atual + 1)

    try {
      for (const file of arquivos) {
        const motivo = rejectReason(file, anexosRef.current, media)
        if (motivo) {
          setRecusa(motivo)
          continue
        }

        const kind = kindFor(file, media)
        if (!kind) continue

        const thumbnail = await makeThumbnail(file)

        trocarLista([
          ...anexosRef.current,
          {
            id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            file,
            kind: kind.Kind,
            // A imagem se mostra por ela mesma quando a miniatura nao sai.
            preview: previewUrl(thumbnail ?? file),
            thumbnail,
            status: 'waiting',
            progress: 0,
            error: null,
          },
        ])
      }
    } finally {
      setPreparando((atual) => atual - 1)
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
        { envio },
      )
      if (geracao.current === minha) atualizar(anexo.id, { status: 'done', progress: 1 })
    } catch (falha) {
      // Recusado nao volta a fila. Ver `isRefusal`.
      if (geracao.current === minha)
        atualizar(anexo.id, {
          status: isRefusal(falha) ? 'refused' : 'failed',
          error: describeError(falha),
        })
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
    setNaoEnviados([])
  }

  /**
   * Fecha o envio, se ele terminou, e diz se fechou.
   *
   * **Terminou quando nada mais depende de alguem**: nenhum arquivo na fila,
   * subindo, ou esperando "Tentar de novo". Recusado nao espera nada — sem esta
   * conta, um so recusado prenderia a lista na tela para sempre, e o proximo envio
   * iria sem arquivo ate a pagina recarregar.
   *
   * O que foi sai de cena, porque a pagina o mostra no lugar dele depois de reler.
   * O recusado vai para `naoEnviados`, e fica ate a pessoa escolher outro arquivo.
   */
  function fechar(): boolean {
    const lista = anexosRef.current
    if (lista.some((anexo) => anexo.status !== 'done' && anexo.status !== 'refused')) return false

    const recusados = lista.filter((anexo) => anexo.status === 'refused')
    limpar()
    setNaoEnviados(recusados)
    return true
  }

  return {
    anexos,
    recusa,
    setRecusa,
    naoEnviados,
    /** Ha arquivo escolhido que ainda nao entrou na lista. Ver `preparando`. */
    preparando: preparando > 0,
    adicionar,
    remover,
    colar,
    enviarAnexo,
    enviarAnexos,
    limpar,
    fechar,
    /** A lista como esta agora, sem esperar o React redesenhar. */
    atual: () => anexosRef.current,
  }
}

/** O rascunho inteiro, para quem o cria passar adiante a quem desenha o seletor. */
export type AttachmentDraft = ReturnType<typeof useAttachmentDraft>
