import { type ClipboardEvent, type RefObject, useEffect, useRef, useState } from 'react'
import {
  type AttachmentDisplaySize,
  DEFAULT_ATTACHMENT_DISPLAY_SIZE,
  type PublicMediaSettingsViewModel,
} from '@/contracts'
import { describeError, isPanelError } from '@/data/publicIndex'
import type { EditDoc } from '@/editor/doc'
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
 * Uma imagem aberta no editor: a captura que ainda nao entrou na lista, ou uma que
 * ja esta nela. Ver `editar` e `editarCaptura`.
 */
export interface EditRequest {
  /** Esta abertura. Duas seguidas nao herdam o estado uma da outra. */
  id: number
  /** O anexo que a edicao substitui. **Nulo na captura**: ela so entra ao concluir. */
  target: string | null
  /** A imagem sem marcas — o original, e nunca o arquivo ja marcado. */
  source: File
  /** As marcas de antes, para continuarem editaveis. */
  doc: EditDoc | null
  /** O teto de imagem do projeto, para o arquivo marcado caber nele. */
  maxBytes: number | null
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

  /** A imagem no editor, se houver. Espelhada para quem conclui ler sem esperar o React. */
  const [edicao, setEdicaoState] = useState<EditRequest | null>(null)
  const edicaoRef = useRef<EditRequest | null>(null)
  const aberturas = useRef(0)

  function trocarEdicao(pedido: EditRequest | null) {
    edicaoRef.current = pedido
    setEdicaoState(pedido)
  }

  /** O teto de imagem do projeto. */
  const tetoDeImagem = () => media?.Kinds.find((kind) => kind.Kind === 'Image')?.MaxBytes ?? null

  // Fechar a pagina com imagens na tela nao pode deixar a memoria delas presa.
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
  async function adicionar(arquivos: File[], edit: Anexo['edit'] = null) {
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
            // A propria imagem, e nao a miniatura: ver `Anexo.preview`.
            preview: previewUrl(file),
            // A linha inteira ate a pessoa escolher outro — o mesmo padrao da API.
            displaySize: DEFAULT_ATTACHMENT_DISPLAY_SIZE,
            thumbnail,
            status: 'waiting',
            progress: 0,
            error: null,
            uploaded: null,
            edit,
          },
        ])
      }
    } finally {
      setPreparando((atual) => atual - 1)
    }
  }

  /**
   * Troca o arquivo de um anexo pelo que saiu do editor, com as mesmas conferencias de
   * quem entra — e **a miniatura sai do arquivo novo**. Da antiga, com o que a tarja
   * cobriu agora, nao sobra nada.
   *
   * **O que a pessoa salvou vale na hora**, antes da miniatura sair. Reaberto nesse
   * meio, o editor tem de trazer as marcas: trazendo o original sem elas, a proxima
   * edicao subiria o que a tarja cobria. A miniatura velha sai junto, para nunca
   * subir no lugar da nova.
   *
   * **Recusado, sai da lista** — e nao fica o original, sem as marcas que a pessoa
   * acabou de pôr. Tirado da lista enquanto o editor estava aberto, nao volta.
   */
  async function substituir(id: string, arquivo: File, edit: Anexo['edit']) {
    if (!media) return

    const antes = anexosRef.current.find((anexo) => anexo.id === id)
    if (antes?.status !== 'waiting') return

    setRecusa(null)
    releasePreview(antes.preview)
    atualizar(id, { file: arquivo, edit, preview: previewUrl(arquivo), thumbnail: null })

    setPreparando((atual) => atual + 1)
    const minha = geracao.current

    /** Esta troca ainda e a que vale: outra edicao do mesmo anexo pode ter vindo depois. */
    const vigente = () => {
      const agora = anexosRef.current.find((anexo) => anexo.id === id)
      return agora?.status === 'waiting' && agora.file === arquivo ? agora : null
    }

    try {
      const file = await withRealType(arquivo)
      if (geracao.current !== minha) return

      const outros = anexosRef.current.filter((anexo) => anexo.id !== id)
      const motivo = rejectReason(file, [...outros, ...reservados.current], media)
      const kind = kindFor(file, media)
      if (motivo || !kind) {
        const recusado = vigente()
        if (!recusado) return
        releasePreview(recusado.preview)
        trocarLista(anexosRef.current.filter((anexo) => anexo.id !== id))
        // `rejectReason` sempre diz o motivo quando nao ha categoria; o texto de reserva
        // e so para o tipo.
        setRecusa(
          `${motivo ?? 'Esse formato de arquivo não é aceito aqui.'} A imagem saiu da lista para não ir sem as marcas.`,
        )
        return
      }

      const thumbnail = await makeThumbnail(file)
      if (geracao.current !== minha) return

      if (!vigente()) return

      // A imagem na tela ja e a nova, desde o comeco da troca: so a miniatura muda.
      atualizar(id, { file, kind: kind.Kind, thumbnail })
    } finally {
      setPreparando((atual) => atual - 1)
    }
  }

  /**
   * Abre no editor uma imagem da lista — **a original, com as marcas de antes**. Marcar
   * de novo parte do que a pessoa escolheu, e nao do arquivo ja desenhado: tirar uma
   * tarja devolve o que estava embaixo, e nada perde qualidade a cada edicao.
   */
  function editar(id: string) {
    const anexo = anexosRef.current.find((item) => item.id === id)
    if (anexo?.kind !== 'Image' || anexo.status !== 'waiting') return

    setRecusa(null)
    aberturas.current += 1
    trocarEdicao({
      id: aberturas.current,
      target: id,
      source: anexo.edit?.original ?? anexo.file,
      doc: anexo.edit?.doc ?? null,
      maxBytes: tetoDeImagem(),
    })
  }

  /** Abre a captura no editor. **Ela so entra na lista quando a pessoa adicionar.** */
  function editarCaptura(file: File) {
    setRecusa(null)
    aberturas.current += 1
    trocarEdicao({
      id: aberturas.current,
      target: null,
      source: file,
      doc: null,
      maxBytes: tetoDeImagem(),
    })
  }

  /**
   * O editor terminou. Sem marcas (`doc` nulo), o arquivo e o original, e nao ha o que
   * guardar para reabrir.
   */
  async function concluirEdicao({ file, doc }: { file: File; doc: EditDoc | null }) {
    const pedido = edicaoRef.current
    trocarEdicao(null)
    if (!pedido) return

    const edit = doc ? { original: pedido.source, doc } : null
    if (pedido.target === null) await adicionar([file], edit)
    else await substituir(pedido.target, file, edit)
  }

  function cancelarEdicao() {
    trocarEdicao(null)
  }

  /**
   * Muda o tamanho em que a imagem aparece no relato. **So antes de enviar**: o tamanho
   * vai junto do pedido de cada arquivo, e a lista que sobe e a de quando o envio
   * comecou.
   */
  function redimensionar(id: string, displaySize: AttachmentDisplaySize) {
    const anexo = anexosRef.current.find((item) => item.id === id)
    if (anexo?.status !== 'waiting' || anexo.displaySize === displaySize) return
    atualizar(id, { displaySize })
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
    // A posicao de cada um e a da lista, que e a ordem em que a pessoa montou. Fica no
    // item da tela para "Tentar de novo" mandar a mesma — ver `Anexo.displayOrder`.
    const ordenados = lista.map((anexo, displayOrder) => ({ ...anexo, displayOrder }))
    if (geracao.current === minha)
      for (const anexo of ordenados) atualizar(anexo.id, { displayOrder: anexo.displayOrder })

    for (const anexo of ordenados) {
      await enviarAnexo(credenciais, anexo, minha)
    }
  }

  /** Esvazia a lista e devolve a memoria das imagens. */
  function limpar() {
    for (const anexo of anexosRef.current) releasePreview(anexo.preview)
    trocarLista([])
    setRecusa(null)
    setNaoEnviados([])
    trocarEdicao(null)
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
    redimensionar,
    colar,
    /** A imagem aberta no editor, ou nulo. */
    edicao,
    editar,
    editarCaptura,
    concluirEdicao,
    cancelarEdicao,
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
