/**
 * A lateral do projeto, em duas partes: **o trabalho em cima**, sem rotulo, e
 * **"Configurar o projeto"** embaixo, um item so e so para quem administra.
 *
 * Ja foi o contrario — onze telas de configuracao antes do Trabalho, e o grupo do
 * time com o rotulo "Operação", que nao dizia nada a quem e so membro. Depois foram
 * treze telas em dois blocos sem rotulo, e quem procurava "autorizar o dominio"
 * tinha de adivinhar que morava em "Projeto". Agora a configuracao e **uma pagina
 * central** com as cinco areas, e as areas so aparecem na lateral quando a pessoa
 * esta dentro da configuracao.
 *
 * **Os nomes sao os do time**, e nao os de quem construiu: "Colunas", e nao
 * "Estados"; "Andamento público", e nao "Etapas públicas"; "O botão", e nao
 * "Ferramenta". Os enderecos continuam os de antes — ja foram copiados para
 * conversas, e trocar o nome da tela nao precisa quebrar link nenhum.
 *
 * **Esta e a fonte unica.** A lateral, a pagina central, o titulo da aba e o indice
 * da busca (`configure/settingsIndex.ts`) leem daqui: mudar uma tela de area e
 * mudar uma linha.
 */

/** Tambem escolhe o glifo da lateral, em `SectionIcon`. */
export type SectionKey =
  | 'configure'
  | 'start'
  | 'keys'
  | 'domains'
  | 'states'
  | 'priorities'
  | 'labels'
  | 'sprints'
  | 'stages'
  | 'cycle'
  | 'identity'
  | 'media'
  | 'settings'
  | 'reports'
  | 'moderation'
  | 'members'
  | 'reportTypes'
  | 'formTexts'
  | 'tool'

/** O caminho e relativo ao projeto. */
export interface ConsoleSection {
  key: SectionKey
  label: string
  /** Segmento final da rota: `/projects/:publicId/<path>`. */
  path: string
  /**
   * Outros segmentos que contam como esta tela na lateral: a de Chaves nao tem item
   * proprio, e quem esta nela ve a Instalacao marcada — e de la que ela se abre.
   */
  also?: string[]
  /** O time inteiro abre a tela; quem e so membro le. Nao e tela de quem administra. */
  everyone?: boolean
}

export type ConfigAreaKey = 'site' | 'form' | 'tracking' | 'board' | 'team'

/** Uma area da configuracao: um assunto, com as telas dele. */
export interface ConfigArea {
  key: ConfigAreaKey
  label: string
  /** Uma linha, na pagina central: o que se resolve nesta area. */
  purpose: string
  sections: ConsoleSection[]
}

// O time inteiro ve quem esta no projeto — e de onde sai com quem trabalhar —, e
// quem e so membro tambem abre a tela, so para ler. Convidar, mudar papel e
// remover aparecem para quem administra. Aparece em cima, para todos, e de novo
// na area "O time".
const MEMBERS: ConsoleSection = {
  key: 'members',
  label: 'Membros',
  path: 'members',
  everyone: true,
}

/**
 * O que o time usa todo dia, no topo. **Trabalho** e a primeira: e onde o time
 * trabalha — o que chegou de fora e os cards que ele mesmo criou. O caminho continua
 * `reports`, porque o relato veio primeiro e os enderecos ja foram copiados para
 * conversas.
 */
export const WORK_SECTIONS: ConsoleSection[] = [
  { key: 'reports', label: 'Trabalho', path: 'reports' },
  MEMBERS,
  // **Fora do Trabalho, e nao uma aba dele.** As duas leem o mesmo relato e
  // respondem perguntas diferentes: "o que ainda nao tratei" e "o que ja pode ser
  // lido por estranhos". Aparece **sempre**, inclusive em projeto privado — a tela
  // diz que ali a fila nao vai a publico.
  { key: 'moderation', label: 'Moderação', path: 'moderation' },
]

/**
 * A pagina central: primeiros passos, busca e as cinco areas. O caminho e
 * `configure`, e nao `settings`, que ja era a tela do Projeto e ja foi copiado.
 */
export const CONFIG_HOME: ConsoleSection = {
  key: 'configure',
  label: 'Configurar o projeto',
  path: 'configure',
}

/**
 * As cinco areas, **pelo assunto de quem configura**, e nao pela ordem em que as
 * telas nasceram: o sistema onde o botao mora, o formulario que a pessoa preenche, o
 * que ela acompanha depois, o quadro do time e o time.
 */
export const CONFIG_AREAS: ConfigArea[] = [
  {
    key: 'site',
    label: 'O seu sistema',
    purpose: 'Onde o botão aparece, como ele é e de quais endereços os relatos entram.',
    sections: [
      // "Comece por aqui" envelhecia: no mes seguinte ninguem esta comecando.
      // **Instalação** diz o que a tela faz, e continua verdadeiro quando a pessoa
      // volta para conferir o script. As chaves sao a parte avancada dela.
      { key: 'start', label: 'Instalação', path: 'start', also: ['keys'] },
      { key: 'tool', label: 'O botão', path: 'tool' },
      // Tela propria: autorizar o dominio e o passo que trava a primeira hora — sem
      // ele, o primeiro relato fica retido —, e escondido em "Projeto" ninguem o achava.
      { key: 'domains', label: 'Domínios', path: 'domains' },
    ],
  },
  {
    key: 'form',
    label: 'O formulário',
    purpose: 'O que quem relata escolhe, responde e anexa.',
    sections: [
      { key: 'reportTypes', label: 'Tipos de relato', path: 'report-types' },
      // O que vale para todo tipo — o titulo, o enviar, o tema, a pergunta do titulo e
      // a do nome. Morava em O botão, misturado com a cor do botao. O caminho continua
      // `form-texts`: os enderecos ja copiados nao quebram com o nome novo.
      { key: 'formTexts', label: 'Formulário', path: 'form-texts' },
      { key: 'media', label: 'Anexos', path: 'media' },
    ],
  },
  {
    key: 'tracking',
    label: 'O acompanhamento',
    purpose:
      'Quem pode ver os relatos, o que a pessoa lê depois de enviar e como o relato termina.',
    sections: [
      // O caminho e `public-stages`, e nao `stages`: na barra de endereco `states` e
      // `stages` diferem por uma letra, e as duas telas sao justamente as duas que se
      // confundiam.
      { key: 'stages', label: 'Andamento público', path: 'public-stages' },
      // Depois do andamento, e onde ele termina: como o relato encerra, o que quem
      // relatou le, e quando ele pode reabrir.
      { key: 'cycle', label: 'Ciclo', path: 'cycle' },
      { key: 'identity', label: 'Quem relata', path: 'identity' },
    ],
  },
  {
    key: 'board',
    label: 'O quadro',
    purpose: 'Como o time organiza o trabalho: colunas, prioridades, etiquetas e sprints.',
    sections: [
      { key: 'states', label: 'Colunas', path: 'states' },
      // Logo depois das colunas: e o mesmo tipo de lista — nomes do time, na ordem do
      // time —, e o que o card ganha alem da coluna.
      { key: 'priorities', label: 'Prioridades', path: 'priorities' },
      { key: 'labels', label: 'Etiquetas', path: 'labels' },
      // Item proprio, e nao o fim do Ciclo: sprints sao opcionais, e o time precisa
      // achar onde liga-las. O caminho e `sprints`; o Backlog e uma aba do Trabalho.
      { key: 'sprints', label: 'Sprints', path: 'sprints' },
    ],
  },
  {
    key: 'team',
    label: 'O time',
    purpose: 'Quem trabalha no projeto, e o projeto em si.',
    sections: [MEMBERS, { key: 'settings', label: 'Projeto', path: 'settings' }],
  },
]

/**
 * Telas de configuracao **sem item na lateral**, que continuam com endereco: a de
 * Chaves se abre pela Instalacao ("Chaves e integração avançada"). O link antigo
 * segue valendo, e o titulo da aba continua dizendo onde a pessoa esta.
 */
const LINKED_SECTIONS: ConsoleSection[] = [{ key: 'keys', label: 'Chaves', path: 'keys' }]

/** As telas de quem administra, numa lista so: a central, as das areas e as ligadas. */
export const CONFIG_SECTION_LIST: ConsoleSection[] = [
  CONFIG_HOME,
  ...CONFIG_AREAS.flatMap((area) => area.sections).filter((section) => !section.everyone),
  ...LINKED_SECTIONS,
]

/** A secao de um segmento de endereco — `states` em `/projects/:id/states`. */
export function sectionByPath(path: string): ConsoleSection | undefined {
  return [...WORK_SECTIONS, ...CONFIG_SECTION_LIST].find((section) => section.path === path)
}

/** A secao pela chave — o indice da busca aponta para a tela assim. */
export function sectionByKey(key: SectionKey): ConsoleSection | undefined {
  return [...WORK_SECTIONS, ...CONFIG_SECTION_LIST].find((section) => section.key === key)
}

/** A area de uma tela; a de Chaves cai em O seu sistema, junto da Instalacao. */
export function areaOfSection(key: SectionKey): ConfigArea | undefined {
  const path = sectionByKey(key)?.path
  return CONFIG_AREAS.find((area) =>
    area.sections.some(
      (section) => section.key === key || (path !== undefined && section.also?.includes(path)),
    ),
  )
}

/** O segmento e de uma tela de configuracao, que so quem administra abre. */
export function isConfigPath(path: string): boolean {
  return CONFIG_SECTION_LIST.some((section) => section.path === path)
}

/** A tela esta aberta: o proprio segmento, ou um dos que contam como ela. */
export function isSectionActive(section: ConsoleSection, segment: string): boolean {
  return section.path === segment || (section.also?.includes(segment) ?? false)
}
