import { useState } from 'react'
import type { ReportSummaryViewModel } from '@/contracts'
import { describeError, projectReportService } from '@/data'
import { DeleteBlockedOriginDialog } from '@/features/reports/DeleteBlockedOriginDialog'
import { Button } from '@/shared/components/Button'
import { toast } from '@/shared/components/toastStore'

/**
 * As duas decisoes sobre os cards de origem bloqueada, na barra do lote: **Manter** (a
 * marca sai) e **Apagar de vez**. So aparecem para quem administra, e so quando a
 * selecao tem card marcado — os outros da selecao ficam de fora, e a mensagem diz
 * quantos.
 *
 * **Uma chamada so, e nao card por card** como o resto da barra: apagar de vez precisa
 * ser tudo ou nada, numa transacao, e sem "Desfazer" — nao ha o que desfazer.
 */
export function BlockedOriginActions({
  projectPublicId,
  cards,
  desligado = false,
  aoTerminar,
}: {
  projectPublicId: string
  /** Os cards marcados no lote; os sem a marca sao ignorados aqui. */
  cards: ReportSummaryViewModel[]
  desligado?: boolean
  /** O lote terminou: a tela rele a lista e a contagem. */
  aoTerminar: () => void
}) {
  const [confirmando, setConfirmando] = useState(false)
  const [mantendo, setMantendo] = useState(false)

  const marcados = cards.filter((card) => card.BlockedOrigin)
  // Sem card marcado, a confirmacao perde o assunto. Deixada ligada, ela abria sozinha
  // na proxima selecao com um card marcado, pedindo para apagar o que ninguem pediu.
  if (marcados.length === 0 && confirmando) setConfirmando(false)
  if (marcados.length === 0) return null

  const dominios = [...new Set(marcados.map((card) => card.Origin ?? ''))]
  const dominio = dominios.length === 1 && dominios[0] ? dominios[0] : null
  const ids = marcados.map((card) => card.PublicId)
  const fora = cards.length - marcados.length

  async function manter() {
    if (mantendo) return
    setMantendo(true)
    try {
      const feito = await projectReportService.keepBlockedOriginReports(projectPublicId, {
        ReportIds: ids,
      })
      toast.done(
        `${feito.Affected === 1 ? '1 card mantido' : `${feito.Affected} cards mantidos`}: a marca de origem bloqueada saiu.${fora > 0 ? ` ${fora === 1 ? '1 card selecionado não estava marcado' : `${fora} cards selecionados não estavam marcados`}.` : ''}`,
      )
      aoTerminar()
    } catch (falha) {
      toast.error(describeError(falha))
    } finally {
      setMantendo(false)
    }
  }

  async function apagar(confirmacao: string) {
    try {
      const feito = await projectReportService.deleteBlockedOriginReports(projectPublicId, {
        ReportIds: ids,
        Confirmation: confirmacao,
      })
      const subtarefas =
        feito.SubtasksDeleted === 0
          ? ''
          : feito.SubtasksDeleted === 1
            ? ', com 1 subtarefa'
            : `, com ${feito.SubtasksDeleted} subtarefas`
      toast.done(
        `${feito.Affected === 1 ? '1 card apagado' : `${feito.Affected} cards apagados`} de vez${subtarefas}.`,
      )
      setConfirmando(false)
      aoTerminar()
    } catch (falha) {
      toast.error(describeError(falha))
    }
  }

  return (
    <>
      <span className="text-caption text-fg-muted">
        {marcados.length === 1
          ? '1 com origem bloqueada:'
          : `${marcados.length} com origem bloqueada:`}
      </span>
      <Button size="sm" disabled={desligado || mantendo} onClick={() => void manter()}>
        {mantendo ? 'Mantendo…' : 'Manter'}
      </Button>
      <Button
        size="sm"
        variant="warn"
        disabled={desligado || mantendo}
        onClick={() => setConfirmando(true)}
      >
        Apagar de vez
      </Button>

      {confirmando && (
        <DeleteBlockedOriginDialog
          count={marcados.length}
          domain={dominio}
          onConfirm={apagar}
          onCancel={() => setConfirmando(false)}
        />
      )}
    </>
  )
}
