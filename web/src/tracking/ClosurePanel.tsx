import { useState } from 'react'
import {
  MAX_REOPEN_COMMENT_LENGTH,
  type PublicClosureViewModel,
  type PublicReportViewModel,
  SATISFACTION_SCALE,
} from '@/contracts'
import { describeError, reportService } from '@/data/publicIndex'
import { Button } from '@/shared/components/Button'
import { formatDateTime } from '@/shared/lib/datetime'
import { publicOutcomeLabel } from '@/shared/lib/publicOutcomes'

/**
 * Como o relato terminou — e a vez de quem o escreveu.
 *
 * **É o bloco que fecha a metáfora.** Todo o resto desta página conta o que o time
 * fez; aqui a pessoa responde. "Concluído" é o time dizendo que acabou, e
 * "confirmado" é ela dizendo que chegou — sem o segundo, o produto vira o que o
 * README denuncia.
 *
 * **O motivo em corpo, o desfecho em etiqueta.** A ordem importa: "Não será feito"
 * sozinho é a recusa sem explicação que este produto existe para não repetir. O
 * que responde a pergunta de quem abriu a página é o texto embaixo.
 *
 * **A pergunta vem antes das duas ações, e não junto delas.** Dois botões soltos
 * fariam a pessoa escolher entre dois rótulos; a pergunta — "e para você, isso
 * resolveu?" — diz o que ela está decidindo antes de mostrar as saídas.
 *
 * **Recusar opinar não é ausência de opinião.** "Prefiro não responder" existe
 * mesmo quando a nota é obrigatória, e fica **fora** da escala: dentro dela viraria
 * a nota mais baixa para quem lê depressa, e a média contaria como insatisfação o
 * que foi só recusa em opinar.
 *
 * **Quem reabre não dá nota.** Está dizendo que não resolveu, e avaliar serviço
 * inacabado mede outra coisa. A nota volta a ser pedida se o relato for encerrado
 * de novo.
 */
export function ClosurePanel({
  fechamento,
  aoResponder,
  protocolo,
  token,
}: {
  fechamento: PublicClosureViewModel
  /** A resposta da API vira o relato na tela: o que ela mostra é o que ficou gravado. */
  aoResponder: (relato: PublicReportViewModel) => void
  protocolo: string
  token: string
}) {
  const { Actions: acoes } = fechamento

  type Modo = 'parado' | 'confirmando' | 'reabrindo'
  const [modo, setModo] = useState<Modo>('parado')
  const [nota, setNota] = useState<number | null>(null)
  const [recusou, setRecusou] = useState(false)
  const [comentario, setComentario] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function enviar(acao: () => Promise<PublicReportViewModel>) {
    if (enviando) return

    setEnviando(true)
    setErro(null)

    try {
      aoResponder(await acao())
    } catch (falha) {
      // O erro fica **aqui dentro**, e não vira a tela inteira: o relato continua
      // na frente da pessoa, e o que falhou foi só a resposta dela.
      setErro(describeError(falha))
    } finally {
      setEnviando(false)
    }
  }

  const textoDaReabertura = comentario.trim()
  const podeReabrir = !acoes.ReopenRequiresComment || textoDaReabertura.length > 0

  return (
    <section className="mt-5 rounded-xl border border-border bg-surface-raised p-5">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="font-semibold text-fg text-lead">Como terminou</h2>
        <span className="rounded-full border border-border px-2 py-px text-caption text-fg-muted">
          {publicOutcomeLabel(fechamento.Outcome)}
        </span>
        <time dateTime={fechamento.ClosedAt} className="text-caption text-fg-muted tabular-nums">
          {formatDateTime(fechamento.ClosedAt)}
        </time>
      </div>

      {/* `whitespace-pre-wrap` pelo mesmo motivo do relato: quem escreveu escreveu
          em linhas, e juntar tudo num parágrafo muda o que foi dito. */}
      <p className="whitespace-pre-wrap break-words text-body text-fg leading-relaxed">
        {fechamento.Reason}
      </p>

      {fechamento.ConfirmedAt && <JaRespondeu fechamento={fechamento} />}

      {modo === 'parado' && (acoes.CanConfirm || acoes.CanReopen) && (
        <div className="mt-5 border-border border-t pt-4">
          <p className="mb-3 text-detail text-fg leading-relaxed">E para você, isso resolveu?</p>

          <div className="flex flex-wrap gap-2">
            {acoes.CanConfirm && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  // Sem nota a pedir, confirmar é um clique só — abrir um painel
                  // vazio para a pessoa clicar de novo seria cerimônia.
                  if (acoes.AsksSatisfaction) setModo('confirmando')
                  else
                    void enviar(() =>
                      reportService.confirmReport({
                        TrackingCode: protocolo,
                        Token: token,
                        Satisfaction: null,
                        SatisfactionDeclined: false,
                      }),
                    )
                }}
                disabled={enviando}
              >
                Sim, resolveu
              </Button>
            )}

            {acoes.CanReopen && (
              <Button size="sm" onClick={() => setModo('reabrindo')} disabled={enviando}>
                Não, ainda não
              </Button>
            )}
          </div>

          {erro && <p className="mt-2.5 text-caption text-error-fg">{erro}</p>}
        </div>
      )}

      {modo === 'confirmando' && (
        <div className="mt-5 border-border border-t pt-4">
          <p className="mb-3 text-detail text-fg leading-relaxed">
            Como foi o atendimento do seu relato?
          </p>

          <fieldset className="mb-3 border-0 p-0">
            <legend className="sr-only">Nota de 1 a 5</legend>

            <div className="flex flex-wrap items-center gap-1.5">
              {SATISFACTION_SCALE.map((valor) => (
                <label
                  key={valor}
                  className={`flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border text-body ${
                    nota === valor
                      ? 'border-accent bg-surface-sunken text-fg'
                      : 'border-border text-fg-muted'
                  }`}
                >
                  <input
                    type="radio"
                    name="nota"
                    value={valor}
                    checked={nota === valor}
                    onChange={() => {
                      setNota(valor)
                      // Escolher a nota desmarca a recusa: a API recusa os dois
                      // juntos, e deixar a tela mandar isso seria falhar depois de
                      // a pessoa já ter respondido.
                      setRecusou(false)
                    }}
                    className="sr-only"
                    aria-label={`Nota ${valor}`}
                  />
                  <span aria-hidden>{acoes.SatisfactionStyle === 'Stars' ? '★' : valor}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {/* **Fora da escala, e não o sexto botão dela.** Dentro, a recusa viraria
              a nota mais baixa para quem lê depressa. Existe mesmo quando a nota é
              obrigatória — sem saída, obrigar vira clique sem pensar. */}
          <label className="mb-4 flex cursor-pointer items-center gap-2 text-detail text-fg-muted">
            <input
              type="checkbox"
              checked={recusou}
              onChange={(evento) => {
                setRecusou(evento.target.checked)
                if (evento.target.checked) setNota(null)
              }}
              className="accent-accent"
            />
            Prefiro não responder
          </label>

          {erro && <p className="mb-2.5 text-caption text-error-fg">{erro}</p>}

          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              size="sm"
              disabled={enviando || (acoes.SatisfactionRequired && nota === null && !recusou)}
              onClick={() =>
                void enviar(() =>
                  reportService.confirmReport({
                    TrackingCode: protocolo,
                    Token: token,
                    Satisfaction: nota,
                    SatisfactionDeclined: recusou,
                  }),
                )
              }
            >
              {enviando ? 'Enviando…' : 'Enviar'}
            </Button>
            <Button variant="quiet" size="sm" disabled={enviando} onClick={() => setModo('parado')}>
              Voltar
            </Button>
          </div>
        </div>
      )}

      {modo === 'reabrindo' && (
        <div className="mt-5 border-border border-t pt-4">
          <label htmlFor="motivo-da-reabertura" className="mb-1.5 block text-detail text-fg">
            O que ainda está acontecendo?
          </label>
          <p className="mb-2 text-caption text-fg-muted leading-relaxed">
            Isso vai para quem cuida do seu relato, e é o que ajuda a chegar mais perto desta vez.
          </p>

          <textarea
            id="motivo-da-reabertura"
            value={comentario}
            onChange={(evento) => setComentario(evento.target.value)}
            maxLength={MAX_REOPEN_COMMENT_LENGTH}
            disabled={enviando}
            rows={3}
            className="mb-3 block w-full resize-y rounded-lg border border-border bg-surface px-2.5 py-2 text-body text-fg leading-relaxed disabled:opacity-60"
          />

          {erro && <p className="mb-2.5 text-caption text-error-fg">{erro}</p>}

          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              size="sm"
              disabled={enviando || !podeReabrir}
              onClick={() =>
                void enviar(() =>
                  reportService.reopenReport({
                    TrackingCode: protocolo,
                    Token: token,
                    Comment: textoDaReabertura.length > 0 ? textoDaReabertura : null,
                  }),
                )
              }
            >
              {enviando ? 'Enviando…' : 'Reabrir o relato'}
            </Button>
            <Button variant="quiet" size="sm" disabled={enviando} onClick={() => setModo('parado')}>
              Voltar
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}

/**
 * O que a pessoa já respondeu.
 *
 * **Os três estados aparecem diferentes**, e não é detalhe: "deu 4", "preferiu não
 * responder" e "não respondeu" são fatos distintos, e mostrá-los iguais aqui
 * ensinaria a lê-los iguais no relatório depois.
 */
function JaRespondeu({ fechamento }: { fechamento: PublicClosureViewModel }) {
  return (
    <div className="mt-4 rounded-lg border border-border bg-surface-sunken px-3.5 py-3">
      <p className="text-detail text-fg leading-relaxed">
        Você confirmou que isso resolveu.{' '}
        {fechamento.Satisfaction !== null && (
          <span className="text-fg-muted">Sua nota: {fechamento.Satisfaction} de 5.</span>
        )}
        {fechamento.SatisfactionDeclined && (
          <span className="text-fg-muted">Você preferiu não dar uma nota.</span>
        )}
      </p>
    </div>
  )
}
