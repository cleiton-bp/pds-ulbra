import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import {
  type CreatedReportViewModel,
  MAX_CARD_TITLE_LENGTH,
  MAX_REPORT_TEXT_LENGTH,
  MAX_REPORTER_NAME_LENGTH,
  type PublicMediaSettingsViewModel,
  type ReportType,
  type WidgetSettingsViewModel,
} from '@/contracts'
import { describeError, reportService } from '@/data/publicIndex'
import { AttachmentEditor } from '@/embed/AttachmentEditor'
import { ATTACH_BUTTON_CLASS, AttachmentPicker, AttachmentProgress } from '@/embed/AttachmentPicker'
import { accentStyle, resolveTheme, watchSystemTheme } from '@/embed/appearance'
import { hasRoom } from '@/embed/attachments'
import type { EmbedConfig } from '@/embed/config'
import type { HostConnection } from '@/embed/hostBridge'
import { MyReports } from '@/embed/MyReports'
import { PublicList } from '@/embed/PublicList'
import { buildReportContext } from '@/embed/reportContext'
import { readReporterCode, writeReporterCode } from '@/embed/reporterCodeStore'
import { useAttachmentDraft } from '@/embed/useAttachmentDraft'

import { Button } from '@/shared/components/Button'
import { CopyButton } from '@/shared/components/CopyButton'
import { cn } from '@/shared/lib/cn'
import { REPORT_TYPES } from '@/shared/lib/reportTypes'
import { buildTrackingLink } from '@/shared/lib/tracking'

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
}

export function EmbedApp({ settings, config, host = null, media = null }: EmbedAppProps) {
  const [type, setType] = useState<ReportType>(settings.DefaultReportType)
  // Dentro de uma pagina, comeca recolhido: quem visita o site do cliente nao
  // pediu um formulario no meio da tela.
  const [open, setOpen] = useState(!host)
  const [text, setText] = useState('')
  // A resposta a "em poucas palavras, o que aconteceu?". Vira o titulo do card para
  // o time, e e o unico titulo que volta para quem relatou.
  const [title, setTitle] = useState('')
  // **A escolha e dela, e o projeto so decide como a caixa comeca.** Quem relatou
  // um defeito as pressas pode nao querer virar parte da investigacao — e prometer
  // resposta a quem nao vai responder deixa o relato pendurado esperando.
  const [acceptsQuestions, setAcceptsQuestions] = useState(settings.AcceptsQuestionsDefault)
  const [sending, setSending] = useState(false)
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

  const [reporterName, setReporterName] = useState('')
  const [signs, setSigns] = useState(false)

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
  const trimmed = text.trim()
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
    // Arquivo ainda entrando na lista nao subiria: o envio leva a lista como ela
    // esta. Ver `preparando` em useAttachmentDraft.
    // Nem com o editor aberto: a imagem que esta nele ainda nao e a que vai.
    if (!trimmed || faltaTitulo || sending || draft.preparando || draft.edicao) return

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
      const criado = await reportService.createReport({
        Key: config.key,
        Type: type,
        // Escondida, a pergunta nao foi feita: nada vai, nem o que ficou de uma
        // configuracao anterior.
        Title: perguntaTitulo && tituloAparado.length > 0 ? tituloAparado : null,
        Text: trimmed,
        Route: config.route,
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
        Context: buildReportContext(config),
      })

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
    setText('')
    setTitle('')
    setError(null)
    setSending(false)
    setType(settings.DefaultReportType)
    setAcceptsQuestions(settings.AcceptsQuestionsDefault)
    setReporterName('')
    setSigns(false)

    draft.limpar()
  }

  function expand() {
    setOpen(true)
    host?.expand()
  }

  function collapse() {
    setOpen(false)
    host?.collapse()
    // Limpa ao recolher, e nao ao abrir: assim quem reabre por engano nao perde
    // nada, e quem volta depois encontra o formulario limpo.
    reset()
  }

  // Recolhido o documento inteiro e o gatilho: o `iframe` tem o tamanho dele, e
  // e por isso que o resto da pagina do cliente continua clicavel em volta.
  if (!open) {
    return (
      <div style={style} className="flex h-full items-center justify-center p-1">
        <button
          type="button"
          onClick={expand}
          className={cn(
            'h-10 w-full rounded-full bg-[var(--widget-accent)] px-4',
            'font-medium text-[var(--widget-ink)] text-body',
          )}
        >
          {settings.LauncherLabel}
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
          code={reporterCode}
          onCodeChange={(codigo) => {
            setReporterCode(codigo)
            writeReporterCode(config.key, codigo)
          }}
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
        <div>
          <p className="text-body text-fg leading-normal">{settings.SuccessMessage}</p>
        </div>

        <div className="rounded-lg border border-border bg-surface-raised p-4">
          <p className="mb-1.5 text-detail text-fg-muted">Protocolo</p>
          <p className="font-mono text-fg text-lead tracking-wide">{created.TrackingCode}</p>
        </div>

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

  return (
    <form
      style={style}
      onSubmit={submit}
      // No formulario inteiro, e nao so na caixa de texto: quem tirou o print cola
      // com o foco onde estiver. Durante o envio a lista esta travada.
      onPaste={sending ? undefined : colar}
      // `overflow-y-auto` e a ultima linha de defesa: com o quadro baixo demais
      // para o conteudo minimo, rola em vez de aparar.
      className="flex h-full flex-col gap-4 overflow-y-auto bg-surface p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <h1 className="font-semibold text-fg text-lead tracking-tight">{settings.Title}</h1>
        {host && (
          <Button variant="ghost" size="sm" onClick={collapse} aria-label="Fechar">
            Fechar
          </Button>
        )}
      </div>

      {/* **So neste modo, e nao so quando ha codigo guardado.** Quem trocou de
          navegador nao tem nada guardado e e justamente quem mais precisa da
          entrada — a lista pede o codigo ali dentro. */}
      {settings.IdentityMode === 'PersonalCode' && (
        <button
          type="button"
          onClick={() => setView('list')}
          className="-mt-1 self-start font-medium text-detail text-fg underline underline-offset-4"
        >
          Ver os meus relatos
        </button>
      )}

      {ehPublico && (
        <button
          type="button"
          onClick={() => setView('public')}
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
          <strong className="font-medium text-fg">Este relato pode virar público.</strong> Alguém da
          equipe lê antes; se for liberado, qualquer pessoa poderá ler o que você escrever aqui.
          {settings.Visibility === 'PublicIdentified'
            ? ' O seu nome só aparece se você marcar abaixo.'
            : ' O seu nome nunca aparece.'}
        </p>
      )}

      {settings.ShowsTypeField && (
        <fieldset className="flex flex-wrap gap-2">
          <legend className="mb-1.5 text-detail text-fg-muted">O que é</legend>

          {REPORT_TYPES.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={type === option.value}
              onClick={() => setType(option.value)}
              className={cn(
                'h-8 rounded-lg border px-3 text-detail transition-colors',
                type === option.value
                  ? 'border-transparent bg-[var(--widget-accent)] text-[var(--widget-ink)]'
                  : 'border-border bg-surface text-fg hover:bg-surface-sunken',
              )}
            >
              {option.label}
            </button>
          ))}
        </fieldset>
      )}

      {/* Antes do texto: e a pergunta curta, e quem responde ja pensou no que vai
          contar. Numa linha so — titulo nao e paragrafo. */}
      {perguntaTitulo && (
        <label className="flex flex-col gap-1.5">
          <span className="text-detail text-fg-muted">
            Em poucas palavras, o que aconteceu?
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
            placeholder="O botão de pagar não responde"
            className="h-9 rounded-lg border border-border bg-surface-raised px-3 text-body text-fg placeholder:text-fg-placeholder"
          />
        </label>
      )}

      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={settings.Placeholder}
        maxLength={MAX_REPORT_TEXT_LENGTH}
        aria-label={settings.Title}
        aria-invalid={error ? true : undefined}
        className={cn(
          // `min-h-0` e o que permite ENCOLHER: sem ele o textarea trava em
          // `min-h-28` e empurra o botao para fora de um documento que nao
          // rola. Em janela de 320px o carregador entrega 280px de quadro, e o
          // "Enviar" ficava inalcancavel com o relato ja escrito.
          //
          // **Com imagem na lista, o piso volta.** As imagens ficam logo abaixo do
          // texto, e passam da altura do quadro: sem piso, o texto encolheria ate
          // sumir. Com ele, o formulario rola, e o "Enviar" continua alcancavel.
          anexos.length > 0 ? 'min-h-24' : 'min-h-0',
          'flex-1 resize-none rounded-lg border bg-surface-raised px-3 py-2.5',
          'text-body text-fg leading-normal placeholder:text-fg-placeholder',
          error ? 'border-error-border' : 'border-border',
        )}
      />

      {media && (
        <AttachmentPicker
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
        <div className="flex flex-col gap-2">
          <label htmlFor="pds-nome" className="text-detail text-fg-muted">
            Como podemos te chamar <span className="text-fg-placeholder">(opcional)</span>
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
        disabled={!trimmed || faltaTitulo || sending || draft.preparando}
        className={cn(
          'inline-flex h-9 w-full shrink-0 items-center justify-center rounded-lg',
          'border border-transparent font-medium text-body transition-opacity',
          'bg-[var(--widget-accent)] text-[var(--widget-ink)]',
          'enabled:hover:opacity-90',
          'disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-fg-disabled',
        )}
      >
        {sending ? 'Enviando…' : 'Enviar'}
      </button>
    </form>
  )
}
