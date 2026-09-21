import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import {
  type CreatedReportViewModel,
  MAX_REPORT_TEXT_LENGTH,
  type ReportType,
  type WidgetSettingsViewModel,
} from '@/contracts'
import { describeError, reportService } from '@/data/publicIndex'
import { accentStyle, resolveTheme, watchSystemTheme } from '@/embed/appearance'
import type { EmbedConfig } from '@/embed/config'
import type { HostConnection } from '@/embed/hostBridge'
import { MyReports } from '@/embed/MyReports'
import { buildReportContext } from '@/embed/reportContext'
import { readReporterCode, writeReporterCode } from '@/embed/reporterCodeStore'

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
}

export function EmbedApp({ settings, config, host = null }: EmbedAppProps) {
  const [type, setType] = useState<ReportType>(settings.DefaultReportType)
  // Dentro de uma pagina, comeca recolhido: quem visita o site do cliente nao
  // pediu um formulario no meio da tela.
  const [open, setOpen] = useState(!host)
  const [text, setText] = useState('')
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
  const [view, setView] = useState<'form' | 'list'>('form')

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

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!trimmed || sending) return

    setSending(true)
    setError(null)

    // A geracao deste envio. Se ela mudar enquanto a resposta nao volta, o
    // quadro foi reiniciado no meio e o resultado nao vale mais.
    const minha = generation.current

    try {
      const criado = await reportService.createReport({
        Key: config.key,
        Type: type,
        Text: trimmed,
        Route: config.route,
        Origin: config.origin,
        AcceptsQuestions: acceptsQuestions,
        // Vazio quando este navegador nunca relatou aqui — e ai a resposta traz um
        // codigo novo. Num projeto de outro modo, mandar codigo seria recusado,
        // entao so vai quando ha um.
        ReporterCode: reporterCode.length > 0 ? reporterCode : undefined,
        Context: buildReportContext(config),
      })

      if (generation.current !== minha) return
      setCreated(criado)

      // **Guarda o que a API confirmou, e nao o que foi mandado.** Ver o comentario
      // do estado: o codigo pode ter mudado do lado de la.
      if (criado.ReporterCode !== null) {
        setReporterCode(criado.ReporterCode)
        writeReporterCode(config.key, criado.ReporterCode)
      }
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
    setError(null)
    setSending(false)
    setType(settings.DefaultReportType)
    setAcceptsQuestions(settings.AcceptsQuestionsDefault)
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
      <section style={style} className="flex h-full flex-col gap-4 bg-surface p-5">
        <div>
          <p className="text-body text-fg leading-normal">{settings.SuccessMessage}</p>
        </div>

        <div className="rounded-lg border border-border bg-surface-raised p-4">
          <p className="mb-1.5 text-detail text-fg-muted">Protocolo</p>
          <p className="font-mono text-fg text-lead tracking-wide">{created.TrackingCode}</p>
        </div>

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
          'min-h-0 flex-1 resize-none rounded-lg border bg-surface-raised px-3 py-2.5',
          'text-body text-fg leading-normal placeholder:text-fg-placeholder',
          error ? 'border-error-border' : 'border-border',
        )}
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
        disabled={!trimmed || sending}
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
