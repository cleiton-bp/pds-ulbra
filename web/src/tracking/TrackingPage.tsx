import { useCallback, useEffect, useState } from 'react'
import type { PublicReportViewModel, PublicStageViewModel } from '@/contracts'
import { isPanelError, reportService } from '@/data/publicIndex'
import { Button } from '@/shared/components/Button'
import { CopyButton } from '@/shared/components/CopyButton'
import { Skeleton } from '@/shared/components/Skeleton'
import { formatDateTime } from '@/shared/lib/datetime'
import { reporterTypeLabel } from '@/shared/lib/reportTypes'
import { readTrackingLink } from '@/shared/lib/tracking'

/**
 * A pagina que quem relatou abre pelo link.
 *
 * **Agora ela promete andamento, e cumpre.** A jornada vem montada da API, com o
 * passo atual e as datas de cada um, e avanca sozinha do lado de dentro conforme a
 * equipe move o relato — ninguem precisa avisar nada manualmente. Projeto que nao
 * configurou jornada devolve a lista vazia, e ai a pagina volta a dizer que nao ha
 * andamento, em vez de prometer.
 *
 * **Quem anda e a jornada, e nao esta pagina.** Ha um `fetch` so, na montagem: uma
 * aba deixada aberta nao muda sozinha, e o texto da tela diz exatamente isso. Buscar
 * de novo por conta propria seria pior do que nao buscar — cada leitura grava um
 * evento de visualizacao, e a pagina passaria a registrar leituras que ninguem fez.
 * Avisar quando algo anda e trabalho da notificacao, que e outra etapa.
 *
 * **Recusado e falhou sao estados diferentes**, e e por isso que o status do erro
 * atravessa a camada de dados. 404 e resposta definitiva: o link nao abre nada, e
 * oferecer "tentar de novo" seria mandar a pessoa repetir o que nao muda. Rede
 * fora e outra coisa — o relato dela continua registrado, e ai tentar de novo e
 * exatamente o que resolve.
 */

type Estado =
  | { tipo: 'carregando' }
  | { tipo: 'aberto'; relato: PublicReportViewModel }
  | { tipo: 'recusado' }
  | { tipo: 'falhou' }

export function TrackingPage() {
  const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' })

  const abrir = useCallback(async () => {
    const { code, token } = readTrackingLink(window.location.search, window.location.hash)

    // Link pela metade nao vai a rede: a resposta seria a mesma recusa, e pedir
    // ao servidor para confirmar o que ja se sabe atrasa a tela sem ganhar nada.
    if (code.length === 0 || token.length === 0) {
      setEstado({ tipo: 'recusado' })
      return
    }

    setEstado({ tipo: 'carregando' })

    try {
      const relato = await reportService.openReportTracking({ TrackingCode: code, Token: token })
      setEstado({ tipo: 'aberto', relato })
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
      {estado.tipo === 'aberto' && <Relato relato={estado.relato} />}
      {estado.tipo === 'recusado' && <Recusado />}
      {estado.tipo === 'falhou' && <Falhou onRetry={() => void abrir()} />}
    </main>
  )
}

function Relato({ relato }: { relato: PublicReportViewModel }) {
  return (
    <>
      <h1 className="mb-1.5 font-semibold text-screen text-fg tracking-tight">Seu relato</h1>
      <p className="mb-7 text-body text-fg-muted">Este é o registro do que você enviou.</p>

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
          <dd className="text-fg">{reporterTypeLabel(relato.Type)}</dd>
          <dt className="text-fg-muted">Recebido em</dt>
          <dd className="text-fg">{formatDateTime(relato.CreatedAt)}</dd>
        </dl>

        <div className="mb-1.5 text-caption text-fg-muted">O que você escreveu</div>
        {/* `whitespace-pre-wrap`: a pessoa escreveu em linhas, e juntar tudo num
            paragrafo so muda o que ela disse. */}
        <p className="whitespace-pre-wrap break-words text-body text-fg leading-relaxed">
          {relato.Text}
        </p>
      </section>

      <Andamento jornada={relato.Journey} />

      <p className="mt-5 px-1 text-caption text-fg-muted leading-relaxed">
        Guarde o link desta página: ele é a única forma de voltar aqui. O protocolo sozinho não abre
        o relato.
      </p>
    </>
  )
}

/**
 * Por onde o relato passou, onde ele está, e o que vem depois.
 *
 * **Os três passos que a pessoa quer saber, em uma leitura.** Uma palavra dizendo
 * só onde ele está responderia um terço da pergunta e calaria o resto.
 *
 * **O que já passou vem das datas, e não da posição.** Um relato pode pular etapas,
 * e pintar como percorrido tudo que está antes contaria uma história que não
 * aconteceu. Passo sem data é passo por onde ele não passou — mesmo estando antes
 * do atual.
 *
 * **Jornada vazia é projeto sem jornada**, e a tela diz isso em vez de prometer
 * movimento que não vai acontecer.
 */
function Andamento({ jornada }: { jornada: PublicStageViewModel[] }) {
  if (jornada.length === 0) {
    return (
      <div className="mt-5 rounded-xl border border-border bg-surface-sunken px-5 py-4">
        <p className="text-detail text-fg leading-relaxed">
          Ainda não há andamento para mostrar. Quem cuida deste site já pode ver o seu relato.
        </p>
      </div>
    )
  }

  const atual = jornada.find((passo) => passo.IsCurrent) ?? null

  return (
    <section className="mt-5 rounded-xl border border-border bg-surface-raised p-5">
      <h2 className="mb-1 font-semibold text-fg text-lead">Andamento</h2>
      {/* **A frase promete o que a página faz, e nada além.**

          Ela dizia "esta página se atualiza sozinha conforme a equipe trabalha", e
          isso era falso para quem deixasse a aba aberta: há um único `fetch`, na
          montagem, e nenhum intervalo, foco de aba ou socket. Quem lesse a frase e
          esperasse ficaria esperando para sempre.

          E buscar de novo sozinho **não** é a correção: cada leitura grava um
          evento `ReportViewed`, então uma página que se atualiza a cada minuto
          encheria o histórico de leituras que ninguém fez. Avisar quando algo anda
          é trabalho da notificação, que é outra etapa.

          Então o que fica é o que é verdade: voltar aqui mostra onde o relato está,
          e ninguém precisa ser cobrado para isso acontecer. */}
      <p className="mb-5 text-detail text-fg-muted leading-relaxed">
        {atual === null
          ? 'O seu relato ainda não entrou nesta jornada. Ele está registrado e aguardando.'
          : 'Sempre que você abrir esta página, ela mostra onde o seu relato está. Não é preciso avisar ninguém.'}
      </p>

      <ol className="flex flex-col">
        {jornada.map((passo, index) => (
          <li key={passo.Label} className="flex gap-3">
            {/* A coluna do marcador e da linha. A linha para no penúltimo, senão
                ela desce para fora do último passo e a jornada parece continuar. */}
            <div className="flex flex-none flex-col items-center">
              <Marcador passo={passo} />
              {index < jornada.length - 1 && (
                <div
                  className={`w-px flex-1 ${passo.ReachedAt === null ? 'bg-border' : 'bg-fg-muted'}`}
                />
              )}
            </div>

            <div className={`min-w-0 flex-1 ${index < jornada.length - 1 ? 'pb-5' : ''}`}>
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span
                  className={
                    passo.IsCurrent ? 'font-medium text-body text-fg' : 'text-body text-fg-muted'
                  }
                >
                  {passo.Label}
                </span>
                {passo.IsCurrent && (
                  <span className="rounded-full border border-border px-2 py-px text-caption text-fg-muted">
                    agora
                  </span>
                )}
                {passo.ReachedAt !== null && (
                  <span className="text-caption text-fg-muted tabular-nums">
                    {formatDateTime(passo.ReachedAt)}
                  </span>
                )}
              </div>

              <p className="mt-0.5 text-detail text-fg-muted leading-relaxed">
                {passo.Description}
              </p>

              {/* "O que vem depois" só no passo atual: nos outros ele é ruído —
                  no que já passou, o depois já aconteceu; no que não chegou, a
                  frase do próprio passo já diz o que vai acontecer. */}
              {passo.IsCurrent && passo.NextStep !== null && (
                <p className="mt-1.5 text-caption text-fg-muted leading-relaxed">
                  {passo.NextStep}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

/**
 * O ponto de cada passo: cheio no que já foi percorrido, anel no passo atual, vazio
 * no que ainda não chegou.
 *
 * **A forma carrega a informação junto com a cor**, porque cor sozinha não é lida
 * por quem não a distingue — e esta é a tela que qualquer pessoa abre do telefone.
 *
 * **E os três estados têm nome**, em vez de o ponto ser decorativo. Sem isso, quem
 * usa leitor de tela teria só a presença ou ausência da data para inferir o que já
 * aconteceu, o que é adivinhação e não leitura. São três palavras numa lista de
 * cinco itens: barato.
 */
function Marcador({ passo }: { passo: PublicStageViewModel }) {
  if (passo.IsCurrent) {
    return (
      <span
        role="img"
        aria-label="Passo atual"
        className="mt-1 size-2.5 flex-none rounded-full border-2 border-fg bg-surface-raised"
      />
    )
  }

  if (passo.ReachedAt === null) {
    return (
      <span
        role="img"
        aria-label="Ainda não chegou aqui"
        className="mt-1 size-2.5 flex-none rounded-full border border-border"
      />
    )
  }

  return (
    <span
      role="img"
      aria-label="Já passou por aqui"
      className="mt-1 size-2.5 flex-none rounded-full bg-fg-muted"
    />
  )
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
