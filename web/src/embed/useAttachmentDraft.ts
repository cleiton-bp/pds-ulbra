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
  withRealType,
} from '@/embed/attachments'
import {
  type AttachmentEnvio,
  type ReportCredentials,
  sendAttachment,
} from '@/embed/sendAttachment'

/**
 * A API recusou o arquivo de vez: o envio fechou ou encheu, a regra do projeto nao o
 * aceita — mudada depois de a tela abrir —, ou o proprio arquivo nao serve. O que
 * ja tinha subido foi descartado do lado de la.
 *
 * **409 e a resposta que tentar de novo nao muda**, e e por isso que a tela nao
 * oferece: no pedido da permissao e na confirmacao, a API responde 409 a toda recusa
 * que o mesmo arquivo levaria de novo. So as rotas da API respondem 409; o que o
 * armazenamento recusa (400 de tamanho, 403 de assinatura vencida) continua sendo
 * falha, e tentar de novo pede outra permissao.
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

  /**
   * Os arquivos que ja passaram pela conferencia do limite e ainda estao virando
   * item da lista. **Contam no limite como se ja estivessem nela**: duas escolhas ao
   * mesmo tempo — colar enquanto a miniatura da anterior sai — olhariam a mesma lista
   * e as duas caberiam, passando do limite que a tela diz respeitar.
   */
  const reservados = useRef<Pick<Anexo, 'kind'>[]>([])

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

    // O quadro reiniciado no meio — fechado, ou "relatar outra coisa" — ja e outro
    // formulario, e o arquivo escolhido para o anterior nao pode entrar nele.
    const minha = geracao.current

    try {
      for (const escolhido of arquivos) {
        // O tipo que os bytes dizem, e nao o da extensao — ver `withRealType`.
        const file = await withRealType(escolhido)
        if (geracao.current !== minha) return

        const motivo = rejectReason(file, [...anexosRef.current, ...reservados.current], media)
        if (motivo) {
          setRecusa(motivo)
          continue
        }

        const kind = kindFor(file, media)
        if (!kind) continue

        const reserva = { kind: kind.Kind }
        reservados.current = [...reservados.current, reserva]

        let thumbnail: Blob | null
        try {
          thumbnail = await makeThumbnail(file)
        } finally {
          reservados.current = reservados.current.filter((item) => item !== reserva)
        }

        if (geracao.current !== minha) return

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
            uploaded: null,
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
   *
   * **Texto junto com imagem e texto.** A planilha e o editor de texto copiam as
   * celulas ou o paragrafo e, junto, uma imagem deles. Anexar essa imagem engoliria
   * o texto que a pessoa quis colar.
   *
   * **Menos quando o texto e so o nome do arquivo.** O arquivo copiado no Finder
   * chega com o nome dele como texto (nos navegadores Chromium), e o gerenciador de
   * arquivos do Linux, com o caminho. Isso nao e texto da pessoa: tratado como texto,
   * colar um print salvo deixaria de anexar e escreveria o nome na descricao.
   */
  function colar(event: ClipboardEvent<HTMLElement>) {
    if (!media) return

    const arquivos = Array.from(event.clipboardData.files)
    if (arquivos.length === 0) return

    const texto = event.clipboardData.getData('text/plain').trim()
    if (texto.length > 0 && !soNomesDosArquivos(texto, arquivos)) return

    event.preventDefault()
    void adicionar(arquivos)
  }

  function atualizar(id: string, mudanca: Partial<Anexo>) {
    trocarLista(
      anexosRef.current.map((anexo) => (anexo.id === id ? { ...anexo, ...mudanca } : anexo)),
    )
  }

  /**
   * Leva um arquivo ate o fim. **A geracao decide so se a tela e atualizada**: o
   * arquivo sobe mesmo com o quadro ja reiniciado, porque o relato existe e a pessoa
   * contou que o arquivo iria junto.
   */
  async function enviarAnexo(credenciais: ReportCredentials, anexo: Anexo, minha: number) {
    if (geracao.current === minha)
      atualizar(anexo.id, { status: 'sending', progress: 0, error: null })

    try {
      await sendAttachment(
        credenciais,
        anexo,
        (progress) => {
          if (geracao.current === minha) atualizar(anexo.id, { progress })
        },
        {
          envio,
          // Guardado para "Tentar de novo" so confirmar. Ver `Anexo.uploaded`.
          onUploaded: (publicId) => {
            if (geracao.current === minha) atualizar(anexo.id, { uploaded: publicId })
          },
        },
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

  /**
   * Um de cada vez: a barra de cada um anda de verdade, e a banda nao se divide.
   *
   * **A lista e copiada antes, e o envio vai ate o fim.** Fechar o quadro, ou
   * "relatar outra coisa", esvazia a lista da tela — e parar ali deixaria sem subir,
   * sem aviso, os arquivos de um relato que ja existe. A tela nova nao ve este
   * envio; ele so termina.
   */
  async function enviarAnexos(
    credenciais: ReportCredentials,
    minha: number,
    // Quem guardou a lista antes de ela sair da tela passa a copia dela.
    lista: Anexo[] = anexosRef.current,
  ) {
    for (const anexo of [...lista]) {
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

/**
 * O texto colado e so o nome — ou o caminho — dos arquivos que vieram junto.
 *
 * Uma linha por arquivo, como o Finder e os gerenciadores do Linux poem. O nome
 * vale com e sem a extensao, porque o Finder a esconde por padrao, e na forma
 * composta do Unicode, porque o nome do arquivo e o do texto podem vir escritos
 * cada um de um jeito.
 */
function soNomesDosArquivos(texto: string, arquivos: File[]): boolean {
  const nomes = new Set<string>()

  for (const arquivo of arquivos) {
    const nome = arquivo.name.normalize('NFC')
    nomes.add(nome)
    nomes.add(nome.replace(/\.[^.]+$/, ''))
  }

  return texto
    .split(/\r\n|\r|\n/)
    .map((linha) => linha.trim())
    .filter((linha) => linha.length > 0)
    .every((linha) => nomes.has((linha.split(/[\\/]/).pop() ?? linha).normalize('NFC')))
}
