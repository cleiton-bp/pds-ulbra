/**
 * Dois grupos, como no design: **Configuração** é o que existe na etapa 1, e
 * **Operação** é o que o time vai usar todo dia e ainda não existe — aparece
 * bloqueado, com a etapa em que chega escrita na dica. Esconder faria o painel
 * parecer só uma tela de chaves.
 */

/** O caminho e relativo ao projeto. */
export interface ConsoleSection {
  key: string
  label: string
  /** Segmento final da rota: `/projects/:publicId/<path>`. */
  path: string
}

export const CONSOLE_SECTIONS: ConsoleSection[] = [
  { key: 'start', label: 'Comece por aqui', path: 'start' },
  { key: 'keys', label: 'Chaves e integração', path: 'keys' },
  { key: 'settings', label: 'Configurações', path: 'settings' },
]

/** O texto e a promessa: diz em que etapa aquilo chega. */
export interface LockedSection {
  key: string
  label: string
  hint: string
}

export const LOCKED_SECTIONS: LockedSection[] = [
  { key: 'reports', label: 'Relatos', hint: 'Chega na etapa 3, quando o quadro de relatos abre.' },
  {
    key: 'stages',
    label: 'Etapas públicas',
    hint: 'Chega na etapa 4: o que o usuário final vê do andamento.',
  },
  {
    key: 'tool',
    label: 'Ferramenta',
    hint: 'Chega na etapa 4: aparência e campos do formulário no seu site.',
  },
  {
    key: 'addons',
    label: 'Addons',
    hint: 'Chega na etapa 5: integrações com Slack, GitHub e e-mail.',
  },
  { key: 'members', label: 'Membros', hint: 'Chega na etapa 5, junto com convites para a conta.' },
  { key: 'usage', label: 'Uso', hint: 'Chega na etapa 5, quando existe volume para medir.' },
]
