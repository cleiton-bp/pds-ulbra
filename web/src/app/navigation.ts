/**
 * Dois grupos, como no design: **Configuração** é o que se ajusta uma vez, e
 * **Operação** é o que o time usa todo dia.
 *
 * O segundo grupo tem o que já funciona e o que ainda não existe, bloqueado, com o
 * que a seção vai fazer escrito na dica — esconder faria o painel parecer menor do
 * que o produto vai ser. É por isso que existem três listas aqui e não duas.
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
    | 'media'
    | 'settings'
    | 'reports'
    | 'moderation'
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
  // Depois da identidade e antes das configuracoes do projeto, pelo mesmo
  // criterio das duas: aqui mora o comportamento, e la mora o projeto. E vem
  // depois da identidade porque o print publico so faz sentido depois de
  // decidido quem pode ver o relato.
  { key: 'media', label: 'Mídia', path: 'media' },
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
  // **Vem depois de Relatos, e nao dentro dela.** As duas leem o mesmo relato e
  // respondem perguntas diferentes: "o que ainda nao tratei" e "o que ja pode
  // ser lido por estranhos". Como aba de um filtro, a segunda viraria um recorte
  // da primeira — e a decisao de publicar nao e um recorte de nada.
  //
  // Aparece **sempre**, inclusive em projeto privado. Some-la ali esconderia
  // que a fila existe e continua enchendo, e quem marcasse o projeto como
  // publico descobriria um dia uma fila de meses.
  { key: 'moderation', label: 'Moderação', path: 'moderation' },
]

/**
 * A dica diz **o que a secao vai fazer**, e que ainda nao esta disponivel. Sem data:
 * cronograma e assunto nosso, e nao de quem usa o painel.
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
    hint: 'Os relatos como cartões, que o time arrasta entre os estados que você criar. Ainda não disponível.',
  },
  {
    key: 'addons',
    label: 'Addons',
    hint: 'Integrações com Slack, GitHub e e-mail. Ainda não disponível.',
  },
  {
    key: 'members',
    label: 'Membros',
    hint: 'Convites para outras pessoas trabalharem neste projeto. Ainda não disponível.',
  },
  {
    key: 'usage',
    label: 'Uso',
    hint: 'Volume de relatos e limites da conta. Ainda não disponível.',
  },
]
