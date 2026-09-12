import { useCallback, useEffect, useState } from 'react'
import type { PublicReportViewModel } from '@/contracts'
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
 * **Ela nao promete andamento.** O relato ainda nao tem estado nenhum — estado
 * interno e a etapa 3, e publicar o andamento e a 4 —, entao a frase "quando o
 * time atualizar, aparece aqui" descreveria algo que nunca vai acontecer nesta
 * versao. A pagina diz o que existe: o registro, a data e o texto. A linha do
 * tempo entra aqui quando houver linha do tempo.
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

      <div className="mt-5 rounded-xl border border-border bg-surface-sunken px-5 py-4">
        <p className="text-detail text-fg leading-relaxed">
          Ainda não há andamento para mostrar. Quem cuida deste site já pode ver o seu relato.
        </p>
        <p className="mt-2 text-caption text-fg-muted leading-relaxed">
          Guarde o link desta página: ele é a única forma de voltar aqui. O protocolo sozinho não
          abre o relato.
        </p>
      </div>
    </>
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
