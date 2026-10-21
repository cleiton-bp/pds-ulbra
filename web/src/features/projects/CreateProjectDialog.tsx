import { useId, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MAX_PROJECT_NAME_LENGTH, type ProjectTemplate } from '@/contracts'
import { describeError } from '@/data'
import { useProjectsStore } from '@/features/projects/projectsStore'
import { Button } from '@/shared/components/Button'
import { Modal } from '@/shared/components/Modal'
import { TextField } from '@/shared/components/TextField'
import { cn } from '@/shared/lib/cn'

interface Template {
  value: ProjectTemplate
  name: string
  columns: readonly string[]
  sprints: boolean
}

/** O projeto de sempre: e o que vem marcado, e o que vale se a escolha se perder. */
const QUADRO_SIMPLES: Template = {
  value: 'SimpleBoard',
  name: 'Quadro simples',
  columns: ['A fazer', 'Fazendo', 'Feito'],
  sprints: false,
}

/**
 * Os modelos, na ordem da escolha. So as colunas aparecem escritas: sao o que a pessoa
 * reconhece do jeito de trabalhar do time — "Kanban" sozinho diz pouco a quem nunca
 * usou, e "Backlog · A fazer · Fazendo" diz o bastante. A jornada publica e os tipos de
 * relato que cada modelo traz ficam para as telas do projeto, onde se ajustam. Espelho
 * dos modelos de `Pds.Service/Projects/ProjectTemplates.cs`.
 */
const TEMPLATES: readonly Template[] = [
  QUADRO_SIMPLES,
  {
    value: 'Support',
    name: 'Suporte',
    columns: ['Novo', 'Em atendimento', 'Aguardando quem relatou', 'Resolvido'],
    sprints: false,
  },
  {
    value: 'Kanban',
    name: 'Kanban',
    columns: ['Backlog', 'A fazer', 'Fazendo', 'Em revisão', 'Feito'],
    sprints: false,
  },
  {
    value: 'Scrum',
    name: 'Scrum',
    columns: ['A fazer', 'Fazendo', 'Em revisão', 'Feito'],
    sprints: true,
  },
]

/**
 * Pede o nome e o jeito de trabalhar: o modelo traz as colunas, a jornada publica
 * ligada a elas e os tipos de relato prontos. O resto da configuracao mora nas telas
 * do projeto, e cada uma ja funciona com os padroes.
 *
 * **Pouco a vista, de proposito.** Ja foi quatro cartoes com tres linhas cada, um
 * paragrafo de abertura, uma dica e um aviso; depois um seletor com uma previa em
 * caixa. Agora e uma lista: cada modelo e uma linha com o nome e as colunas embaixo,
 * e nada mais — nem caixa dentro de caixa, nem frase de apoio. O que o modelo traz
 * alem das colunas (a jornada publica, os tipos de relato) a pessoa ve no projeto,
 * nas telas em que isso se ajusta.
 *
 * O **quadro simples vem marcado**: quem so digita o nome e confirma recebe o projeto
 * de sempre. O modelo so vale aqui — depois, cada coisa se muda na propria tela, e a
 * linha embaixo da previa diz isso para ninguem travar na escolha.
 *
 * O nome repetido e conferido **duas vezes** de proposito: aqui contra a lista que
 * a tela ja tem, para a resposta ser imediata; e no servidor, que e quem decide —
 * duas abas criando o mesmo nome ao mesmo tempo so ele resolve.
 *
 * Ao confirmar vai para a **Instalacao**: e a proxima coisa a fazer — copiar a
 * chave publica e colar o script. A linha ao lado dos botoes avisa. Ja foi para as
 * chaves, com a secreta na frente e um aviso de perda ao sair; o primeiro minuto do
 * projeto ia numa chave que quase ninguem usa. A secreta agora nasce sob pedido, na
 * tela de chaves.
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
      width="w-[min(30rem,calc(100vw-2rem))]"
      className="max-h-[calc(100dvh-2rem)] overflow-y-auto"
      footer={
        <>
          {/* Onde o botao leva, dito ao lado dele e nao num paragrafo de abertura. */}
          <p className="basis-full self-center text-caption text-fg-muted sm:mr-auto sm:basis-auto">
            Em seguida, a instalação.
          </p>
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
        error={error}
        maxLength={MAX_PROJECT_NAME_LENGTH}
        autoFocus
        disabled={saving}
        onSubmit={submit}
      />

      <fieldset className="mt-5" disabled={saving}>
        <legend className="mb-1 block text-detail text-fg-muted">Como o time trabalha</legend>

        {/* O radio de verdade fica escondido dentro da linha, que e o rotulo: o teclado
            anda pelas setas como em qualquer grupo de radios, e o anel de foco vai para
            a linha inteira (`has-[:focus-visible]`). */}
        <div className="-mx-2 flex flex-col">
          {TEMPLATES.map((option) => {
            const marcado = option.value === template
            const nome = `${ids}-${option.value}-nome`
            const detalhe = `${ids}-${option.value}-detalhe`

            return (
              <label
                key={option.value}
                className={cn(
                  'flex items-start gap-3 rounded-lg px-2 py-2.5 transition-colors duration-150 motion-reduce:transition-none',
                  'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-fg-muted',
                  saving ? 'cursor-not-allowed' : 'cursor-pointer',
                  marcado ? 'bg-surface-sunken' : 'hover:bg-surface',
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
                  className="sr-only"
                />
                <Marcador marcado={marcado} />
                <span className="min-w-0 flex-1">
                  <span
                    id={nome}
                    className={cn(
                      'block text-body transition-colors duration-150',
                      marcado ? 'font-medium text-fg' : 'text-fg',
                    )}
                  >
                    {option.name}
                  </span>
                  <span
                    id={detalhe}
                    className="mt-0.5 block text-caption text-fg-muted leading-relaxed"
                  >
                    <span className="sr-only">Colunas: </span>
                    {option.columns.join(' · ')}
                    {option.sprints && ' · sprints de duas semanas'}
                  </span>
                </span>
              </label>
            )
          })}
        </div>

        <p className="mt-2 px-0 text-caption text-fg-muted">Tudo se ajusta depois.</p>
      </fieldset>
    </Modal>
  )
}

/**
 * O circulo do radio, desenhado aqui para acompanhar o resto do painel: o anel escurece
 * e o ponto cresce no marcado, em vez de o controle do navegador trocar de uma vez.
 */
function Marcador({ marcado }: { marcado: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'mt-0.5 flex size-4 flex-none items-center justify-center rounded-full border transition-colors duration-150',
        marcado ? 'border-fg' : 'border-fg-disabled',
      )}
    >
      <span
        className={cn(
          'size-2 rounded-full bg-fg transition-transform duration-150 ease-out motion-reduce:transition-none',
          marcado ? 'scale-100' : 'scale-0',
        )}
      />
    </span>
  )
}
