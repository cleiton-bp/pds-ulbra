import { type FormEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  type CreatedReportViewModel,
  MAX_CARD_TITLE_LENGTH,
  MAX_REPORT_ANSWER_LENGTH,
  MAX_REPORT_TEXT_LENGTH,
  MAX_REPORTER_NAME_LENGTH,
  type PublicMediaSettingsViewModel,
  type WidgetReportTypeViewModel,
  type WidgetSettingsViewModel,
} from '@/contracts'
import { describeError, reportService, widgetSettingsService } from '@/data/publicIndex'
import { AttachmentEditor } from '@/embed/AttachmentEditor'
import { ATTACH_BUTTON_CLASS, AttachmentPicker, AttachmentProgress } from '@/embed/AttachmentPicker'
import { accentStyle, resolveTheme, watchSystemTheme } from '@/embed/appearance'
import { hasRoom } from '@/embed/attachments'
import { challengeOf, solveChallenge } from '@/embed/challenge'
import type { EmbedConfig } from '@/embed/config'
import type { HostConnection, OpenOptions } from '@/embed/hostBridge'
import { nameFromIdentityToken } from '@/embed/identityToken'
import { launcherFrame, launcherMode, launcherSize } from '@/embed/launcher'
import { MyReports } from '@/embed/MyReports'
import { PublicList } from '@/embed/PublicList'
import { PREVIEW_OUTLINE } from '@/embed/previewOutline'
import type { PreviewFormPart } from '@/embed/protocol'
import { buildReportContext } from '@/embed/reportContext'
import { readReporterCode, writeReporterCode } from '@/embed/reporterCodeStore'
import { findRealType } from '@/embed/resolveSettings'
import { isFallbackType } from '@/embed/settings'
import { useAttachmentDraft } from '@/embed/useAttachmentDraft'

import { Button } from '@/shared/components/Button'
import { CopyButton } from '@/shared/components/CopyButton'
import { LauncherIconSvg } from '@/shared/components/LauncherIcon'
import { ReportTypeIconSvg } from '@/shared/components/ReportTypeGlyph'
import { SentConfirmation } from '@/shared/components/SentConfirmation'
import { cn } from '@/shared/lib/cn'
import { buildTrackingLink } from '@/shared/lib/tracking'
import { firstName } from '@/shared/lib/widgetText'

/** Entre uma resposta e a seguinte, no texto que a API monta: e a mesma conta, feita antes. */
const SEPARADOR = '\n\n'

/** A contagem de um campo aparece perto do teto, e nao desde a primeira letra. */
const PERTO_DO_TETO = 0.8

/**
 * As classes de cada tamanho do botao. **As margens e o espaco do icone precisam bater
 * com `LAUNCHER_SIZES`**, em `launcher.ts`: e com eles que a largura do quadro e
 * calculada. O medio e o botao de sempre (`h-10 px-4 text-body`).
 */
const TAMANHO_DO_BOTAO = {
  Small: 'h-8 gap-1.5 px-3 text-detail',
  Medium: 'h-10 gap-2 px-4 text-body',
  Large: 'h-12 gap-2.5 px-5 text-dialog',
} as const

/** Os cantos do botao, por dentro do anel — ver `launcherRadius`. */
const FORMATO_DO_BOTAO = {
  Pill: 'rounded-full',
  Rounded: 'rounded-lg',
  Square: 'rounded-none',
} as const

/** Os tipos que o quadro oferece, e qual vem marcado. Relidos a cada vez que ele abre. */
interface TiposDoQuadro {
  Types: WidgetReportTypeViewModel[]
  DefaultReportType: string | null
}

/** O tipo que vem marcado: o pre-marcado do projeto, senao o primeiro da lista. */
function marcadoDe(tipos: TiposDoQuadro): string {
  return tipos.DefaultReportType ?? tipos.Types[0]?.PublicId ?? ''
}

/**
 * O quadro do relato: o que a pessoa que visita o site do cliente enxerga.
 *
 * Ele nao sabe que esta dentro de um `iframe`, nao sabe quem e o cliente e nao
 * tem sessao. Tudo que muda a aparencia dele chega em `settings`, e tudo que diz
 * para onde o relato vai chega em `config`.
 */
interface EmbedAppProps {
  settings: WidgetSettingsViewModel
  config: EmbedConfig
  /**
   * A ligacao com a pagina hospedeira. Nula quando `embed.html` foi aberto
   * direto — ai nao ha quadro para redimensionar, e o formulario ja nasce aberto.
   */
  host?: HostConnection | null
  /**
   * O que o projeto aceita de anexo. **Nulo quando nao ha nada a oferecer** — anexo
   * desligado, armazenamento ausente, ou a leitura falhou. Nos tres casos o quadro
   * nao mostra o botao, e o relato segue inteiro so com texto.
   */
  media?: PublicMediaSettingsViewModel | null
  /**
   * A previa do painel: a configuracao ainda nao publicada, numa pagina de mentira.
   * **Nada e enviado** — o botao de enviar so avisa —, e as listas nao abrem: nao ha
   * chave, e a previa nao le relato de ninguem.
   */
  preview?: boolean
  /**
   * A parte do formulario que a tela do painel esta mudando, contornada. **So vale com
   * `preview`**: fora da previa, e ignorada — no site do cliente nada se contorna.
   */
  highlight?: PreviewFormPart | null
}

export function EmbedApp({
  settings,
  config,
  host = null,
  media = null,
  preview = false,
  highlight = null,
}: EmbedAppProps) {
  /**
   * Os tipos e o pre-marcado. **Comecam da configuracao lida e sao relidos a cada
   * abertura** (`expand`): o time pode mudar as perguntas com o quadro ja carregado na
   * pagina de alguem, e a API recusa a resposta que nao casa mais com elas pedindo para
   * fechar e abrir de novo — e isso so funciona se abrir de novo trouxer as novas.
   */
  const [tiposLidos, setTipos] = useState<TiposDoQuadro>(() => ({
    Types: settings.Types,
    DefaultReportType: settings.DefaultReportType,
  }))
  // Na previa, os tipos sao os do rascunho do painel, a cada mudanca: ela nao rele nada.
  const tipos: TiposDoQuadro = preview
    ? { Types: settings.Types, DefaultReportType: settings.DefaultReportType }
    : tiposLidos
  const [typeId, setTypeId] = useState(() => marcadoDe(settings))

  // E o pre-marcado acompanha o "Tipo pré-marcado" do rascunho. So quando ele muda: outra
  // mudanca qualquer na configuracao nao desfaz o tipo que se clicou na previa.
  const marcadoNaPrevia = preview ? marcadoDe(settings) : null
  useEffect(() => {
    if (marcadoNaPrevia !== null) setTypeId(marcadoNaPrevia)
  }, [marcadoNaPrevia])
  /**
   * O botao parado na pagina e do carregador, e nao daqui. Ai o quadro so existe porque
   * alguem pediu para abrir: nasce no formulario, nunca desenha o proprio botao, e
   * fechar so avisa a pagina — ver `InitMessage.launcher`.
   */
  const botaoDaPagina = host?.hostDrawsLauncher === true
  // Dentro de uma pagina, e com o botao daqui, comeca recolhido: quem visita o site do
  // cliente nao pediu um formulario no meio da tela.
  const [open, setOpen] = useState(!host || botaoDaPagina)

  /**
   * O que a pessoa escreveu, **por tipo**: as respostas as perguntas, na ordem delas, e
   * a caixa livre. Trocar de tipo no meio nao apaga nada — voltar ao tipo de antes
   * devolve o que estava escrito nele. So vai o do tipo escolhido.
   */
  const [respostas, setRespostas] = useState<Record<string, string[]>>({})
  const [caixas, setCaixas] = useState<Record<string, string>>({})
  // A resposta a "em poucas palavras, o que aconteceu?". Vira o titulo do card para
  // o time, e e o unico titulo que volta para quem relatou.
  const [title, setTitle] = useState('')
  // **A escolha e dela, e o projeto so decide como a caixa comeca.** Quem relatou
  // um defeito as pressas pode nao querer virar parte da investigacao — e prometer
  // resposta a quem nao vai responder deixa o relato pendurado esperando.
  const [acceptsQuestions, setAcceptsQuestions] = useState(settings.AcceptsQuestionsDefault)
  const [sending, setSending] = useState(false)
  // A entrada pediu o desafio invisivel e o quadro esta resolvendo: o botao diz
  // "Conferindo…" em vez de "Enviando…", e nada mais muda na tela.
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<CreatedReportViewModel | null>(null)

  /**
   * O codigo pessoal deste navegador, quando o projeto usa esse modo.
   *
   * **Comeca do armazenamento e e reescrito pela resposta.** O que vale e o que a
   * API confirmou: codigo desconhecido vira um novo do lado de la, e insistir no
   * antigo deixaria este navegador pedindo para sempre um valor que nao existe.
   */
  const [reporterCode, setReporterCode] = useState(() =>
    settings.IdentityMode === 'PersonalCode' ? (readReporterCode(config.key) ?? '') : '',
  )

  /** O projeto herda a identidade do site: quem diz quem e a pessoa e o cracha da pagina. */
  const herdada = settings.IdentityMode === 'InheritedIdentity'
  /**
   * O cracha que a pagina entregou — o do `init`, e depois o de cada abertura: o site
   * pode renovar a sessao, e a pessoa pode entrar ou sair sem recarregar. So no modo
   * que herda a identidade; nulo sem pagina (a previa, o relato de teste) e sem cracha.
   */
  const [cracha, setCracha] = useState(() => (herdada ? (host?.identity ?? null) : null))

  /**
   * Qual das duas telas o quadro mostra.
   *
   * **A lista nao substitui o formulario**: relatar continua sendo o que a
   * ferramenta faz, e a lista e para onde se volta depois.
   */
  const [view, setView] = useState<'form' | 'list' | 'public'>('form')

  /**
   * O nome, e a escolha de assiná-lo.
   *
   * **A caixa nasce desmarcada, e não segue padrão nenhum do projeto.** Ao
   * contrário de "aceito perguntas", aqui o silêncio não pode cair numa
   * configuração: o que está em jogo é o nome da pessoa ao lado de um texto que
   * qualquer um lê, e essa escolha não se herda.
   */
  /**
   * O projeto publica, num nível ou noutro.
   *
   * É o que liga o aviso, a entrada da lista pública e a caixa de assinar — e
   * `Private` é o padrão de fábrica, então um quadro que não conseguiu ler a
   * configuração não promete vitrine nenhuma.
   */
  const ehPublico = settings.Visibility !== 'Private'

  // No modo que herda a identidade, o cracha pode trazer o nome: o campo ja vem
  // preenchido com ele — e e sugestao, que a pessoa apaga ou troca.
  const [reporterName, setReporterName] = useState(() => nameFromIdentityToken(cracha) ?? '')
  const [signs, setSigns] = useState(false)

  /** O nome que o cracha sugeriu por ultimo: a proxima sugestao so troca o que ainda e dele. */
  const sugestao = useRef(reporterName)

  /** A cada abertura, o cracha de agora — e o nome dele, se o campo ainda nao e da pessoa. */
  function acompanharCracha() {
    if (!herdada || !host) return
    const atual = host.identity ?? null
    setCracha(atual)

    const nova = nameFromIdentityToken(atual) ?? ''
    const anterior = sugestao.current
    if (nova === anterior) return
    sugestao.current = nova
    setReporterName((campo) => (campo.trim().length === 0 || campo === anterior ? nova : campo))
  }

  /**
   * Conta quantas vezes o quadro foi reiniciado.
   *
   * Existe por uma corrida que o teste antigo nao pegava: fechar o quadro **com
   * o envio em voo** limpava o estado, e a resposta chegava depois e regravava o
   * protocolo por cima — reabrir mostrava o relato abandonado. O pedido ja saiu
   * e o relato existe no servidor de qualquer jeito; o que nao pode e ele voltar
   * a tela de quem desistiu.
   */
  const generation = useRef(0)

  /**
   * Os arquivos escolhidos. **Enquanto a pessoa escreve, nada sobe** — ver o gancho.
   * A geracao vai junto: fechar o quadro com envio em voo nao pode regravar a tela.
   */
  const draft = useAttachmentDraft(media, { generation })
  const { anexos, recusa, setRecusa, adicionar, remover, colar, enviarAnexo, enviarAnexos } = draft

  /**
   * O texto ja foi, ou esta indo: a lista de arquivos nao muda mais. **Em ref, alem
   * do estado**, para a captura que volta depois de a pessoa marcar a area saber
   * disso — o estado que ela leu e o do clique.
   */
  const travado = useRef(false)
  travado.current = sending || created !== null

  /** A pagina esta capturando: o quadro esta escondido, esperando a pessoa marcar. */
  const [capturando, setCapturando] = useState(false)

  /**
   * A pagina disse que nao deixa capturar — proibe o nosso script ou a nossa camada.
   * **O botao some de vez**: a proibicao do site do cliente nao muda no proximo
   * clique, e deixa-lo faria a pessoa ouvir a mesma recusa toda vez.
   */
  const [capturaIndisponivel, setCapturaIndisponivel] = useState(false)

  /** O botao de capturar, para o foco voltar a ele quando a captura termina. */
  const botaoCaptura = useRef<HTMLButtonElement>(null)

  // A captura vira imagem, e so aparece onde imagem e aceita — e onde ha uma pagina
  // que sabe capturar. Aberto direto, como no relato de teste do painel, nao ha.
  const tipoImagem = media?.Kinds.find((kind) => kind.Kind === 'Image') ?? null
  const podeCapturar =
    !!media?.AllowsScreenCapture &&
    tipoImagem !== null &&
    host?.canCapture === true &&
    !capturaIndisponivel

  // O foco volta ao botao quando a captura termina: quem usa teclado continua de
  // onde estava. Desligado durante a captura, ele tinha perdido o foco. **Menos quando
  // a captura abriu no editor**: o foco e dele, e o botao esta atras — com o foco ali,
  // um Enter pediria outra captura. O editor o devolve ao fechar.
  const editando = draft.edicao !== null
  const capturouAntes = useRef(false)
  useEffect(() => {
    if (capturouAntes.current && !capturando && !editando) botaoCaptura.current?.focus()
    capturouAntes.current = capturando
  }, [capturando, editando])

  // O tema fixado pelo cliente vale sempre; `Auto` acompanha o sistema de quem
  // visita, inclusive se ele mudar com o quadro ja aberto.
  useEffect(() => {
    const apply = (resolved: 'light' | 'dark') =>
      document.documentElement.setAttribute('data-theme', resolved)

    apply(resolveTheme(settings.Theme))
    return watchSystemTheme(settings.Theme, apply)
  }, [settings.Theme])

  const style = useMemo(() => accentStyle(settings), [settings])

  /**
   * Como o botao aparece aqui: com o texto, ou so o icone (escolhido, ou no celular).
   * Escondido nao chega a ser desenhado — `draw` nem revela o quadro. Na previa nao ha
   * pagina de verdade, entao as paginas escondidas nao entram; quem esconde o botao do
   * celular na previa e o painel.
   */
  const soIcone =
    launcherMode(settings, preview ? null : config.route, config.viewportWidth) === 'icon'

  /** O texto do botao, para medir: a largura do quadro acompanha ele. */
  const rotulo = useRef<HTMLSpanElement>(null)
  const larguraDoRotulo = useRef(0)

  // Mede o texto e diz a pagina o tamanho do botao — **antes** de ela revelar o quadro:
  // `draw` desenha com `flushSync`, e este efeito roda dentro dele. Aberto, o texto nao
  // esta na tela, e vale a ultima medida; a previa muda o canto mesmo assim.
  useLayoutEffect(() => {
    if (!host) return
    if (!open && rotulo.current) larguraDoRotulo.current = rotulo.current.scrollWidth
    host.place(launcherFrame(settings, soIcone ? 'icon' : 'full', larguraDoRotulo.current))
  }, [host, settings, soIcone, open])

  // O tipo escolhido e o formulario dele. Sem tipo nenhum o formulario nao tem o que
  // perguntar — a API nunca deixa um projeto sem tipo ativo, e o quadro nao envia.
  const tipo = tipos.Types.find((item) => item.PublicId === typeId) ?? tipos.Types[0] ?? null
  const perguntas = tipo?.Questions ?? []
  const respostasDoTipo = tipo ? (respostas[tipo.PublicId] ?? []) : []
  const caixaDoTipo = tipo ? (caixas[tipo.PublicId] ?? '') : ''
  const respostasAparadas = perguntas.map((_, index) => (respostasDoTipo[index] ?? '').trim())
  const caixaAparada = tipo?.ShowsTextBox ? caixaDoTipo.trim() : ''
  // A caixa sozinha e o relato inteiro; junto de perguntas, e mais uma resposta.
  const tetoDaCaixa = perguntas.length > 0 ? MAX_REPORT_ANSWER_LENGTH : MAX_REPORT_TEXT_LENGTH
  const partes = [
    ...respostasAparadas.filter((resposta) => resposta.length > 0),
    ...(caixaAparada ? [caixaAparada] : []),
  ]
  // Pelo menos uma resposta, ou a caixa: a API recusaria o vazio do mesmo jeito.
  const temConteudo = partes.length > 0
  // So acontece com tudo perto do maximo: as respostas juntas passam do teto do relato.
  // A API recusaria; aqui a pessoa sabe antes de clicar.
  const longoDemais = partes.join(SEPARADOR).length > MAX_REPORT_TEXT_LENGTH

  function responder(index: number, valor: string) {
    if (!tipo) return
    const id = tipo.PublicId
    setRespostas((atuais) => {
      const lista = [...(atuais[id] ?? [])]
      lista[index] = valor
      return { ...atuais, [id]: lista }
    })
  }

  function escreverNaCaixa(valor: string) {
    if (!tipo) return
    const id = tipo.PublicId
    setCaixas((atuais) => ({ ...atuais, [id]: valor }))
  }

  const perguntaTitulo = settings.ReportTitleMode !== 'Hidden'
  const tituloAparado = title.trim()
  // Obrigatoria, sem resposta nao envia — a API recusaria do mesmo jeito, e a
  // pessoa so descobriria depois de clicar.
  const faltaTitulo = settings.ReportTitleMode === 'Required' && tituloAparado.length === 0

  /**
   * Pede a pagina que capture uma area. **Quem captura e a pagina**: o quadro some,
   * a pessoa marca o que quer mostrar, e a imagem volta **direto para o editor** — e
   * dele para a lista, como se tivesse sido escolhida, pelas mesmas conferencias.
   * A captura nao esconde nada sozinha: e no editor que a pessoa cobre o que nao quer
   * mostrar.
   *
   * **Desistir nao e erro**, e nao merece mensagem. Falhar e a pagina que nao deixou
   * redesenhar: a recusa diz para anexar uma imagem no lugar, e o botao fica — a
   * proxima area pode dar certo.
   */
  async function capturar() {
    // Com uma imagem no editor, outra captura tomaria o lugar dela sem aviso.
    if (!host || draft.edicao) return

    setRecusa(null)
    setCapturando(true)

    // Marcar leva o tempo da pessoa. Reiniciado o quadro nesse meio, a captura
    // chegaria num formulario que ja e outro; enviado o relato, ele ja saiu com a
    // lista que tinha.
    const minha = generation.current

    try {
      const resultado = await host.capture(tipoImagem?.MaxBytes ?? null)
      if (generation.current !== minha || travado.current) return

      if (resultado.outcome === 'file') draft.editarCaptura(resultado.file)
      else if (resultado.outcome === 'failed')
        setRecusa('Não deu para capturar esta página. Anexe uma imagem no lugar.')
      else if (resultado.outcome === 'unavailable') {
        setCapturaIndisponivel(true)
        setRecusa('Este site não deixa capturar a página. Anexe uma imagem no lugar.')
      }
    } finally {
      setCapturando(false)
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    // A previa nunca envia: o painel mostra como fica, e o relato de teste e outra tela.
    if (preview) {
      setError('Esta é só a prévia: nada foi enviado.')
      return
    }
    // Arquivo ainda entrando na lista nao subiria: o envio leva a lista como ela
    // esta. Ver `preparando` em useAttachmentDraft.
    // Nem com o editor aberto: a imagem que esta nele ainda nao e a que vai.
    if (
      !tipo ||
      !temConteudo ||
      longoDemais ||
      faltaTitulo ||
      sending ||
      draft.preparando ||
      draft.edicao
    )
      return

    setSending(true)
    setError(null)

    // A geracao deste envio. Se ela mudar enquanto a resposta nao volta, o
    // quadro foi reiniciado no meio e o resultado nao vale mais.
    const minha = generation.current

    // Os arquivos deste relato, guardados agora: fechar o quadro com o relato ainda
    // sendo criado esvazia a lista da tela, e eles precisam subir mesmo assim. Com o
    // quadro nao reiniciado, vale a lista da volta — ver abaixo.
    const arquivos = [...draft.atual()]

    try {
      // **O tipo de fabrica do quadro nao tem identificador de verdade**: ele so existe
      // porque a leitura da configuracao falhou. Antes de enviar, o quadro le de novo e
      // procura o tipo de verdade com o mesmo nome e as mesmas perguntas. Mandar um
      // identificador inventado seria recusado — e o texto da pessoa fica onde esta.
      let tipoId = tipo.PublicId
      if (isFallbackType(tipoId)) {
        const real = await findRealType(config.key, config.origin, tipo)
        if (generation.current !== minha) return
        if (real === 'failed') {
          setError(
            'Não deu para falar com o servidor agora, e o relato não saiu. O que você escreveu continua aqui: tente enviar de novo em instantes.',
          )
          return
        }
        if (real === 'changed') {
          setError(
            'Este formulário mudou desde que foi aberto, e o relato não saiu. Copie o que escreveu, feche e abra de novo para ver as perguntas de agora.',
          )
          return
        }
        tipoId = real.found
      }

      const pedido = {
        Key: config.key,
        TypeId: tipoId,
        // Escondida, a pergunta nao foi feita: nada vai, nem o que ficou de uma
        // configuracao anterior.
        Title: perguntaTitulo && tituloAparado.length > 0 ? tituloAparado : null,
        // Uma resposta para cada pergunta, na ordem delas — a pulada vai em branco.
        Answers: respostasAparadas,
        // As perguntas que a pessoa leu: e com elas que a API confere que nada mudou.
        Questions: perguntas,
        // Nulo no tipo sem caixa: mandar texto para ele e recusado.
        Text: caixaAparada.length > 0 ? caixaAparada : null,
        // O caminho da ultima abertura, quando a pagina disse: o site pode ter trocado
        // de pagina sem recarregar desde o `init`.
        Route: host?.route !== undefined ? host.route : config.route,
        Origin: config.origin,
        AcceptsQuestions: acceptsQuestions,
        // Só vai quando o projeto pergunta: num projeto que não pergunta, mandar
        // nome gravaria dado pessoal que a configuração diz não coletar.
        ReporterName:
          settings.AsksForName && reporterName.trim().length > 0 ? reporterName.trim() : undefined,
        ReporterNameIsPublic: settings.AsksForName && signs,
        // Vazio quando este navegador nunca relatou aqui — e ai a resposta traz um
        // codigo novo. Num projeto de outro modo, mandar codigo seria recusado,
        // entao so vai quando ha um.
        ReporterCode: reporterCode.length > 0 ? reporterCode : undefined,
        // O cracha do site, so no projeto que herda a identidade — e o de agora, que a
        // pagina pode ter renovado desde a abertura. Sem pagina nao ha cracha.
        IdentityToken: herdada && host ? (host.identity ?? undefined) : undefined,
        Context: buildReportContext(config),
      }

      // **O desafio invisivel.** Passado um limite do projeto, a entrada responde 429 com
      // um bilhete; o quadro resolve a conta (um ou dois segundos, "Conferindo…") e manda
      // o mesmo relato de novo com a resposta. Duas voltas no maximo: uma terceira seria
      // a API pedindo de novo sem parar, e ai a mensagem dela vai para a tela.
      let criado: CreatedReportViewModel | null = null
      let respostaDoDesafio: { ChallengeToken: string; ChallengeNonce: string } | null = null
      for (let volta = 0; criado === null; volta++) {
        try {
          criado = await reportService.createReport({ ...pedido, ...respostaDoDesafio })
        } catch (falha) {
          const desafio = challengeOf(falha)
          if (!desafio || volta >= 2) throw falha
          if (generation.current !== minha) return
          setChecking(true)
          try {
            const nonce = await solveChallenge(
              desafio.Token,
              desafio.Difficulty,
              () => generation.current !== minha,
            )
            respostaDoDesafio = { ChallengeToken: desafio.Token, ChallengeNonce: nonce }
          } catch {
            // Passou do tempo, ou o quadro foi reiniciado no meio: a recusa original
            // diz o que houve.
            throw falha
          } finally {
            if (generation.current === minha) setChecking(false)
          }
          if (generation.current !== minha) return
        }
      }

      const credenciais = { trackingCode: criado.TrackingCode, token: criado.AccessToken }

      // **Guarda o que a API confirmou, e nao o que foi mandado.** Ver o comentario
      // do estado: o codigo pode ter mudado do lado de la. Guarda mesmo com o quadro
      // fechado no meio: o relato existe, e sem o codigo dele a proxima vez pediria
      // outro, dividindo os relatos desta pessoa em dois.
      if (criado.ReporterCode !== null) {
        setReporterCode(criado.ReporterCode)
        writeReporterCode(config.key, criado.ReporterCode)
      }

      // **Fechado no meio, o relato existe e os arquivos vao.** A tela e outra, e
      // nada dela muda; o envio so termina.
      if (generation.current !== minha) {
        if (arquivos.length > 0) void enviarAnexos(credenciais, minha, arquivos)
        return
      }

      setCreated(criado)

      // **O protocolo aparece antes de os arquivos subirem.** Ele ja esta
      // garantido — o relato existe —, e fazer a pessoa esperar os arquivos
      // terminarem para ver o protocolo seria esconder a parte que nao pode se
      // perder.
      //
      // A lista e a de agora, e nao a do clique: e ela que a tela mostra. A lista fica
      // travada durante o envio, e isto e a segunda tranca.
      if (draft.atual().length > 0) void enviarAnexos(credenciais, minha)
    } catch (failure) {
      if (generation.current !== minha) return
      setError(describeError(failure))
    } finally {
      if (generation.current === minha) setSending(false)
    }
  }

  /**
   * Volta o quadro ao estado de quem ainda nao relatou.
   *
   * Sem isto, `created` fica gravado enquanto o documento viver — e o documento
   * de um quadro vive o tempo da pagina, que numa aplicacao de pagina unica sao
   * horas. Quem relatava, fechava e abria de novo reencontrava o protocolo
   * **antigo**, sem caminho nenhum de volta para escrever.
   */
  function reset() {
    // Invalida o envio que estiver em voo: a resposta dele chega depois desta
    // linha e nao pode regravar o que acabou de ser limpo.
    generation.current += 1

    setCreated(null)
    setRespostas({})
    setCaixas({})
    setTitle('')
    setError(null)
    setSending(false)
    setChecking(false)
    setTypeId(marcadoDe(tipos))
    setAcceptsQuestions(settings.AcceptsQuestionsDefault)
    setReporterName('')
    setSigns(false)

    draft.limpar()
  }

  function expand() {
    setOpen(true)
    host?.expand()
    void relerTipos()
  }

  /**
   * Le os tipos de novo, ao abrir. **Falhar nao muda nada**: ficam os que ja estavam.
   *
   * O que a pessoa ja escreveu num tipo cujas perguntas mudaram sai — a resposta ficaria
   * embaixo de outra pergunta. O tipo marcado que saiu da lista cai no pre-marcado novo.
   */
  async function relerTipos() {
    if (config.key.trim().length === 0) return

    let lida: WidgetSettingsViewModel | null
    try {
      lida = await widgetSettingsService.loadWidgetSettings(config.key, config.origin)
    } catch {
      return
    }
    if (!lida || lida.Types.length === 0) return

    const novos: TiposDoQuadro = { Types: lida.Types, DefaultReportType: lida.DefaultReportType }
    const mudou = (id: string) => {
      const antes = tipos.Types.find((item) => item.PublicId === id)
      const agora = novos.Types.find((item) => item.PublicId === id)
      return (
        !antes ||
        !agora ||
        antes.ShowsTextBox !== agora.ShowsTextBox ||
        antes.Questions.join('\u0000') !== agora.Questions.join('\u0000')
      )
    }

    setTipos(novos)
    setRespostas((atuais) =>
      Object.fromEntries(Object.entries(atuais).filter(([id]) => !mudou(id))),
    )
    setCaixas((atuais) => Object.fromEntries(Object.entries(atuais).filter(([id]) => !mudou(id))))
    setTypeId((atual) =>
      novos.Types.some((item) => item.PublicId === atual) ? atual : marcadoDe(novos),
    )
  }

  /**
   * Fecha o quadro. **O rascunho fica**: as respostas, a caixa, o titulo e os arquivos
   * esperam a proxima abertura, como no `Pds.close()` da pagina — fechar sem querer, ou
   * para olhar a pagina de novo antes de terminar, nao pode custar o que foi escrito.
   * So o relato enviado limpa: fechar a confirmacao e o fim daquele relato, e a proxima
   * abertura comeca outro.
   */
  function collapse() {
    const enviado = created !== null

    if (botaoDaPagina) {
      // O quadro continua no formulario, para a proxima abertura ser instantanea: quem
      // esconde e a pagina, que guarda o quadro e mostra o botao dela.
      if (enviado) reset()
      setView('form')
      host?.close?.()
      return
    }

    setOpen(false)
    host?.collapse()
    if (enviado) reset()
  }

  /**
   * A pagina pediu para abrir (`OpenMessage`). **Em ref**, para o ouvinte inscrito uma
   * vez so ver o estado de agora. Da segunda abertura em diante, le os tipos de novo —
   * o que o botao de dentro fazia a cada clique — e repete o tamanho do formulario.
   */
  const formulario = useRef<HTMLFormElement>(null)
  const abriuAntes = useRef(false)

  /** A parte contornada: so na previa, e nunca no site do cliente. */
  const realce = preview ? highlight : null
  /** A marca da parte contornada: e por ela que o contorno se acha para entrar na vista. */
  const marca = (parte: PreviewFormPart) => (realce === parte ? parte : undefined)
  /** O contorno, so na parte contornada. Ver `PREVIEW_OUTLINE`. */
  const contorno = (parte: PreviewFormPart) => (realce === parte ? PREVIEW_OUTLINE : undefined)

  // A parte contornada fora da vista entra nela, rolando **so o formulario**: o
  // `scrollIntoView` rolaria tambem a tela do painel, que e a janela de cima.
  useEffect(() => {
    const form = formulario.current
    const parte = realce ? form?.querySelector<HTMLElement>('[data-preview-highlight]') : null
    if (!form || !parte) return
    const fora = form.getBoundingClientRect()
    const dentro = parte.getBoundingClientRect()
    const folga = 12
    if (dentro.top < fora.top) form.scrollTop -= fora.top - dentro.top + folga
    else if (dentro.bottom > fora.bottom) form.scrollTop += dentro.bottom - fora.bottom + folga
  }, [realce])
  const aoAbrir = useRef((_opcoes?: OpenOptions) => {})
  aoAbrir.current = (opcoes) => {
    if (abriuAntes.current) {
      host?.expand()
      void relerTipos()
    }
    abriuAntes.current = true
    acompanharCracha()
    // A previa que abre sozinha nao puxa o foco da tela do painel.
    if (opcoes?.focus === false) return
    // O foco no primeiro campo de escrever: quem abriu pelo teclado continua nele.
    const campo =
      formulario.current?.querySelector<HTMLElement>(
        'input:not([type="checkbox"]):not([type="hidden"]), textarea',
      ) ?? formulario.current
    campo?.focus()
  }

  useEffect(() => host?.onOpen?.((opcoes) => aoAbrir.current(opcoes)), [host])

  /**
   * Esc fecha, **so com o botao da pagina** — e o que devolve a pessoa ao site. Nao com
   * um menu ou o editor da imagem abertos: ali o Esc e deles, e fechar tudo junto
   * perderia a marcacao do print. Nem durante o envio ou o "Conferindo…": a pessoa
   * esperava a confirmacao, e o Esc ali e quase sempre a tecla errada.
   */
  const fecharComEsc = useRef(() => {})
  fecharComEsc.current = () => {
    if (!draft.edicao && !capturando && !sending && !checking) collapse()
  }

  useEffect(() => {
    if (!botaoDaPagina) return

    function tecla(event: KeyboardEvent) {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      // O Esc da composicao (acento, teclado de outro idioma) e do metodo de entrada:
      // ele cancela o caractere, e nao o relato.
      if (event.isComposing) return
      if (document.querySelector('[data-radix-popper-content-wrapper], [role="dialog"]')) return
      fecharComEsc.current()
    }

    document.addEventListener('keydown', tecla)
    return () => document.removeEventListener('keydown', tecla)
  }, [botaoDaPagina])

  // Recolhido o documento inteiro e o gatilho: o `iframe` tem o tamanho dele, e
  // e por isso que o resto da pagina do cliente continua clicavel em volta.
  // So acontece com o botao daqui — com o da pagina, o quadro nunca recolhe.
  //
  // So o icone, o texto nao some: vira a dica e o nome que o leitor de tela anuncia.
  if (!open) {
    const icone = settings.LauncherIcon !== 'None' ? settings.LauncherIcon : null

    return (
      <div style={style} className="flex h-full items-center justify-center p-1">
        <button
          type="button"
          onClick={expand}
          aria-label={soIcone ? settings.LauncherLabel : undefined}
          title={soIcone ? settings.LauncherLabel : undefined}
          className={cn(
            'flex w-full items-center justify-center bg-[var(--widget-accent)]',
            'font-medium text-[var(--widget-ink)]',
            TAMANHO_DO_BOTAO[settings.LauncherSize] ?? TAMANHO_DO_BOTAO.Medium,
            FORMATO_DO_BOTAO[settings.LauncherShape] ?? FORMATO_DO_BOTAO.Pill,
            soIcone && 'px-0',
          )}
        >
          {icone && (
            <LauncherIconSvg icon={icone} size={launcherSize(settings.LauncherSize).icon} />
          )}
          {!soIcone && (
            <span ref={rotulo} className="truncate">
              {settings.LauncherLabel}
            </span>
          )}
        </button>
      </div>
    )
  }

  // **Antes do formulario e depois de `created`**: quem acabou de relatar ve a
  // confirmacao, e nao a lista — o codigo dela aparece la, e e o momento de
  // guarda-lo.

  if (view === 'public') {
    return (
      <div style={style} className="h-full">
        <PublicList publicKey={config.key} onBack={() => setView('form')} />
      </div>
    )
  }

  if (view === 'list') {
    return (
      <div style={style} className="h-full">
        <MyReports
          publicKey={config.key}
          credencial={
            herdada
              ? { tipo: 'identidade', token: cracha ?? '' }
              : {
                  tipo: 'codigo',
                  code: reporterCode,
                  onCodeChange: (codigo) => {
                    setReporterCode(codigo)
                    writeReporterCode(config.key, codigo)
                  },
                }
          }
          onBack={() => setView('form')}
        />
      </div>
    )
  }

  if (created) {
    const trackingLink = buildTrackingLink(created.TrackingCode, created.AccessToken)

    return (
      // `overflow-y-auto` pelo mesmo motivo do formulario: com arquivos na lista e o
      // codigo pessoal, a confirmacao passa da altura do quadro — e o que ficaria fora
      // seria o link que aparece uma vez so, e o "Fechar".
      <section style={style} className="flex h-full flex-col gap-4 overflow-y-auto bg-surface p-5">
        {/* O texto e o protocolo: a mesma peca que as previas do painel mostram. */}
        <SentConfirmation
          message={settings.SuccessMessage}
          values={{
            primeiroNome: settings.AsksForName ? firstName(reporterName) : null,
            protocolo: created.TrackingCode,
            tipo: tipo?.Name,
            projeto: settings.ProjectName,
          }}
          trackingCode={created.TrackingCode}
        />

        <AttachmentProgress
          anexos={anexos}
          savedNote="O relato foi enviado e o seu texto está salvo."
          onRetry={(anexo) =>
            void enviarAnexo(
              { trackingCode: created.TrackingCode, token: created.AccessToken },
              anexo,
              generation.current,
            )
          }
          onDiscard={(anexo) => remover(anexo.id)}
        />

        {/* **O codigo aparece em toda confirmacao, e nao so na primeira.** Ele e o
            que reencontra todos os relatos desta pessoa — inclusive de outro
            aparelho, onde o navegador nao guardou nada. Mostrar so na primeira vez
            faria quem limpou o navegador nunca mais reencontrar a lista. */}
        {created.ReporterCode !== null && (
          <div className="rounded-lg border border-border bg-surface-raised p-4">
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              <p className="text-detail text-fg-muted">O seu código</p>
              <CopyButton value={created.ReporterCode} label="Copiar" size="sm" />
            </div>
            <p className="mb-2 font-mono text-fg text-lead tracking-wide">{created.ReporterCode}</p>
            <p className="text-caption text-fg-muted leading-normal">
              Guarde: é com ele que você reencontra{' '}
              <strong className="font-medium text-fg">todos</strong> os seus relatos, de qualquer
              navegador. Perdê-lo custa a lista, não os relatos — o link acima continua valendo.
            </p>
          </div>
        )}

        {/* O link e a unica forma de voltar a este relato, e ele sai daqui uma vez
            so: o token vive no fragmento dele, e o banco guarda apenas o hash.
            Fechado o quadro sem copiar, ninguem o recupera.

            `rel="noreferrer"` vale pelo `noopener` que ele implica: sem isso a aba
            nova ganha um `window.opener` apontando para este quadro, que roda
            dentro do site de outra pessoa. **Nao e o `Referer` que ele protege** —
            o desta navegacao seria o endereco do proprio `embed.html`, que nao
            carrega protocolo nem token.

            Abrir em outra aba e obrigatorio: aqui dentro sao 360 por 520 pixels. */}
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={trackingLink}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-detail text-fg underline underline-offset-4"
            >
              Acompanhar este relato
            </a>
            <CopyButton value={trackingLink} label="Copiar link" size="sm" />
          </div>
          {/* **Duas coisas, e as duas so existem se estiverem escritas aqui.**
              A primeira: o link aparece uma vez so. Os dois botoes logo abaixo o
              destroem — `Relatar outra coisa` e `Fechar` chamam `reset()`, que
              limpa `created` —, e o banco guarda apenas o hash, entao nao ha rota
              que o mostre de novo. O painel ja diz isto da chave secreta, com a
              mesma palavra; faltava dizer para quem relata.

              A segunda: quem tem o link le o relato. E consequencia do desenho, e
              nao descuido — um link que exigisse senha nao seria um link, e quem
              relata um defeito num site nao tem conta em lugar nenhum. Dizer e o
              que transforma a consequencia em escolha de quem recebeu. */}
          <p className="mt-2 text-caption text-fg-muted leading-normal">
            <strong className="font-medium text-fg">Copie o link agora:</strong> ele aparece uma vez
            só, e ao fechar não há como mostrá-lo de novo. Guarde para você — quem o tiver consegue
            ler este relato.
          </p>
        </div>

        {/* **So no modo que herda a identidade, e nos dois sentidos.** Reconhecida, a
            pessoa sabe onde reencontrar o relato sem guardar nada; nao reconhecida,
            precisa saber, antes de fechar, que o link e a unica volta. */}
        {created.Identified === true && (
          <p className="text-caption text-fg-muted leading-normal">
            Este relato ficou ligado a você: ele aparece em “Ver os meus relatos” sempre que você
            estiver na sua conta neste site.
          </p>
        )}
        {created.Identified === false && (
          <p className="text-caption text-fg-muted leading-normal">
            Não deu para reconhecer você pelo site, e este relato não ficou ligado à sua conta: o
            link acima é a única forma de voltar a ele.
          </p>
        )}

        <div className="mt-auto flex flex-wrap items-center gap-2">
          <CopyButton value={created.TrackingCode} label="Copiar protocolo" size="sm" />
          {/* O caminho de volta ao formulario, sem passar por fechar e reabrir. */}
          <Button variant="ghost" size="sm" onClick={reset}>
            Relatar outra coisa
          </Button>
          {host && (
            <Button variant="ghost" size="sm" onClick={collapse}>
              Fechar
            </Button>
          )}
        </div>
      </section>
    )
  }

  // **Sem o cracha num projeto que o exige, nao ha formulario.** Avisar depois do texto
  // pronto seria avisar tarde. Na previa o aviso nao aparece: ela mostra o formulario.
  if (herdada && settings.IdentityRequired && cracha === null && !preview) {
    return (
      <section style={style} className="flex h-full flex-col gap-4 overflow-y-auto bg-surface p-5">
        <div className="flex items-start justify-between gap-3">
          <h1 className="font-semibold text-fg text-lead tracking-tight">{settings.Title}</h1>
          {host && (
            <Button variant="ghost" size="sm" onClick={collapse} aria-label="Fechar">
              Fechar
            </Button>
          )}
        </div>
        <p className="text-detail text-fg-muted leading-relaxed">
          Para relatar aqui, entre na sua conta neste site e abra o formulário de novo.
        </p>
      </section>
    )
  }

  return (
    <form
      ref={formulario}
      style={style}
      onSubmit={submit}
      // No formulario inteiro, e nao so na caixa de texto: quem tirou o print cola
      // com o foco onde estiver. Durante o envio a lista esta travada.
      onPaste={sending ? undefined : colar}
      // `overflow-y-auto` e a ultima linha de defesa: com o quadro baixo demais
      // para o conteudo minimo, rola em vez de aparar.
      className="flex h-full flex-col gap-4 overflow-y-auto bg-surface p-5"
    >
      <div
        data-preview-highlight={marca('form-top')}
        className={cn('flex items-start justify-between gap-3', contorno('form-top'))}
      >
        <h1 className="font-semibold text-fg text-lead tracking-tight">{settings.Title}</h1>
        {host && (
          <Button variant="ghost" size="sm" onClick={collapse} aria-label="Fechar">
            Fechar
          </Button>
        )}
      </div>

      {/* **No modo do codigo, sempre — e nao so quando ha codigo guardado.** Quem trocou
          de navegador nao tem nada guardado e e justamente quem mais precisa da entrada:
          a lista pede o codigo ali dentro. **No modo que herda a identidade, so com o
          cracha**: sem ele nao ha de quem listar. A previa mostra a entrada nos dois. */}
      {(settings.IdentityMode === 'PersonalCode' || (herdada && (preview || cracha !== null))) && (
        <button
          type="button"
          onClick={() => !preview && setView('list')}
          className="-mt-1 self-start font-medium text-detail text-fg underline underline-offset-4"
        >
          Ver os meus relatos
        </button>
      )}

      {ehPublico && (
        <button
          type="button"
          onClick={() => !preview && setView('public')}
          className="-mt-1 self-start font-medium text-detail text-fg underline underline-offset-4"
        >
          Ver o que já foi relatado
        </button>
      )}

      {/* **Antes de escrever, e não depois.** Avisar quando o texto já está
          pronto seria avisar tarde, e quem descobrisse ali teria de apagar o que
          escreveu. A frase diz o que acontece, e não o que a política permite. */}
      {ehPublico && (
        <p className="rounded-lg border border-border border-dashed bg-surface px-3 py-2 text-detail text-fg-muted leading-normal">
          {/* O aviso e do projeto; a frase do nome, nao — ela depende do nivel, e um
              texto livre ali poderia prometer o contrario do que acontece. */}
          {settings.PublicNotice}
          {settings.Visibility === 'PublicIdentified'
            ? ' O seu nome só aparece se você marcar abaixo.'
            : ' O seu nome nunca aparece.'}
        </p>
      )}

      {/* Os tipos que o projeto oferece, na ordem dele, cada um com o desenho e o nome.
          Escondido o seletor, vai o pre-marcado. */}
      {settings.ShowsTypeField && tipos.Types.length > 0 && (
        <fieldset
          data-preview-highlight={marca('form-type')}
          className={cn('flex flex-wrap gap-2', contorno('form-type'))}
        >
          <legend className="mb-1.5 text-detail text-fg-muted">{settings.TypeFieldLabel}</legend>

          {tipos.Types.map((option) => (
            <button
              key={option.PublicId}
              type="button"
              aria-pressed={tipo?.PublicId === option.PublicId}
              onClick={() => setTypeId(option.PublicId)}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-detail transition-colors',
                tipo?.PublicId === option.PublicId
                  ? 'border-transparent bg-[var(--widget-accent)] text-[var(--widget-ink)]'
                  : 'border-border bg-surface text-fg hover:bg-surface-sunken',
              )}
            >
              <ReportTypeIconSvg icon={option.Icon} />
              {option.Name}
            </button>
          ))}
        </fieldset>
      )}

      {/* Antes do texto: e a pergunta curta, e quem responde ja pensou no que vai
          contar. Numa linha so — titulo nao e paragrafo. */}
      {perguntaTitulo && (
        <label
          data-preview-highlight={marca('form-title')}
          className={cn('flex flex-col gap-1.5', contorno('form-title'))}
        >
          <span className="text-detail text-fg-muted">
            {settings.ReportTitleQuestion}
            {settings.ReportTitleMode === 'Optional' && ' (opcional)'}
          </span>
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => {
              // Enter numa linha so enviaria o formulario pela metade, sem o texto.
              if (event.key === 'Enter') event.preventDefault()
            }}
            maxLength={MAX_CARD_TITLE_LENGTH}
            required={settings.ReportTitleMode === 'Required'}
            placeholder={settings.ReportTitlePlaceholder}
            className="h-9 rounded-lg border border-border bg-surface-raised px-3 text-body text-fg placeholder:text-fg-placeholder"
          />
        </label>
      )}

      {tipo === null && (
        <p className="text-detail text-fg-muted leading-normal">
          Este formulário ainda não tem o que perguntar. Tente de novo mais tarde.
        </p>
      )}

      {/* As perguntas do tipo, cada uma num campo pequeno. **Nenhuma e obrigatoria
          sozinha**: quem relata responde o que sabe, e o envio pede so uma — ou a
          caixa. `flex-none` porque o quadro rola: sem ele, o campo encolheria ate
          sumir para caber na altura. A chave leva o tipo, e trocar de tipo troca os
          campos. */}
      {perguntas.length > 1 && (
        <p className="-mb-2 text-caption text-fg-muted">Responda o que souber.</p>
      )}
      {tipo &&
        perguntas.map((pergunta, index) => {
          const valor = respostasDoTipo[index] ?? ''
          return (
            // A pergunta nao se repete dentro do tipo — a API recusa —, e e a chave.
            <label key={`${tipo.PublicId}-${pergunta}`} className="flex flex-none flex-col gap-1.5">
              <span className="flex items-baseline justify-between gap-2 text-detail text-fg-muted">
                <span>{pergunta}</span>
                {valor.length >= MAX_REPORT_ANSWER_LENGTH * PERTO_DO_TETO && (
                  <span className="flex-none tabular-nums">
                    {valor.length}/{MAX_REPORT_ANSWER_LENGTH}
                  </span>
                )}
              </span>
              <textarea
                value={valor}
                onChange={(event) => responder(index, event.target.value)}
                maxLength={MAX_REPORT_ANSWER_LENGTH}
                rows={2}
                className={cn(
                  'resize-none rounded-lg border border-border bg-surface-raised px-3 py-2',
                  'text-body text-fg leading-normal placeholder:text-fg-placeholder',
                )}
              />
            </label>
          )
        })}

      {tipo?.ShowsTextBox && (
        <div
          data-preview-highlight={marca('form-box')}
          className={cn(
            contorno('form-box'),
            'flex flex-1 flex-col gap-1.5',
            // `min-h-0` e o que permite ENCOLHER: sem ele o textarea trava em
            // `min-h-28` e empurra o botao para fora de um documento que nao
            // rola. Em janela de 320px o carregador entrega 280px de quadro, e o
            // "Enviar" ficava inalcancavel com o relato ja escrito.
            //
            // **Com imagem na lista, ou depois de perguntas, o piso volta.** O que
            // vem antes e depois passa da altura do quadro: sem piso, a caixa
            // encolheria ate sumir. Com ele, o formulario rola, e o "Enviar" continua
            // alcancavel.
            anexos.length > 0 || perguntas.length > 0 ? 'min-h-24' : 'min-h-0',
          )}
        >
          {/* Depois de perguntas, a caixa ganha nome: sem ele, ela pareceria parte da
              ultima. Sozinha, o texto dentro dela ja e a pergunta. */}
          {perguntas.length > 0 && (
            <span className="flex items-baseline justify-between gap-2 text-detail text-fg-muted">
              <span id="pds-caixa-rotulo">
                {settings.MoreDetailsLabel} <span className="text-fg-placeholder">(opcional)</span>
              </span>
              {caixaDoTipo.length >= tetoDaCaixa * PERTO_DO_TETO && (
                <span className="flex-none tabular-nums">
                  {caixaDoTipo.length}/{tetoDaCaixa}
                </span>
              )}
            </span>
          )}
          <textarea
            value={caixaDoTipo}
            onChange={(event) => escreverNaCaixa(event.target.value)}
            placeholder={tipo.TextBoxPrompt ?? ''}
            maxLength={tetoDaCaixa}
            aria-labelledby={perguntas.length > 0 ? 'pds-caixa-rotulo' : undefined}
            aria-label={perguntas.length > 0 ? undefined : (tipo.TextBoxPrompt ?? settings.Title)}
            aria-invalid={error ? true : undefined}
            className={cn(
              'min-h-0 flex-1 resize-none rounded-lg border bg-surface-raised px-3 py-2.5',
              'text-body text-fg leading-normal placeholder:text-fg-placeholder',
              error ? 'border-error-border' : 'border-border',
            )}
          />
          {perguntas.length === 0 && caixaDoTipo.length >= tetoDaCaixa * PERTO_DO_TETO && (
            <span className="self-end text-caption text-fg-muted tabular-nums">
              {caixaDoTipo.length}/{tetoDaCaixa}
            </span>
          )}
        </div>
      )}

      {media && (
        <AttachmentPicker
          highlighted={realce === 'form-attachments'}
          media={media}
          anexos={anexos}
          recusa={recusa}
          onAdd={(arquivos) => void adicionar(arquivos)}
          onRemove={remover}
          onEdit={draft.editar}
          onResize={draft.redimensionar}
          disabled={sending}
          actions={
            podeCapturar && (
              <button
                ref={botaoCaptura}
                type="button"
                onClick={() => void capturar()}
                // A captura vira imagem: sem vaga para imagem, marcar a area
                // terminaria numa recusa.
                disabled={sending || capturando || !hasRoom(anexos, media, 'Image')}
                className={ATTACH_BUTTON_CLASS}
              >
                Capturar tela
              </button>
            )
          }
        />
      )}

      {/* A imagem aberta no editor. Enquanto ele esta aberto, o quadro pede a pagina o
          tamanho do editor, e volta ao do formulario quando fecha. */}
      <AttachmentEditor
        draft={draft}
        accent={style}
        onOpenChange={(aberto) => (aberto ? host?.enlarge() : host?.expand())}
        focusAfterCapture={() => botaoCaptura.current?.focus()}
      />

      {/*
        **A caixa fica depois do texto, e nao antes.** Antes, ela seria uma
        condicao a aceitar para poder relatar; depois, e o que a pessoa decide
        **sobre o que acabou de escrever**. A ordem muda o que a pergunta parece
        estar pedindo.

        E a frase fala do que vai acontecer com ela, e nao do que o time precisa:
        quem le esta pensando no proprio problema, nao no fluxo de trabalho de
        quem vai atender.
      */}
      <label className="flex cursor-pointer items-start gap-2 text-detail text-fg-muted">
        <input
          type="checkbox"
          checked={acceptsQuestions}
          onChange={(event) => setAcceptsQuestions(event.target.checked)}
          className="mt-0.5 flex-none accent-[var(--widget-accent)]"
        />
        <span>Pode me perguntar algo sobre isto, se precisarem</span>
      </label>

      {settings.AsksForName && (
        <div
          data-preview-highlight={marca('form-name')}
          className={cn('flex flex-col gap-2', contorno('form-name'))}
        >
          <label htmlFor="pds-nome" className="text-detail text-fg-muted">
            {settings.NameQuestion} <span className="text-fg-placeholder">(opcional)</span>
          </label>
          <input
            id="pds-nome"
            value={reporterName}
            onChange={(event) => setReporterName(event.target.value)}
            maxLength={MAX_REPORTER_NAME_LENGTH}
            className="h-9 rounded-lg border border-border bg-surface-raised px-3 text-body text-fg placeholder:text-fg-placeholder"
          />

          {/* **Só existe onde o nome poderia aparecer.** Num projeto que não
              publica identificado, oferecer "quero assinar" prometeria uma
              vitrine que não existe. */}
          {ehPublico && settings.Visibility === 'PublicIdentified' && (
            <label className="flex cursor-pointer items-start gap-2 text-detail text-fg-muted">
              <input
                type="checkbox"
                checked={signs}
                disabled={reporterName.trim().length === 0}
                onChange={(event) => setSigns(event.target.checked)}
                className="mt-0.5 flex-none accent-[var(--widget-accent)]"
              />
              <span>Quero que o meu nome apareça junto deste relato</span>
            </label>
          )}

          {!ehPublico && (
            <p className="text-detail text-fg-muted leading-normal">
              Fica só com a equipe. Este projeto não publica relato nenhum.
            </p>
          )}
        </div>
      )}

      {longoDemais && (
        <p className="text-detail text-error-fg leading-normal">
          O relato inteiro passou de {MAX_REPORT_TEXT_LENGTH} caracteres. Encurte alguma resposta.
        </p>
      )}

      {error && (
        <p role="alert" className="text-detail text-error-fg leading-normal">
          {error}
        </p>
      )}

      {/*
        **Nao usa o `Button` do painel, e isso e a decisao deste trecho.**
        Toda variante dele carrega o proprio `enabled:hover:bg-surface-sunken`, e
        o `cn` nao descarta esse conflito: o prefixo `enabled:hover:` e outro
        eixo, entao a classe sobrevive ao lado da cor do cliente e **vence no
        hover** — a cor da marca sumia e o rotulo ficava ilegivel no instante em
        que o ponteiro encostava.

        O retorno visual do hover vem por opacidade, que funciona sobre qualquer
        cor que o cliente escolher, sem precisar derivar um tom mais escuro.
      */}
      <button
        type="submit"
        data-preview-highlight={marca('form-submit')}
        disabled={
          !tipo || !temConteudo || longoDemais || faltaTitulo || sending || draft.preparando
        }
        className={cn(
          'inline-flex h-9 w-full shrink-0 items-center justify-center rounded-lg',
          'border border-transparent font-medium text-body transition-opacity',
          'bg-[var(--widget-accent)] text-[var(--widget-ink)]',
          'enabled:hover:opacity-90',
          'disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-fg-disabled',
          contorno('form-submit'),
        )}
      >
        {checking ? 'Conferindo…' : sending ? 'Enviando…' : settings.SubmitLabel}
      </button>
    </form>
  )
}
