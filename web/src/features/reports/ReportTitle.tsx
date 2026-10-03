import { useState } from 'react'
import {
  MAX_CARD_TITLE_LENGTH,
  type ReportDetailViewModel,
  type ReportSummaryViewModel,
} from '@/contracts'
import { describeError, projectReportService } from '@/data'
import { Button } from '@/shared/components/Button'
import { TextField } from '@/shared/components/TextField'

/**
 * O titulo do relato, como o time o le — e o lugar de reescrever.
 *
 * **Dois titulos, e so um e de quem relatou.** O que a pessoa escreveu na ferramenta
 * (`ReporterTitle`) nunca muda, e e o unico que volta para ela. O do time (`Title`)
 * e interno: reescrever e dar ao card um nome que o time reconhece, sem mexer no que
 * ela escreveu. Reescrito, a tela mostra o dela embaixo, e um clique volta a ele.
 *
 * Sem titulo nenhum, o card mostra o comeco do texto na lista — e aqui o texto
 * inteiro ja esta logo abaixo.
 */
export function ReportTitle({
  projectPublicId,
  reportPublicId,
  card,
  aoMudar,
}: {
  projectPublicId: string
  reportPublicId: string
  card: ReportSummaryViewModel
  aoMudar: (card: ReportDetailViewModel) => void
}) {
  const arquivado = card.ArchivedAt !== null
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const titulo = card.Title ?? card.ReporterTitle
  const reescrito = card.Title !== null

  async function gravar(novo: string | null) {
    if (salvando) return
    setSalvando(true)
    setErro(null)

    try {
      aoMudar(await projectReportService.setTitle(projectPublicId, reportPublicId, { Title: novo }))
      setEditando(false)
    } catch (falha) {
      // O texto continua no campo: quem escreveu tenta de novo sem reescrever.
      setErro(describeError(falha))
    } finally {
      setSalvando(false)
    }
  }

  if (editando) {
    return (
      <div className="flex flex-col gap-2">
        <TextField
          label="Título do time"
          value={texto}
          onChange={(valor) => {
            setTexto(valor)
            if (erro) setErro(null)
          }}
          onSubmit={() => void gravar(texto)}
          maxLength={MAX_CARD_TITLE_LENGTH}
          disabled={salvando}
          autoFocus
          error={erro}
          hint={
            card.ReporterTitle
              ? `Quem relatou escreveu “${card.ReporterTitle}” — e continua vendo só isso.`
              : 'Quem relatou não vê este título.'
          }
        />
        <div className="flex gap-2">
          <Button
            variant="primary"
            size="sm"
            disabled={salvando}
            onClick={() => void gravar(texto)}
          >
            {salvando ? 'Salvando…' : 'Salvar'}
          </Button>
          <Button variant="quiet" size="sm" disabled={salvando} onClick={() => setEditando(false)}>
            Cancelar
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <h3
          className={
            titulo
              ? 'break-words font-semibold text-fg text-lead'
              : 'text-body text-fg-muted italic'
          }
        >
          {titulo ?? 'Sem título'}
        </h3>
        {!arquivado && (
          <Button
            variant="quiet"
            size="sm"
            onClick={() => {
              setTexto(titulo ?? '')
              setErro(null)
              setEditando(true)
            }}
          >
            {titulo ? 'Reescrever' : 'Dar um título'}
          </Button>
        )}
      </div>

      {reescrito && (
        <p className="mt-1 flex flex-wrap items-baseline gap-x-2 text-caption text-fg-muted">
          <span>
            {card.ReporterTitle
              ? `Quem relatou escreveu: “${card.ReporterTitle}”`
              : 'Quem relatou não deu título.'}
          </span>
          {!arquivado && (
            <button
              type="button"
              disabled={salvando}
              onClick={() => void gravar(null)}
              className="underline-offset-2 hover:text-fg hover:underline disabled:opacity-60"
            >
              {card.ReporterTitle ? 'Voltar ao de quem relatou' : 'Tirar o título'}
            </button>
          )}
        </p>
      )}

      {erro && !editando && <p className="mt-1 text-caption text-error-fg">{erro}</p>}
    </div>
  )
}
