/**
 * Dois grupos, como no design: **Configuração** é o que existe na etapa 1, e
 * **Operação** é o que o time vai usar todo dia e ainda não existe — aparece
 * bloqueado, com a etapa em que chega escrita na dica. Esconder faria o painel
 * parecer só uma tela de chaves.
 */

/** O caminho e relativo ao projeto. */
export interface ConsoleSection {
  /** Tambem escolhe o glifo da lateral, em `SectionIcon`. */
  key: 'start' | 'keys' | 'settings'
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
  { key: 'settings', label: 'Configurações', path: 'settings' },
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
    key: 'reports',
    label: 'Relatos',
    hint: 'O quadro dos relatos que chegam do seu site, na etapa 3.',
  },
  {
    key: 'stages',
    label: 'Etapas públicas',
    hint: 'O que o seu usuário vê do andamento do relato dele, na etapa 4.',
  },
  {
    key: 'tool',
    label: 'Ferramenta',
    hint: 'Aparência e campos do formulário que aparece no seu site, na etapa 4.',
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
