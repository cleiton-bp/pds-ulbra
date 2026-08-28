import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MAX_PROJECT_NAME_LENGTH } from '@/contracts'
import { describeError } from '@/data'
import { useProjectsStore } from '@/features/projects/projectsStore'
import { Button } from '@/shared/components/Button'
import { Modal } from '@/shared/components/Modal'
import { TextField } from '@/shared/components/TextField'

const HINT = 'Escolha um nome que você reconheça na lista, e dá para renomear depois.'

/**
 * Pede so o nome: o resto da configuracao depende de decisoes das etapas 3 e 4.
 *
 * A descricao **nao** repete o que e um projeto — o cartao que a pessoa acabou de
 * clicar ja disse isso. Ela avisa o que vem depois do botao, que e a unica coisa
 * que so este dialogo pode contar: a proxima tela mostra a chave secreta, e
 * mostra uma vez so.
 *
 * O nome repetido e conferido **duas vezes** de proposito: aqui contra a lista que
 * a tela ja tem, para a resposta ser imediata; e no servidor, que e quem decide —
 * duas abas criando o mesmo nome ao mesmo tempo so ele resolve.
 *
 * Ao confirmar vai **direto** para as chaves, com a secreta na frente: o valor so
 * existe nessa resposta, e tela no meio do caminho e chance de perde-lo.
 */
export function CreateProjectDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const projects = useProjectsStore((state) => state.projects)
  const createProject = useProjectsStore((state) => state.create)
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function reset() {
    setName('')
    setError(null)
    setSaving(false)
  }

  async function submit() {
    const trimmed = name.trim()

    if (!trimmed) {
      setError('Dê um nome ao projeto para continuar.')
      return
    }

    if (projects.some((project) => project.Name.toLowerCase() === trimmed.toLowerCase())) {
      setError('Você já tem um projeto com esse nome, escolha outro para não confundir os dois.')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const created = await createProject(trimmed)

      onOpenChange(false)
      reset()

      navigate(`/projects/${created.Project.PublicId}/keys`, {
        // No estado da navegacao e nao na URL: URL vai para o historico, para o
        // log do servidor e para o print da tela.
        state: { revealedSecret: created.SecretKey },
      })
    } catch (failure) {
      setError(describeError(failure))
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        onOpenChange(next)
      }}
      title="Novo projeto"
      description="Ao criar, você vai direto para as chaves do projeto, e a secreta aparece uma única vez."
      footer={
        <>
          <Button variant="quiet" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={submit} disabled={saving}>
            {saving ? 'Criando…' : 'Criar projeto'}
          </Button>
        </>
      }
    >
      <TextField
        label="Nome do projeto"
        value={name}
        onChange={(value) => {
          setName(value)
          if (error) setError(null)
        }}
        placeholder="Ex.: Loja Ativa"
        hint={HINT}
        error={error}
        maxLength={MAX_PROJECT_NAME_LENGTH}
        autoFocus
        disabled={saving}
        onSubmit={submit}
      />
    </Modal>
  )
}
