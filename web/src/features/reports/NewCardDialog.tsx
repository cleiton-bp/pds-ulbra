import { useState } from 'react'
import {
  MAX_CARD_DESCRIPTION_LENGTH,
  MAX_CARD_TITLE_LENGTH,
  type ReportDetailViewModel,
  type ReportStateCountViewModel,
} from '@/contracts'
import { describeError, projectReportService } from '@/data'
import { Button } from '@/shared/components/Button'
import { MarkdownEditor } from '@/shared/components/MarkdownEditor'
import { Modal } from '@/shared/components/Modal'
import { Select } from '@/shared/components/Select'
import { TextField } from '@/shared/components/TextField'

/**
 * Criar um card do time: titulo, descricao e a coluna em que ele nasce.
 *
 * **Nada do lado de fora.** O card do time nao tem protocolo, link nem quem
 * relatou — o formulario so pergunta o que existe para ele.
 *
 * A coluna vem escolhida na primeira ativa, que e onde a API o poria sem escolha
 * nenhuma; trocar e um clique, e nao um campo obrigatorio a mais. Aberto pelo
 * "Criar" de uma coluna do quadro, vem escolhida aquela.
 */
export function NewCardDialog({
  projectPublicId,
  colunas,
  colunaInicial,
  sprintPublicId,
  aoCriar,
  aoCancelar,
}: {
  projectPublicId: string
  colunas: ReportStateCountViewModel[] | null
  /** A coluna ja escolhida; sem ela (ou se ela nao recebe mais), a primeira ativa. */
  colunaInicial?: string
  /** A sprint em que o card nasce — a em andamento, quando veio de uma coluna do quadro. */
  sprintPublicId?: string

  aoCriar: (card: ReportDetailViewModel) => void
  aoCancelar: () => void
}) {
  const ativas = (colunas ?? []).filter(
    (coluna): coluna is ReportStateCountViewModel & { StatePublicId: string } =>
      coluna.StatePublicId !== null && coluna.IsActive,
  )

  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [coluna, setColuna] = useState(
    ativas.find((item) => item.StatePublicId === colunaInicial)?.StatePublicId ??
      ativas[0]?.StatePublicId ??
      '',
  )
  const [criando, setCriando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function criar() {
    const texto = titulo.trim()
    if (texto.length === 0 || criando) return

    setCriando(true)
    setErro(null)

    try {
      aoCriar(
        await projectReportService.createTeamCard(projectPublicId, {
          Title: texto,
          Description: descricao.trim().length > 0 ? descricao : null,
          StatePublicId: coluna || null,
          ...(sprintPublicId ? { SprintPublicId: sprintPublicId } : {}),
        }),
      )
    } catch (falha) {
      // Fica tudo no formulario: quem escreveu tenta de novo sem reescrever.
      setErro(describeError(falha))
      setCriando(false)
    }
  }

  return (
    <Modal
      open
      onOpenChange={(aberto) => {
        if (!aberto && !criando) aoCancelar()
      }}
      title="Novo card"
      description="Um card do próprio time, sem ninguém de fora: não tem protocolo, não aparece na página de acompanhamento nem na lista pública."
      width="w-[min(38rem,calc(100vw-2rem))]"
      footer={
        <>
          <Button variant="quiet" disabled={criando} onClick={aoCancelar}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            disabled={titulo.trim().length === 0 || criando}
            onClick={() => void criar()}
          >
            {criando ? 'Criando…' : 'Criar card'}
          </Button>
        </>
      }
    >
      <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto">
        <TextField
          label="Título"
          value={titulo}
          onChange={(valor) => {
            setTitulo(valor)
            if (erro) setErro(null)
          }}
          maxLength={MAX_CARD_TITLE_LENGTH}
          placeholder="O que precisa ser feito"
          autoFocus
          disabled={criando}
          error={erro}
        />

        <MarkdownEditor
          label="Descrição"
          value={descricao}
          onChange={setDescricao}
          maxLength={MAX_CARD_DESCRIPTION_LENGTH}
          placeholder="Contexto, passos, o que é preciso para dar como feito."
          disabled={criando}
        />

        {ativas.length > 0 && (
          <Select
            label="Coluna"
            value={coluna}
            disabled={criando}
            onChange={setColuna}
            options={ativas.map((item) => ({
              value: item.StatePublicId,
              label: item.StateName ?? '',
            }))}
          />
        )}
      </div>
    </Modal>
  )
}
