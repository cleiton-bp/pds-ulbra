import { useId, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MAX_PROJECT_NAME_LENGTH, type ProjectTemplate } from '@/contracts'
import { describeError } from '@/data'
import { useProjectsStore } from '@/features/projects/projectsStore'
import { Button } from '@/shared/components/Button'
import { Modal } from '@/shared/components/Modal'
import { TextField } from '@/shared/components/TextField'
import { cn } from '@/shared/lib/cn'

const HINT = 'Escolha um nome que você reconheça na lista, e dá para renomear depois.'

/**
 * Os modelos, na ordem da escolha. As colunas aparecem escritas porque sao o que a
 * pessoa reconhece do jeito de trabalhar do time — "Kanban" sozinho diz pouco a quem
 * nunca usou, e "Backlog · A fazer · Fazendo" diz o bastante. Espelho dos modelos de
 * `Pds.Service/Projects/ProjectTemplates.cs`.
 */
const TEMPLATES: ReadonlyArray<{
  value: ProjectTemplate
  name: string
  line: string
  columns: readonly string[]
}> = [
  {
    value: 'SimpleBoard',
    name: 'Quadro simples',
    line: 'O quadro de sempre, para começar sem pensar em configuração.',
    columns: ['A fazer', 'Fazendo', 'Feito'],
  },
  {
    value: 'Support',
    name: 'Suporte',
    line: 'Atendimento: Problema, Dúvida e Pedido, e a vez de quem relatou responder.',
    columns: ['Novo', 'Em atendimento', 'Aguardando quem relatou', 'Resolvido'],
  },
  {
    value: 'Kanban',
    name: 'Kanban',
    line: 'Fluxo contínuo, com uma fila de entrada e revisão antes de terminar.',
    columns: ['Backlog', 'A fazer', 'Fazendo', 'Em revisão', 'Feito'],
  },
  {
    value: 'Scrum',
    name: 'Scrum',
    line: 'Sprints de duas semanas, com pontos no card e revisão antes de terminar.',
    columns: ['A fazer', 'Fazendo', 'Em revisão', 'Feito'],
  },
]

/**
 * Pede o nome e o jeito de trabalhar: o modelo traz as colunas, a jornada publica
 * ligada a elas e os tipos de relato prontos. O resto da configuracao mora nas telas
 * do projeto, e cada uma ja funciona com os padroes.
 *
 * O **quadro simples vem marcado**: quem so digita o nome e confirma recebe o projeto
 * de sempre. O modelo so vale aqui — depois, cada coisa se muda na propria tela, e o
 * aviso embaixo da escolha diz isso para ninguem travar nela.
 *
 * A descricao **nao** repete o que e um projeto — o cartao que a pessoa acabou de
 * clicar ja disse isso. Ela avisa o que vem depois do botao, que e a unica coisa
 * que so este dialogo pode contar.
 *
 * O nome repetido e conferido **duas vezes** de proposito: aqui contra a lista que
 * a tela ja tem, para a resposta ser imediata; e no servidor, que e quem decide —
 * duas abas criando o mesmo nome ao mesmo tempo so ele resolve.
 *
 * Ao confirmar vai para a **Instalacao**: e a proxima coisa a fazer — copiar a
 * chave publica e colar o script. Ja foi para as chaves, com a secreta na frente e
 * um aviso de perda ao sair; o primeiro minuto do projeto ia numa chave que quase
 * ninguem usa. A secreta agora nasce sob pedido, na tela de chaves.
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
  const [template, setTemplate] = useState<ProjectTemplate>('SimpleBoard')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const ids = useId()

  function reset() {
    setName('')
    setTemplate('SimpleBoard')
    setError(null)
    setSaving(false)
  }

  async function submit() {
    const trimmed = name.trim()

    if (!trimmed) {
      setError('Dê um nome ao projeto para continuar.')
      return
    }

    // So os da conta propria: o projeto novo nasce nela, e o nome so precisa ser
    // unico dentro da conta — o projeto de outra conta pode ter o mesmo nome.
    if (
      projects.some(
        (project) => project.IsAccountOwner && project.Name.toLowerCase() === trimmed.toLowerCase(),
      )
    ) {
      setError('Você já tem um projeto com esse nome, escolha outro para não confundir os dois.')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const created = await createProject(trimmed, template)

      onOpenChange(false)
      reset()

      navigate(`/projects/${created.Project.PublicId}/start`)
    } catch (failure) {
      setError(describeError(failure))
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        // Esc ou o clique fora durante a criacao: o projeto ja esta a caminho, e fechar
        // agora limparia o formulario de um projeto que vai aparecer assim mesmo.
        if (!next && saving) return
        if (!next) reset()
        onOpenChange(next)
      }}
      title="Novo projeto"
      width="w-[min(34rem,calc(100vw-2rem))]"
      className="max-h-[calc(100dvh-2rem)] overflow-y-auto"
      description="Ao criar, você vai para a instalação: copiar a chave pública e colar o script no seu sistema."
      footer={
        <>
          <Button
            variant="quiet"
            onClick={() => {
              // O mesmo caminho do Esc: o dialogo continua montado, e reabrir depois de
              // cancelar nao pode trazer o nome nem o modelo de antes.
              reset()
              onOpenChange(false)
            }}
            disabled={saving}
          >
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

      <fieldset className="mt-5" disabled={saving}>
        <legend className="mb-2.5 font-medium text-detail text-fg">Como o time trabalha</legend>

        <div className="grid gap-2">
          {TEMPLATES.map((option) => {
            const marcado = option.value === template
            const nome = `${ids}-${option.value}-nome`
            const detalhe = `${ids}-${option.value}-detalhe`

            return (
              <label
                key={option.value}
                className={cn(
                  'flex gap-3 rounded-xl border p-3',
                  saving ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
                  marcado ? 'border-accent bg-surface' : 'border-border',
                )}
              >
                <input
                  type="radio"
                  name={`${ids}-template`}
                  value={option.value}
                  checked={marcado}
                  onChange={() => setTemplate(option.value)}
                  aria-labelledby={nome}
                  aria-describedby={detalhe}
                  className="mt-0.5 flex-none accent-accent"
                />
                <span className="min-w-0">
                  <span id={nome} className="mb-0.5 block font-medium text-detail text-fg">
                    {option.name}
                  </span>
                  <span id={detalhe} className="block text-caption text-fg-muted leading-relaxed">
                    {option.line}{' '}
                    <span className="block">
                      <strong className="font-medium text-fg">Colunas:</strong>{' '}
                      {option.columns.join(' · ')}
                    </span>
                  </span>
                </span>
              </label>
            )
          })}
        </div>

        <p className="mt-2 text-caption text-fg-muted leading-relaxed">
          Tudo isso se muda depois, cada coisa na própria tela.
        </p>
      </fieldset>
    </Modal>
  )
}
