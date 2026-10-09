import { useRef, useState } from 'react'
import {
  MAX_CARD_TITLE_LENGTH,
  type ReportDetailViewModel,
  type ReportSummaryViewModel,
} from '@/contracts'
import { describeError, projectReportService } from '@/data'
import { useCardDraft, useDiscardQuestion } from '@/features/reports/cardDrafts'
import { cardHeadline, headlineText } from '@/features/reports/cardLook'
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
 * **Sem titulo nenhum, a manchete e o comeco do texto**, entre aspas — o mesmo que a
 * lista mostra.
 * Antes era "Sem titulo", em cinza: o olho caia num rotulo vazio em vez do problema,
 * e o card aberto nao se parecia com a linha em que se clicou. O "Dar um titulo"
 * continua ao lado.
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
  // Entre aspas, como a lista: e a fala de quem relatou.
  const manchete = headlineText(cardHeadline(card))

  // O Esc com o foco na edicao sai dela, e o card fica; com o texto mudado, pergunta.
  const mudou = editando && texto.trim() !== (titulo ?? '')
  const perguntar = useDiscardQuestion()
  const area = useRef<HTMLDivElement>(null)
  const sair = () => {
    setEditando(false)
    setErro(null)
  }
  useCardDraft(
    { sujo: mudou, cancelar: editando ? () => (mudou ? perguntar(sair) : sair()) : undefined },
    area,
  )

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
      <div ref={area} className="flex flex-col gap-2">
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
          <Button variant="quiet" size="sm" disabled={salvando} onClick={sair}>
            Cancelar
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 break-words font-semibold text-fg text-notice">
          {titulo ?? manchete}
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

/**
 * Se o texto de quem relatou ja esta inteiro na manchete — o relato sem titulo, curto e
 * numa linha so. Ai ele nao se repete logo abaixo; cortado, ou em mais de uma linha, o
 * texto inteiro vem embaixo como sempre.
 */
export function textInHeadline(card: ReportSummaryViewModel): boolean {
  const manchete = cardHeadline(card)
  if (manchete.titled) return false
  const texto = (card.Text ?? '').trim()
  return !/\r|\n/.test(texto) && manchete.text === texto.replace(/\s+/g, ' ')
}
