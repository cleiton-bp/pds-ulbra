import {
  areaOfSection,
  type ConfigArea,
  type ConsoleSection,
  type SectionKey,
  sectionByKey,
} from '@/app/navigation'

/**
 * O indice da busca da configuracao: **toda opcao das telas de configuracao, num lugar
 * so**, com as palavras que a pessoa usaria para procura-la.
 *
 * **Fixo, e nao lido das telas.** Ler o DOM de cada tela exigiria monta-las todas, e o
 * que se procura e justamente o que nao esta a vista. O preco e manter: campo novo
 * numa tela entra aqui tambem. O teste `settingsIndex.test.ts` confere que cada ancora
 * daqui existe no codigo das telas, para o indice nao apontar para o vazio.
 *
 * **A tela vem pela chave, e nao pelo caminho**: a area e o endereco saem de
 * `navigation.ts`. Mover um campo de tela e trocar `section` e `anchor` na linha dele.
 *
 * `basic` e o que se ajusta na primeira hora; `advanced`, o que ja vem certo de
 * fabrica e quase ninguem muda. A busca mostra o basico primeiro, com o mesmo acerto.
 */
export interface SettingEntry {
  /** Como a opcao se chama na tela, ou o mais perto disso que caiba numa linha. */
  label: string
  /** As outras palavras que levam a ela: o que a pessoa digitaria sem saber o nome. */
  synonyms: string[]
  section: SectionKey
  /** O `id` do campo na tela. Sem ele, a busca leva ao topo da tela. */
  anchor?: string
  level: 'basic' | 'advanced'
}

export const SETTINGS_INDEX: SettingEntry[] = [
  // O seu sistema — Instalação
  {
    label: 'Chave pública',
    synonyms: ['chave', 'copiar chave', 'public key'],
    section: 'start',
    anchor: 'copiar-chave',
    level: 'basic',
  },
  {
    label: 'Script do seu sistema',
    synonyms: [
      'site',
      'aplicação',
      'app',
      'instalar',
      'instalação',
      'código',
      'colar',
      'snippet',
      'body',
      'html',
    ],
    section: 'start',
    anchor: 'script',
    level: 'basic',
  },
  {
    label: 'Relato de teste',
    synonyms: ['testar', 'teste', 'experimentar', 'conferir instalação'],
    section: 'start',
    anchor: 'relato-de-teste',
    level: 'basic',
  },
  {
    label: 'Usar o seu próprio botão',
    synonyms: ['data-button', 'pds.open', 'abrir pelo meu botão', 'sem o botão', 'esconder botão'],
    section: 'start',
    anchor: 'proprio-botao',
    level: 'advanced',
  },

  // O seu sistema — Chaves (aberta pela Instalação)
  {
    label: 'Chave secreta e integração avançada',
    synonyms: ['api', 'secret', 'token', 'integração', 'integrar sistema', 'regenerar chave'],
    section: 'keys',
    anchor: 'integracao',
    level: 'advanced',
  },
  {
    label: 'Chaves do projeto',
    synonyms: ['chave pública', 'trocar chave', 'chaves'],
    section: 'keys',
    anchor: 'chave-publica',
    level: 'advanced',
  },

  // O seu sistema — O botão
  {
    label: 'Mostrar o botão no meu sistema',
    synonyms: ['site', 'aplicação', 'app', 'ligar', 'desligar', 'ativar', 'desativar', 'pausar'],
    section: 'tool',
    anchor: 'mostrar-no-site',
    level: 'basic',
  },
  {
    label: 'Páginas onde o botão não aparece',
    synonyms: [
      'esconder',
      'ocultar',
      'checkout',
      'login',
      'página',
      'url',
      'caminho',
      'testar endereço',
    ],
    section: 'tool',
    anchor: 'paginas-escondidas',
    level: 'advanced',
  },
  {
    label: 'Cor do botão',
    synonyms: [
      'cor',
      'azul',
      'verde',
      'vermelho',
      'laranja',
      'roxo',
      'marca',
      'identidade visual',
      'destaque',
      'hexadecimal',
      'código da cor',
    ],
    section: 'tool',
    anchor: 'cor-do-botao',
    level: 'basic',
  },
  {
    label: 'Canto do botão',
    synonyms: [
      'posição',
      'lado',
      'direita',
      'esquerda',
      'em cima',
      'embaixo',
      'onde fica',
      'lugar',
    ],
    section: 'tool',
    anchor: 'canto',
    level: 'basic',
  },
  {
    label: 'Ícone do botão',
    synonyms: ['ícone', 'desenho', 'símbolo', 'balão', 'inseto', 'lâmpada', 'estrela'],
    section: 'tool',
    anchor: 'icone',
    level: 'basic',
  },
  {
    label: 'Tamanho do botão',
    synonyms: ['grande', 'pequeno', 'maior', 'menor'],
    section: 'tool',
    anchor: 'tamanho',
    level: 'advanced',
  },
  {
    label: 'Formato do botão',
    synonyms: ['arredondado', 'redondo', 'quadrado', 'borda', 'cantos'],
    section: 'tool',
    anchor: 'formato',
    level: 'advanced',
  },
  {
    label: 'Cor do texto do botão',
    synonyms: ['contraste', 'letra', 'texto branco', 'texto preto'],
    section: 'tool',
    anchor: 'cor-do-texto',
    level: 'advanced',
  },
  {
    label: 'Sombra do botão',
    synonyms: ['sombra', 'relevo'],
    section: 'tool',
    anchor: 'sombra',
    level: 'advanced',
  },
  {
    label: 'Distância do canto',
    synonyms: [
      'margem',
      'espaço',
      'afastar',
      'deslocar',
      'subir o botão',
      'chat em cima',
      'borda',
      'pixels',
    ],
    section: 'tool',
    anchor: 'distancia',
    level: 'advanced',
  },
  {
    label: 'Botão no celular',
    synonyms: ['celular', 'mobile', 'telefone', 'esconder no celular', 'tela pequena'],
    section: 'tool',
    anchor: 'no-celular',
    level: 'advanced',
  },
  {
    label: 'Prévia do botão e do formulário',
    synonyms: ['ver como fica', 'preview', 'pré-visualizar', 'como aparece'],
    section: 'tool',
    anchor: 'previa',
    level: 'basic',
  },
  {
    label: 'Texto do botão',
    synonyms: ['nome do botão', 'rótulo', 'chamada', 'reportar', 'texto parado', 'dica'],
    section: 'tool',
    anchor: 'texto-do-botao',
    level: 'basic',
  },
  {
    label: 'Mostrar: texto, ícone ou os dois',
    synonyms: ['só o ícone', 'botão redondo', 'ícone sozinho', 'sem texto', 'sem ícone'],
    section: 'tool',
    anchor: 'so-o-icone',
    level: 'basic',
  },

  // O seu sistema — Domínios (abas: Aguardando, Autorizados, Bloqueados, Histórico e Proteção, onde ficam os limites)
  {
    label: 'Relatos aguardando liberação',
    synonyms: ['retido', 'pendente', 'liberar', 'permitir', 'não apareceu', 'sumiu', 'preso'],
    section: 'domains',
    anchor: 'aguardando-liberacao',
    level: 'basic',
  },
  {
    label: 'Domínios autorizados',
    synonyms: [
      'autorizar',
      'permitidos',
      'site',
      'aplicação',
      'app',
      'endereço',
      'localhost',
      'subdomínio',
      'cors',
    ],
    section: 'domains',
    anchor: 'autorizados',
    level: 'basic',
  },
  {
    label: 'Bloquear um domínio',
    synonyms: ['bloqueio', 'spam', 'recusar', 'abuso', 'site errado', 'bloqueados'],
    section: 'domains',
    anchor: 'bloqueados',
    level: 'basic',
  },
  {
    label: 'Domínios que mandaram relatos',
    synonyms: ['origem', 'de onde vêm', 'sites', 'quem usa a chave'],
    section: 'domains',
    anchor: 'dominios-observados',
    level: 'advanced',
  },
  {
    label: 'Limites de relatos',
    synonyms: ['spam', 'abuso', 'ataque', 'flood', 'robô', 'desafio', 'pausa'],
    section: 'domains',
    anchor: 'limites',
    level: 'advanced',
  },
  {
    label: 'Limite por pessoa',
    synonyms: ['spam', 'quem relata', 'a cada 10 minutos'],
    section: 'domains',
    anchor: 'limite-por-pessoa',
    level: 'advanced',
  },
  {
    label: 'Limite por conexão (IP)',
    synonyms: ['ip', 'spam', 'ataque', 'por hora'],
    section: 'domains',
    anchor: 'limite-por-ip',
    level: 'advanced',
  },
  {
    label: 'Limite por domínio',
    synonyms: ['site', 'spam', 'por hora'],
    section: 'domains',
    anchor: 'limite-por-dominio',
    level: 'advanced',
  },
  {
    label: 'Limite do projeto por hora',
    synonyms: ['total', 'spam', 'projeto inteiro'],
    section: 'domains',
    anchor: 'limite-do-projeto-hora',
    level: 'advanced',
  },
  {
    label: 'Limite do projeto por dia',
    synonyms: ['total', 'spam', '24 horas'],
    section: 'domains',
    anchor: 'limite-do-projeto-dia',
    level: 'advanced',
  },
  {
    label: 'Intervalo mínimo entre relatos',
    synonyms: ['30 segundos', 'espera', 'intervalo', 'spam'],
    section: 'domains',
    anchor: 'intervalo-minimo',
    level: 'advanced',
  },

  // O formulário — Tipos de relato
  {
    label: 'Tipos de relato',
    synonyms: ['defeito', 'melhoria', 'dúvida', 'bug', 'categoria', 'novo tipo', 'ordem'],
    section: 'reportTypes',
    anchor: 'tipos',
    level: 'basic',
  },
  {
    label: 'Perguntas de cada tipo',
    synonyms: ['perguntas', 'formulário', 'o que aconteceu', 'o que esperava', 'campos'],
    section: 'reportTypes',
    anchor: 'tipos',
    level: 'basic',
  },
  {
    label: 'Caixa de texto livre de cada tipo',
    synonyms: ['texto livre', 'descrição', 'texto dentro da caixa'],
    section: 'reportTypes',
    anchor: 'tipos',
    level: 'advanced',
  },
  {
    label: 'Coluna em que cada tipo entra',
    synonyms: ['coluna de entrada', 'primeira coluna', 'onde entra'],
    section: 'reportTypes',
    anchor: 'tipos',
    level: 'advanced',
  },
  {
    label: 'Cor e desenho de cada tipo',
    synonyms: ['ícone do tipo', 'cor do tipo'],
    section: 'reportTypes',
    anchor: 'tipos',
    level: 'advanced',
  },

  // O formulário — Formulário (os textos e o tema)
  {
    label: 'Tema do formulário',
    synonyms: ['claro', 'escuro', 'modo escuro', 'dark', 'automático', 'cores do formulário'],
    section: 'formTexts',
    anchor: 'tema',
    level: 'basic',
  },
  {
    label: 'Título do formulário',
    synonyms: ['cabeçalho', 'título'],
    section: 'formTexts',
    anchor: 'titulo-do-formulario',
    level: 'basic',
  },
  {
    label: 'Texto do botão de enviar',
    synonyms: ['enviar', 'submit', 'mandar'],
    section: 'formTexts',
    anchor: 'botao-enviar',
    level: 'basic',
  },
  {
    label: 'Texto da pergunta do título',
    synonyms: ['pergunta do título', 'resumo', 'assunto'],
    section: 'formTexts',
    anchor: 'texto-pergunta-titulo',
    level: 'advanced',
  },
  {
    label: 'Exemplo dentro da pergunta do título',
    synonyms: ['placeholder', 'dica', 'exemplo'],
    section: 'formTexts',
    anchor: 'exemplo-do-titulo',
    level: 'advanced',
  },
  {
    label: 'Nome do seletor de tipo',
    synonyms: ['o que é', 'seletor', 'rótulo do tipo'],
    section: 'formTexts',
    anchor: 'nome-do-seletor-de-tipo',
    level: 'advanced',
  },
  {
    label: 'Nome da caixa depois das perguntas',
    synonyms: ['mais detalhes', 'caixa de texto', 'descrição'],
    section: 'formTexts',
    anchor: 'nome-da-caixa',
    level: 'advanced',
  },
  {
    label: 'Texto da pergunta do nome',
    synonyms: ['como podemos te chamar', 'nome', 'pergunta do nome'],
    section: 'formTexts',
    anchor: 'pergunta-do-nome',
    level: 'advanced',
  },
  {
    label: 'Deixar a pessoa escolher o tipo do relato',
    synonyms: ['tipo', 'seletor de tipo', 'esconder tipo', 'defeito', 'melhoria'],
    section: 'formTexts',
    anchor: 'escolher-tipo',
    level: 'basic',
  },
  {
    label: 'Tipo pré-marcado',
    synonyms: ['tipo padrão', 'default', 'tipo de todos os relatos'],
    section: 'formTexts',
    anchor: 'tipo-pre-marcado',
    level: 'basic',
  },
  {
    label: 'Pergunta do título: opcional, obrigatória ou escondida',
    synonyms: ['título obrigatório', 'esconder título', 'sem título', 'título opcional'],
    section: 'formTexts',
    anchor: 'modo-do-titulo',
    level: 'advanced',
  },
  {
    label: 'Perguntar o nome de quem relata',
    synonyms: ['nome', 'assinar', 'assinatura'],
    section: 'formTexts',
    anchor: 'perguntar-nome',
    level: 'advanced',
  },

  // O formulário — Anexos
  {
    label: 'Aceitar anexo no relato',
    synonyms: ['anexo', 'print', 'upload', 'arquivo', 'imagem', 'mídia', 'foto'],
    section: 'media',
    anchor: 'aceitar-anexo',
    level: 'basic',
  },
  {
    label: 'Capturar a tela',
    synonyms: ['captura', 'screenshot', 'print da tela', 'tirar print'],
    section: 'media',
    anchor: 'capturar-tela',
    level: 'basic',
  },
  {
    label: 'Imagens: quantas e de que tamanho',
    synonyms: ['png', 'jpg', 'foto', 'tamanho máximo', 'mb', 'quantidade'],
    section: 'media',
    anchor: 'limites-imagem',
    level: 'advanced',
  },
  {
    label: 'Arquivos: quantos e de que tamanho',
    synonyms: ['pdf', 'documento', 'formatos', 'extensões', 'planilha', 'log'],
    section: 'media',
    anchor: 'limites-arquivo',
    level: 'advanced',
  },
  {
    label: 'Anexar ao responder o time',
    synonyms: ['resposta', 'pedido de informação', 'mandar print depois'],
    section: 'media',
    anchor: 'anexo-na-resposta',
    level: 'advanced',
  },
  {
    label: 'Anexar ao reabrir',
    synonyms: ['reabertura', 'voltou a acontecer'],
    section: 'media',
    anchor: 'anexo-na-reabertura',
    level: 'advanced',
  },
  {
    label: 'Aceitar imagem',
    synonyms: ['print', 'foto', 'screenshot', 'imagem'],
    section: 'media',
    anchor: 'anexo-imagem',
    level: 'basic',
  },
  {
    label: 'Aceitar arquivo e os formatos',
    synonyms: ['pdf', 'log', 'planilha', 'documento', 'formatos', 'arquivo'],
    section: 'media',
    anchor: 'anexo-arquivo',
    level: 'basic',
  },

  // O acompanhamento — Andamento público
  {
    label: 'Etapas que quem relatou acompanha',
    synonyms: ['jornada', 'status público', 'etapas', 'progresso', 'texto da etapa', 'nova etapa'],
    section: 'stages',
    anchor: 'etapas',
    level: 'basic',
  },

  // O acompanhamento — Ciclo
  {
    label: 'Quando o relato encerra',
    synonyms: ['encerrar', 'fechar', 'concluir', 'resolver', 'última coluna', 'botão de concluir'],
    section: 'cycle',
    anchor: 'encerramento',
    level: 'basic',
  },
  {
    label: 'Esperar antes de quem relatou ver',
    synonyms: ['atraso', 'demora', 'janela', 'desfazer', 'minutos', 'arrastei errado'],
    section: 'cycle',
    anchor: 'espera',
    level: 'advanced',
  },
  {
    label: 'Deixar quem relatou reabrir',
    synonyms: ['reabrir', 'reabertura', 'não resolveu', 'voltou', 'coluna do reaberto'],
    section: 'cycle',
    anchor: 'reabrir',
    level: 'basic',
  },
  {
    label: 'Pedir uma nota ao confirmar',
    synonyms: ['satisfação', 'avaliação', 'nota', 'estrelas', 'nps', 'exigir nota'],
    section: 'cycle',
    anchor: 'nota',
    level: 'advanced',
  },
  {
    label: 'Devolver o relato pedindo informação',
    synonyms: ['pedir informação', 'falta informação', 'prazo', 'lembrete', 'encerrar sozinho'],
    section: 'cycle',
    anchor: 'pedir-informacao',
    level: 'basic',
  },
  {
    label: 'Deixar o time arquivar relato',
    synonyms: ['arquivar', 'arquivo', 'tirar da fila'],
    section: 'cycle',
    anchor: 'arquivar-relato',
    level: 'advanced',
  },

  // O acompanhamento — Quem relata
  {
    label: 'Mensagem de confirmação',
    synonyms: ['sucesso', 'obrigado', 'agradecimento', 'depois de enviar', 'protocolo'],
    section: 'identity',
    anchor: 'confirmacao',
    level: 'basic',
  },
  {
    label: 'Topo da página de acompanhamento',
    synonyms: ['acompanhamento', 'boas-vindas', 'página do relato', 'texto do acompanhamento'],
    section: 'identity',
    anchor: 'topo-do-acompanhamento',
    level: 'advanced',
  },
  {
    label: 'Aviso de que o relato pode virar público',
    synonyms: ['aviso', 'público', 'privacidade', 'lista pública', 'lgpd'],
    section: 'identity',
    anchor: 'aviso-publico',
    level: 'advanced',
  },
  {
    label: 'Como a pessoa é reconhecida',
    synonyms: ['protocolo', 'código pessoal', 'identidade', 'login', 'sso', 'identificar'],
    section: 'identity',
    anchor: 'reconhecimento',
    level: 'basic',
  },
  {
    label: 'Quem pode ver os relatos',
    synonyms: ['privado', 'público', 'anônimo', 'visibilidade', 'transparência', 'lista pública'],
    section: 'identity',
    anchor: 'visibilidade',
    level: 'basic',
  },

  // O quadro — Colunas
  {
    label: 'O que quem relatou vê em cada coluna',
    synonyms: ['ligação', 'ligar coluna', 'mapear', 'coluna e etapa'],
    section: 'states',
    anchor: 'colunas-no-andamento',
    level: 'basic',
  },
  {
    label: 'Colunas do quadro',
    synonyms: ['status', 'estados', 'kanban', 'ordem das colunas', 'renomear coluna'],
    section: 'states',
    level: 'basic',
  },
  {
    label: 'Nova coluna',
    synonyms: ['criar coluna', 'adicionar coluna'],
    section: 'states',
    anchor: 'nova-coluna',
    level: 'basic',
  },
  {
    label: 'Quantos dias a última coluna mostra',
    synonyms: ['feito', 'concluídos', 'esconder antigos', 'limpar quadro'],
    section: 'states',
    anchor: 'ultima-coluna',
    level: 'advanced',
  },
  {
    label: 'Destaque do prazo',
    synonyms: ['prazo', 'vencimento', 'data limite', 'amarelo', 'atrasado'],
    section: 'states',
    anchor: 'prazo-perto',
    level: 'advanced',
  },

  // O quadro — Prioridades
  {
    label: 'Prioridades',
    synonyms: ['urgência', 'importância', 'alta', 'baixa', 'crítica'],
    section: 'priorities',
    anchor: 'prioridades',
    level: 'basic',
  },
  {
    label: 'Nova prioridade',
    synonyms: ['criar prioridade', 'adicionar prioridade'],
    section: 'priorities',
    anchor: 'nova-prioridade',
    level: 'advanced',
  },

  // O quadro — Etiquetas
  {
    label: 'Etiquetas',
    synonyms: ['tags', 'labels', 'marcadores', 'categorias', 'renomear etiqueta'],
    section: 'labels',
    level: 'basic',
  },
  {
    label: 'Nova etiqueta',
    synonyms: ['criar etiqueta', 'adicionar etiqueta', 'tag'],
    section: 'labels',
    anchor: 'nova-etiqueta',
    level: 'advanced',
  },

  // O quadro — Sprints
  {
    label: 'Trabalhar em sprints',
    synonyms: ['scrum', 'ciclos', 'iteração', 'ligar sprints', 'duração da sprint', 'semanas'],
    section: 'sprints',
    anchor: 'sprints-ligadas',
    level: 'basic',
  },

  // O time — Membros
  {
    label: 'Time do projeto',
    synonyms: ['pessoas', 'usuários', 'papel', 'administrador', 'remover pessoa'],
    section: 'members',
    anchor: 'time-do-projeto',
    level: 'basic',
  },
  {
    label: 'Convidar pessoas',
    synonyms: ['convite', 'e-mail', 'adicionar pessoa', 'chamar o time'],
    section: 'members',
    anchor: 'convidar',
    level: 'basic',
  },
  {
    label: 'Prazo do convite',
    synonyms: ['validade', 'expirar', 'dias do convite'],
    section: 'members',
    anchor: 'prazo-do-convite',
    level: 'advanced',
  },

  // O time — Projeto
  {
    label: 'Nome do projeto',
    synonyms: ['renomear', 'nome'],
    section: 'settings',
    anchor: 'nome-do-projeto',
    level: 'basic',
  },
  {
    label: 'Identificador do projeto',
    synonyms: ['id', 'guid', 'endereço do painel'],
    section: 'settings',
    anchor: 'identificador',
    level: 'advanced',
  },
  {
    label: 'Arquivar projeto',
    synonyms: ['arquivar', 'desativar projeto', 'encerrar projeto', 'apagar projeto'],
    section: 'settings',
    anchor: 'arquivar-projeto',
    level: 'advanced',
  },
]

/** O que a busca devolve: a opcao, com a tela e a area dela. */
export interface SettingMatch {
  entry: SettingEntry
  screen: ConsoleSection
  area: ConfigArea | undefined
  /** `tela#campo`, relativo ao projeto. */
  to: string
}

/** Sem acento e sem caixa: "Domínio", "dominio" e "DOMINIO" sao a mesma busca. */
export function normalizeSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
}

/** O endereco de uma opcao, relativo ao projeto: `tool#cor-do-botao`. */
export function settingTarget(entry: SettingEntry): string {
  const path = sectionByKey(entry.section)?.path ?? ''
  return entry.anchor ? `${path}#${entry.anchor}` : path
}

/**
 * Procura no indice. **Cada palavra digitada precisa aparecer** — no nome, num
 * sinonimo, no nome da tela ou da area —, e o nome vale mais que o sinonimo: "cor"
 * traz "Cor do botão" antes de "Cor e desenho de cada tipo", e as duas antes do que so
 * tem "cor" num sinonimo. No empate, o basico vem antes.
 */
export function searchSettings(query: string, limit = 8): SettingMatch[] {
  const palavras = normalizeSearch(query).split(/\s+/).filter(Boolean)
  if (palavras.length === 0) return []

  const achados: Array<SettingMatch & { pontos: number; ordem: number }> = []

  SETTINGS_INDEX.forEach((entry, ordem) => {
    const screen = sectionByKey(entry.section)
    if (!screen) return
    const area = areaOfSection(entry.section)

    const nome = normalizeSearch(entry.label)
    const sinonimos = entry.synonyms.map(normalizeSearch)
    const lugar = normalizeSearch(`${screen.label} ${area?.label ?? ''}`)

    let pontos = 0
    for (const palavra of palavras) {
      if (comecaPalavra(nome, palavra)) pontos += 6
      else if (nome.includes(palavra)) pontos += 4
      else if (sinonimos.some((sinonimo) => comecaPalavra(sinonimo, palavra))) pontos += 3
      else if (sinonimos.some((sinonimo) => sinonimo.includes(palavra))) pontos += 2
      else if (lugar.includes(palavra)) pontos += 1
      else return
    }
    if (entry.level === 'basic') pontos += 0.5

    achados.push({ entry, screen, area, to: settingTarget(entry), pontos, ordem })
  })

  return achados
    .sort((a, b) => b.pontos - a.pontos || a.ordem - b.ordem)
    .slice(0, limit)
    .map(({ entry, screen, area, to }) => ({ entry, screen, area, to }))
}

/** A palavra comeca o texto ou uma das palavras dele: "cor" em "a cor", e nao em "decorar". */
function comecaPalavra(texto: string, palavra: string): boolean {
  return texto.startsWith(palavra) || texto.includes(` ${palavra}`)
}
