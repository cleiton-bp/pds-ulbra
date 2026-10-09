/**
 * A lateral do projeto, em duas partes: **o trabalho em cima**, sem rotulo, e
 * **"Configurar o projeto"** embaixo, recolhivel e so para quem administra.
 *
 * Ja foi o contrario — onze telas de configuracao antes do Trabalho, e o grupo do
 * time com o rotulo "Operação", que nao dizia nada a quem e so membro. A lateral e
 * lida de cima para baixo todo dia, e o que se usa todo dia estava no fim: no
 * celular pequeno, o Trabalho ficava fora da gaveta.
 *
 * **Os nomes sao os do time**, e nao os de quem construiu: "Colunas", e nao
 * "Estados"; "Andamento público", e nao "Etapas públicas"; "Botão no site", e nao
 * "Ferramenta". Os enderecos continuam os de antes — ja foram copiados para
 * conversas, e trocar o nome da tela nao precisa quebrar link nenhum.
 */

/** O caminho e relativo ao projeto. */
export interface ConsoleSection {
  /** Tambem escolhe o glifo da lateral, em `SectionIcon`. */
  key:
    | 'start'
    | 'keys'
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
    | 'tool'
  label: string
  /** Segmento final da rota: `/projects/:publicId/<path>`. */
  path: string
}

/**
 * O que o time usa todo dia, no topo. **Trabalho** e a primeira: e onde o time
 * trabalha — o que chegou de fora e os cards que ele mesmo criou. O caminho continua
 * `reports`, porque o relato veio primeiro e os enderecos ja foram copiados para
 * conversas.
 */
export const WORK_SECTIONS: ConsoleSection[] = [
  { key: 'reports', label: 'Trabalho', path: 'reports' },
  // O time inteiro ve quem esta no projeto — e de onde sai com quem trabalhar —, e
  // quem e so membro tambem abre a tela, so para ler. Convidar, mudar papel e
  // remover aparecem para quem administra.
  { key: 'members', label: 'Membros', path: 'members' },
  // **Fora do Trabalho, e nao uma aba dele.** As duas leem o mesmo relato e
  // respondem perguntas diferentes: "o que ainda nao tratei" e "o que ja pode ser
  // lido por estranhos". Aparece **sempre**, inclusive em projeto privado — a tela
  // diz que ali a fila nao vai a publico.
  { key: 'moderation', label: 'Moderação', path: 'moderation' },
]

/**
 * "Configurar o projeto", em dois blocos: **o do quadro** primeiro (colunas,
 * prioridades, etiquetas, sprints), que e o que o time ajusta depois de comecar; e
 * **o do site e de quem relata** depois, que se ajusta uma vez.
 */
export const CONFIG_SECTIONS: ConsoleSection[][] = [
  [
    { key: 'states', label: 'Colunas', path: 'states' },
    // Logo depois das colunas: e o mesmo tipo de lista — nomes do time, na ordem do
    // time —, e o que o card ganha alem da coluna.
    { key: 'priorities', label: 'Prioridades', path: 'priorities' },
    { key: 'labels', label: 'Etiquetas', path: 'labels' },
    // Item proprio, e nao o fim do Ciclo: sprints sao opcionais, e o time precisa
    // achar onde liga-las. O caminho e `sprints`; o Backlog e uma aba do Trabalho.
    { key: 'sprints', label: 'Sprints', path: 'sprints' },
  ],
  [
    // "Comece por aqui" envelhecia: no mes seguinte ninguem esta comecando.
    // **Instalação** diz o que a tela faz, e continua verdadeiro quando a pessoa
    // volta para conferir o script.
    { key: 'start', label: 'Instalação', path: 'start' },
    { key: 'keys', label: 'Chaves', path: 'keys' },
    { key: 'tool', label: 'Botão no site', path: 'tool' },
    // O caminho e `public-stages`, e nao `stages`: na barra de endereco `states` e
    // `stages` diferem por uma letra, e as duas telas sao justamente as duas que se
    // confundiam.
    { key: 'stages', label: 'Andamento público', path: 'public-stages' },
    // Depois do andamento, e onde ele termina: como o relato encerra, o que quem
    // relatou le, e quando ele pode reabrir.
    { key: 'cycle', label: 'Ciclo', path: 'cycle' },
    // Como a pessoa que relata e reconhecida, e quem ve os relatos. Antes de Anexos:
    // o print publico so faz sentido depois de decidido quem pode ver o relato.
    { key: 'identity', label: 'Quem relata', path: 'identity' },
    { key: 'media', label: 'Anexos', path: 'media' },
    // Por ultimo, o projeto em si: nome, enderecos permitidos e arquivar.
    { key: 'settings', label: 'Projeto', path: 'settings' },
  ],
]

/** Todas as secoes de configuracao, numa lista so. */
export const CONFIG_SECTION_LIST: ConsoleSection[] = CONFIG_SECTIONS.flat()

/** A secao de um segmento de endereco — `states` em `/projects/:id/states`. */
export function sectionByPath(path: string): ConsoleSection | undefined {
  return [...WORK_SECTIONS, ...CONFIG_SECTION_LIST].find((section) => section.path === path)
}

/** O segmento e de uma tela de configuracao, que so quem administra abre. */
export function isConfigPath(path: string): boolean {
  return CONFIG_SECTION_LIST.some((section) => section.path === path)
}
