/**
 * Dois grupos, como no design: **Configuração** é o que se ajusta uma vez, e
 * **Operação** é o que o time usa todo dia.
 *
 * O segundo grupo nasceu inteiro bloqueado, com a etapa em que cada seção chega
 * escrita na dica — esconder faria o painel parecer só uma tela de chaves. Com
 * **Relatos** no ar, ele passou a ter as duas coisas ao mesmo tempo, e é por isso
 * que existem três listas aqui e não duas.
 */

/** O caminho e relativo ao projeto. */
export interface ConsoleSection {
  /** Tambem escolhe o glifo da lateral, em `SectionIcon`. */
  key:
    | 'start'
    | 'keys'
    | 'states'
    | 'stages'
    | 'cycle'
    | 'identity'
    | 'settings'
    | 'reports'
    | 'tool'
  label: string
  /** Segmento final da rota: `/projects/:publicId/<path>`. */
  path: string
}

/**
 * "Comece por aqui" envelhece: no mes que vem ninguem esta comecando, e o nome
 * nao diz o que a tela faz. **Instalação** diz, e continua verdadeiro quando a
 * pessoa volta para conferir o script.
 *
 * Com isso, "Chaves e integração" virou so **Chaves** — dois itens dizendo
 * "integração" mandavam a pessoa abrir os dois para descobrir qual era qual.
 */
export const CONSOLE_SECTIONS: ConsoleSection[] = [
  { key: 'start', label: 'Instalação', path: 'start' },
  { key: 'keys', label: 'Chaves', path: 'keys' },
  { key: 'tool', label: 'Ferramenta', path: 'tool' },
  { key: 'states', label: 'Estados', path: 'states' },
  // O caminho e `public-stages`, e nao `stages`: na barra de endereco
  // `states` e `stages` diferem por uma letra, e as duas telas sao justamente
  // as duas que se confundem.
  { key: 'stages', label: 'Etapas públicas', path: 'public-stages' },
  // Vem **depois** das etapas públicas, e é onde ela termina: como o relato
  // encerra, quanto o lado de fora espera para ver, e o que a pessoa responde no
  // fim. Fica fora de "Configurações" porque lá mora o projeto — nome, domínios,
  // arquivar —, e aqui mora o comportamento do ciclo.
  { key: 'cycle', label: 'Ciclo', path: 'cycle' },
  // Quem e quem. Vem depois do ciclo e antes das configuracoes do projeto pelo
  // mesmo criterio: aqui mora o comportamento, e la mora o projeto. E e a escolha
  // que decide o que a lista pessoal e a visibilidade podem ser.
  { key: 'identity', label: 'Identidade', path: 'identity' },
  { key: 'settings', label: 'Configurações', path: 'settings' },
]

/**
 * O grupo de baixo, na parte que ja funciona.
 *
 * **Relatos** e a primeira: ate aqui o painel so mostrava o que a propria pessoa
 * tinha configurado, e esta e a secao que mostra o que chegou de fora.
 */
export const OPERATION_SECTIONS: ConsoleSection[] = [
  { key: 'reports', label: 'Relatos', path: 'reports' },
]

/**
 * A dica comeca pelo **que a secao vai fazer** e so entao diz em que etapa chega.
 * Comecando pela etapa, ela respondia "quando" para quem ainda nao sabia "o que"
 * — e "etapa 3" e numero de cronograma nosso, nao de quem usa o painel.
 */
export interface LockedSection {
  key: string
  label: string
  hint: string
}

export const LOCKED_SECTIONS: LockedSection[] = [
  {
    key: 'board',
    label: 'Quadro',
    hint: 'Os relatos como cartões, que o time move entre os estados que você criar, na etapa 3.',
  },
  {
    key: 'addons',
    label: 'Addons',
    hint: 'Integrações com Slack, GitHub e e-mail, na etapa 5.',
  },
  {
    key: 'members',
    label: 'Membros',
    hint: 'Convites para outras pessoas usarem esta conta, na etapa 5.',
  },
  { key: 'usage', label: 'Uso', hint: 'Volume de relatos e limites da conta, na etapa 5.' },
]
