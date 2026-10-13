import { useCallback, useEffect, useState } from 'react'
import type { PublicAttachmentViewModel, PublicReportViewModel } from '@/contracts'
import { isPanelError, reportService } from '@/data/publicIndex'
import { AttachmentProgress, resumoDoFim } from '@/embed/AttachmentPicker'
import { useAttachmentDraft } from '@/embed/useAttachmentDraft'
import { Button } from '@/shared/components/Button'
import { CopyButton } from '@/shared/components/CopyButton'
import { PublicJourney } from '@/shared/components/PublicJourney'
import { ReportAnswers } from '@/shared/components/ReportAnswers'
import { Skeleton } from '@/shared/components/Skeleton'
import { formatDateTime } from '@/shared/lib/datetime'
import { readTrackingLink } from '@/shared/lib/tracking'
import { renderWidgetText } from '@/shared/lib/widgetText'
import { ClosurePanel } from '@/tracking/ClosurePanel'
import { ConversationPanel } from '@/tracking/ConversationPanel'
import { ReopenPanel } from '@/tracking/ReopenPanel'
import { TrackingAttachments } from '@/tracking/TrackingAttachments'
import { useTrackingMedia } from '@/tracking/useTrackingMedia'

/**
 * A pagina que quem relatou abre pelo link.
 *
 * **Agora ela promete andamento, e cumpre.** A jornada vem montada da API, com o
 * passo atual e as datas de cada um, e avanca sozinha do lado de dentro conforme a
 * equipe move o relato — ninguem precisa avisar nada manualmente. Projeto que nao
 * configurou jornada devolve a lista vazia, e ai a pagina volta a dizer que nao ha
 * andamento, em vez de prometer.
 *
 * **Quem anda e a jornada, e nao esta pagina.** O relato e lido uma vez, na
 * montagem: uma aba deixada aberta nao muda sozinha, e o texto da tela diz
 * exatamente isso. Buscar de novo por conta propria seria pior do que nao buscar —
 * cada leitura grava um evento de visualizacao, e a pagina passaria a registrar
 * leituras que ninguem fez. Os arquivos se leem a parte, e se renovam sozinhos
 * porque os enderecos vencem — sem gravar leitura e sem trazer andamento. Avisar
 * quando algo anda e trabalho da notificacao, e nao desta pagina.
 *
 * **Recusado e falhou sao estados diferentes**, e e por isso que o status do erro
 * atravessa a camada de dados. 404 e resposta definitiva: o link nao abre nada, e
 * oferecer "tentar de novo" seria mandar a pessoa repetir o que nao muda. Rede
 * fora e outra coisa — o relato dela continua registrado, e ai tentar de novo e
 * exatamente o que resolve.
 */

type Estado =
  | { tipo: 'carregando' }
  // O protocolo e o token viajam junto do relato de proposito: confirmar e reabrir
  // precisam deles, e reler o endereco de dentro do bloco criaria uma segunda fonte
  // para a mesma verdade — que passariam a discordar no dia em que a pagina navegar.
  // `pessoal` e a chave e o codigo de quem abriu pela lista pessoal: e com eles que
  // a pagina le os arquivos, ja que ali nao ha token. Nulo quando veio pelo link.
  | {
      tipo: 'aberto'
      relato: PublicReportViewModel
      code: string
      token: string
      pessoal: { key: string; reporterCode: string } | null
    }
  | { tipo: 'recusado' }
  | { tipo: 'falhou' }

export function TrackingPage() {
  const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' })

  const abrir = useCallback(async () => {
    const { code, token, key, reporterCode } = readTrackingLink(
      window.location.search,
      window.location.hash,
    )

    // **Duas credenciais levam a esta pagina, e elas nao valem o mesmo.** O token
    // veio no link que a pessoa recebeu ao relatar, e da poder sobre o relato. O
    // codigo pessoal veio da lista dela e prova que o relato e dela — mas confirmar,
    // reabrir e responder so aceitam o token do link, e a API ignora
    // TrackingCodeCanAct ate elas aceitarem o codigo. Quem decide isso e a API;
    // aqui so muda por onde se pergunta.
    const peloToken = token.length > 0
    const peloCodigo = key.length > 0 && reporterCode.length > 0

    // Link pela metade nao vai a rede: a resposta seria a mesma recusa, e pedir
    // ao servidor para confirmar o que ja se sabe atrasa a tela sem ganhar nada.
    if (code.length === 0 || (!peloToken && !peloCodigo)) {
      setEstado({ tipo: 'recusado' })
      return
    }

    setEstado({ tipo: 'carregando' })

    try {
      const relato = peloToken
        ? await reportService.openReportTracking({ TrackingCode: code, Token: token })
        : await reportService.openByReporterCode({
            Key: key,
            Code: reporterCode,
            TrackingCode: code,
          })

      setEstado({
        tipo: 'aberto',
        relato,
        code,
        token,
        pessoal: peloToken ? null : { key, reporterCode },
      })
    } catch (falha) {
      setEstado({ tipo: isPanelError(falha) && falha.status === 404 ? 'recusado' : 'falhou' })
    }
  }, [])

  useEffect(() => {
    void abrir()
  }, [abrir])

  return (
    <main className="mx-auto w-full max-w-160 px-5 py-10 lg:py-14">
      {estado.tipo === 'carregando' && <Carregando />}
      {estado.tipo === 'aberto' && (
        <Relato
          relato={estado.relato}
          code={estado.code}
          token={estado.token}
          pessoal={estado.pessoal}
          aoResponder={(novo) => setEstado({ ...estado, relato: novo })}
        />
      )}
      {estado.tipo === 'recusado' && <Recusado />}
      {estado.tipo === 'falhou' && <Falhou onRetry={() => void abrir()} />}
    </main>
  )
}

function Relato({
  relato,
  code,
  token,
  pessoal,
  aoResponder,
}: {
  relato: PublicReportViewModel
  code: string
  token: string
  pessoal: { key: string; reporterCode: string } | null
  aoResponder: (relato: PublicReportViewModel) => void
}) {
  // Os arquivos pela porta por onde a pagina entrou: o token do link, ou a chave e
  // o codigo da lista pessoal. Anexar, so pelo link.
  const midia = useTrackingMedia(code, token, pessoal)
  const credenciais = { trackingCode: code, token }

  /**
   * Os arquivos da reabertura. **Moram aqui, e nao no bloco do encerramento**:
   * reaberto, o relato deixa de ter fechamento e aquele bloco sai da tela — a lista
   * sairia junto, antes de subir.
   */
  const reabertura = useAttachmentDraft(midia.paraReabertura, { envio: 'reopen' })
  const [subindoReabertura, setSubindoReabertura] = useState(false)
  /** O fim do envio da reabertura, para o leitor de tela: a lista sai de cena quando tudo foi. */
  const [avisoDoFim, setAvisoDoFim] = useState('')

  /**
   * A reabertura dos arquivos na tela levou motivo. Sem motivo, "o seu texto está
   * salvo" seria falso. Guardado quando o envio começa: uma reabertura seguinte
   * mudaria a última da lista enquanto os arquivos na tela ainda são da anterior.
   */
  const [reabriuComTexto, setReabriuComTexto] = useState(true)

  /**
   * Fecha o envio quando ele termina. O que falhou fica, com "tentar de novo"; o
   * recusado continua dizendo que nao foi, sem prender a proxima reabertura.
   */
  function conferirReabertura() {
    midia.recarregar()
    const fim = resumoDoFim(reabertura.atual())
    if (reabertura.fechar()) {
      setSubindoReabertura(false)
      if (fim) setAvisoDoFim(fim)
    }
  }

  function aoReabrir(novo: PublicReportViewModel) {
    aoResponder(novo)

    // **Depois da reabertura gravada, e so entao.** Com um envio anterior ainda na
    // tela, nada sobe: a lista e a dele, e manda-la de novo duplicaria o que ja foi.
    if (subindoReabertura) return

    // Sem arquivo, o aviso de um recusado da reabertura anterior sai: ele falava
    // de outra reabertura.
    if (reabertura.atual().length === 0) {
      reabertura.limpar()
      return
    }

    setReabriuComTexto(novo.Reopenings?.at(-1)?.Comment != null)
    setAvisoDoFim('')
    setSubindoReabertura(true)
    void reabertura.enviarAnexos(credenciais, 0).then(conferirReabertura)
  }

  // Cada arquivo no lugar dele: os da criacao embaixo do relato, os de uma resposta
  // embaixo da resposta, os de uma reabertura junto do motivo dela. **O que nao
  // acha o seu lugar cai na galeria do relato**, em vez de sumir — fala publica e
  // reabertura nao se apagam hoje, mas um arquivo que desaparece em silencio e o
  // tipo de erro que ninguem percebe.
  const falas = new Set(relato.Conversation.map((fala) => fala.PublicId))
  // Vazia quando a API ainda nao manda a lista: a pagina publicada antes da API nova,
  // ou a API desfeita pela migracao. Sem isto, a pagina inteira quebraria para quem so
  // queria confirmar ou responder.
  const todasAsReaberturas = relato.Reopenings ?? []
  const reaberturas = new Set(todasAsReaberturas.map((item) => item.PublicId))
  const daCriacao: PublicAttachmentViewModel[] = []
  const porFala = new Map<string, PublicAttachmentViewModel[]>()
  const porReabertura = new Map<string, PublicAttachmentViewModel[]>()

  // Os que nao acharam o seu lugar vao **depois** dos da criacao, e nao no meio deles:
  // a lista vem na ordem da montagem de cada envio — a posicao 0 da reabertura ao lado
  // da 0 da criacao —, e intercalar desmontaria a da criacao.
  const semLugar: PublicAttachmentViewModel[] = []

  for (const anexo of midia.anexos) {
    if (anexo.ReplyPublicId && falas.has(anexo.ReplyPublicId)) {
      juntar(porFala, anexo.ReplyPublicId, anexo)
    } else if (anexo.ReopenPublicId && reaberturas.has(anexo.ReopenPublicId)) {
      juntar(porReabertura, anexo.ReopenPublicId, anexo)
    } else if (anexo.ReplyPublicId || anexo.ReopenPublicId) {
      semLugar.push(anexo)
    } else {
      daCriacao.push(anexo)
    }
  }
  daCriacao.push(...semLugar)

  return (
    <>
      <h1 className="mb-1.5 font-semibold text-screen text-fg tracking-tight">Seu relato</h1>
      {/* A frase e do projeto, escrita na tela da ferramenta; as variaveis sao trocadas
          aqui, que e onde a etapa e o resto existem. Texto puro. */}
      <p className="mb-7 text-body text-fg-muted">
        {renderWidgetText(relato.TrackingIntro, {
          primeiroNome: relato.ReporterFirstName,
          protocolo: relato.TrackingCode,
          tipo: relato.TypeName,
          projeto: relato.ProjectName,
          etapa: relato.Journey.find((passo) => passo.IsCurrent)?.Label,
        })}
      </p>

      <section className="rounded-xl border border-border bg-surface-raised p-5">
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="min-w-0">
            <div className="mb-1 text-caption text-fg-muted">Protocolo</div>
            <p className="font-mono text-fg text-lead tracking-wide">{relato.TrackingCode}</p>
          </div>
          <div className="ml-auto">
            <CopyButton value={relato.TrackingCode} label="Copiar protocolo" size="sm" />
          </div>
        </div>

        <dl className="mb-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-detail">
          <dt className="text-fg-muted">Tipo</dt>
          <dd className="text-fg">{relato.TypeName}</dd>
          <dt className="text-fg-muted">Recebido em</dt>
          <dd className="text-fg">{formatDateTime(relato.CreatedAt)}</dd>
        </dl>

        <div className="mb-1.5 text-caption text-fg-muted">O que você escreveu</div>
        {/* O titulo que ela mesma deu, quando deu. **Nunca o do time**: o titulo
            reescrito no painel e interno, e a API nem o manda para ca. */}
        {relato.Title && (
          <p className="mb-1.5 break-words font-semibold text-fg text-lead">{relato.Title}</p>
        )}
        {/* Com perguntas, cada resposta embaixo da pergunta como ela estava quando a
            pessoa enviou; sem perguntas, o texto como ela escreveu. */}
        <ReportAnswers answers={relato.Answers} text={relato.Text} />

        {/* So os da criacao: os que vieram numa resposta aparecem na conversa,
            logo abaixo dela. */}
        <TrackingAttachments anexos={daCriacao} onExpired={midia.recarregar} />
      </section>

      {/* Antes do andamento de propósito: quando há pergunta aberta, ela é a
          coisa mais acionável da página, e a jornada é contexto. */}
      <ConversationPanel
        relato={relato}
        protocolo={code}
        token={token}
        aoResponder={aoResponder}
        media={midia.paraResposta}
        anexosPorFala={porFala}
        aoAnexar={midia.recarregar}
      />

      <PublicJourney
        className="mt-5"
        stages={relato.Journey.map((passo) => ({ ...passo, id: passo.Label }))}
        currentId={relato.Journey.find((passo) => passo.IsCurrent)?.Label ?? null}
      />

      {/* Antes do encerramento de propósito: as reaberturas já aconteceram, e o
          fechamento que está valendo, quando há um, é o fim mais recente. */}
      {/* Sempre montado, e vazio ate o fim: e ele que diz "enviado" quando a lista da
          reabertura sai de cena. */}
      <p role="status" className="sr-only">
        {avisoDoFim}
      </p>

      <ReopenPanel
        reaberturas={todasAsReaberturas}
        anexosPorReabertura={porReabertura}
        aoExpirar={midia.recarregar}
        progresso={
          subindoReabertura || reabertura.naoEnviados.length > 0 ? (
            <AttachmentProgress
              anexos={subindoReabertura ? reabertura.anexos : reabertura.naoEnviados}
              savedNote={
                reabriuComTexto
                  ? 'O relato foi reaberto e o seu texto está salvo.'
                  : 'O relato foi reaberto.'
              }
              onRetry={(anexo) => {
                setAvisoDoFim('')
                void reabertura.enviarAnexo(credenciais, anexo, 0).then(conferirReabertura)
              }}
              onDiscard={(anexo) => {
                reabertura.remover(anexo.id)
                conferirReabertura()
              }}
            />
          ) : null
        }
      />

      {relato.Closure && (
        <ClosurePanel
          fechamento={relato.Closure}
          protocolo={code}
          token={token}
          aoResponder={aoResponder}
          aoReabrir={aoReabrir}
          // Enquanto o envio de uma reabertura anterior ainda está na tela, a nova
          // vai só com texto: a lista é uma só, e ela ainda é daquela.
          anexar={
            midia.paraReabertura && !subindoReabertura
              ? { midia: midia.paraReabertura, rascunho: reabertura }
              : null
          }
        />
      )}

      <p className="mt-5 px-1 text-caption text-fg-muted leading-relaxed">
        Guarde o link desta página: ele é a única forma de voltar aqui. O protocolo sozinho não abre
        o relato.
      </p>
    </>
  )
}

/** Poe o anexo na lista da sua chave. */
function juntar(
  mapa: Map<string, PublicAttachmentViewModel[]>,
  chave: string,
  anexo: PublicAttachmentViewModel,
) {
  mapa.set(chave, [...(mapa.get(chave) ?? []), anexo])
}

function Recusado() {
  return (
    <>
      <h1 className="mb-1.5 font-semibold text-screen text-fg tracking-tight">
        Este link não abre nenhum relato
      </h1>
      <p className="mb-5 text-body text-fg-muted leading-relaxed">
        Ele pode ter sido cortado na hora de copiar. Confira se você copiou o endereço inteiro, até
        o último caractere.
      </p>
      <p className="text-detail text-fg-muted leading-relaxed">
        Se você tem só o protocolo, ele não abre esta página — o protocolo serve para você dizer de
        qual relato está falando, e quem abre é o link.
      </p>
    </>
  )
}

function Falhou({ onRetry }: { onRetry: () => void }) {
  return (
    <>
      <h1 className="mb-1.5 font-semibold text-screen text-fg tracking-tight">
        Não deu para abrir o seu relato agora
      </h1>
      <p className="mb-5 text-body text-fg-muted leading-relaxed">
        A falha foi ao consultar, e não no relato: ele continua registrado como estava.
      </p>
      <Button onClick={onRetry}>Tentar de novo</Button>
    </>
  )
}

function Carregando() {
  return (
    <>
      <Skeleton className="mb-3 h-6 w-40" />
      <Skeleton className="mb-8 h-3 w-64" />
      <div className="rounded-xl border border-border bg-surface-raised p-5">
        <Skeleton className="mb-4 h-5 w-44" />
        <Skeleton className="mb-2 h-3 w-32" />
        <Skeleton className="mb-5 h-3 w-40" />
        <Skeleton className="mb-2 h-3 w-full" />
        <Skeleton className="h-3 w-4/5" />
      </div>
    </>
  )
}
