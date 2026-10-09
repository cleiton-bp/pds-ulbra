/**
 * Erro unico da camada de dados. A tela decide pelo `status`, e nunca pelo texto
 * da mensagem.
 */
export class PanelError extends Error {
  /** Codigo HTTP. 0 quando a falha foi de rede, antes da resposta. */
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'PanelError'
    this.status = status
  }
}

export function isPanelError(error: unknown): error is PanelError {
  return error instanceof PanelError
}

/**
 * A falha que se repetiria igual: a API respondeu, e respondeu que nao — um 4xx,
 * menos o 408 (demorou demais) e o 429 (muitas tentativas), que passam sozinhos.
 *
 * Rede caida (status 0) e erro do servidor (5xx) **nao** sao definitivos: tentar de
 * novo daqui a pouco pode dar certo. Nem o erro que nao veio da camada de dados, que
 * nao diz o que foi.
 */
export function isDefinitiveError(error: unknown): boolean {
  if (!isPanelError(error)) return false

  const { status } = error
  return status >= 400 && status < 500 && status !== 408 && status !== 429
}

/**
 * O texto de uma falha, como a tela mostra.
 *
 * Mensagem e status bastam enquanto a decisao da tela couber num numero (401
 * desloga, 404 nao encontrado, 409 nome repetido, 0 rede caida). O sinal de que
 * a hora de um codigo proprio chegou e o primeiro `if` que le a **mensagem** para
 * decidir — comparar texto quebra quando alguem corrige uma virgula no C#.
 *
 * **Tres falhas nao repetem o que veio**, porque o que veio nao serve a quem le:
 *
 * - **rede caida** — "Falha de rede ao contatar a API" fala de uma peca que o time
 *   nao conhece. A frase diz o que conferir e que nada se perdeu;
 * - **erro do servidor (5xx)** — "Erro interno." nao diz o que falhou nem o que
 *   fazer. Com `acao`, diz qual foi a acao ("Nao deu para mudar a prioridade");
 * - **erro que nao veio da camada de dados** — nao diz o que foi.
 *
 * O resto e a mensagem da API, que explica a regra ("Ja existe um projeto com este
 * nome"), **acentuada aqui** — ver `acentuar`.
 *
 * @param acao O que a pessoa tentava fazer, no infinitivo ("mudar a prioridade").
 *   Entra so nas falhas que nao sao dela: rede e servidor.
 */
export function describeError(error: unknown, acao?: string): string {
  if (isPanelError(error)) {
    if (error.status === 0) {
      return acao
        ? `Não deu para ${acao}: sem conexão com o servidor agora. Confira a internet e tente de novo.`
        : 'Sem conexão com o servidor agora. Confira a internet e tente de novo — nada se perdeu.'
    }

    // "Erro 404." e o que o cliente HTTP escreve quando a resposta veio sem corpo:
    // nao ha mensagem da API para repetir.
    if (error.status >= 500 || /^Erro \d+\.$/.test(error.message)) return generica(acao)

    return acentuar(error.message)
  }

  return generica(acao)
}

function generica(acao?: string): string {
  return acao
    ? `Não deu para ${acao} agora. Tente de novo.`
    : 'Não deu para concluir agora. Tente de novo.'
}

/**
 * As palavras que a API escreve sem acento e que so tem uma leitura.
 *
 * **A API continua sem acento**, por convencao da casa: o texto e acentuado aqui, no
 * caminho para a tela. A lista foi conferida contra as mensagens da API de 07/10 (e
 * de novo em 08/10, rodando `acentuar` em todas elas: faltavam "instalacao",
 * "ultimos", "anonimo" e outras) e so tem palavra sem ambiguidade — "esta" e "e"
 * ficam de fora, e sao tratadas pelas construcoes de `VERBOS`.
 */
const PALAVRAS: Record<string, string> = {
  acao: 'ação',
  alguem: 'alguém',
  anonimo: 'anônimo',
  area: 'área',
  ate: 'até',
  botao: 'botão',
  codigo: 'código',
  comeco: 'começo',
  comentario: 'comentário',
  concluida: 'concluída',
  conexao: 'conexão',
  configuracao: 'configuração',
  conteudo: 'conteúdo',
  descricao: 'descrição',
  desfaca: 'desfaça',
  direcao: 'direção',
  dominio: 'domínio',
  dominios: 'domínios',
  duvidas: 'dúvidas',
  endereco: 'endereço',
  enderecos: 'endereços',
  entao: 'então',
  estao: 'estão',
  ha: 'há',
  historia: 'história',
  historico: 'histórico',
  informacao: 'informação',
  instalacao: 'instalação',
  invalida: 'inválida',
  invalido: 'inválido',
  ja: 'já',
  maxima: 'máxima',
  maximo: 'máximo',
  midia: 'mídia',
  minimo: 'mínimo',
  nao: 'não',
  ninguem: 'ninguém',
  numero: 'número',
  obrigatoria: 'obrigatória',
  obrigatorio: 'obrigatório',
  opcao: 'opção',
  operacao: 'operação',
  ordenacao: 'ordenação',
  padrao: 'padrão',
  pagina: 'página',
  permissao: 'permissão',
  posicao: 'posição',
  possivel: 'possível',
  // O prefixo: "pre-marcado" e "pré-marcado".
  pre: 'pré',
  proximo: 'próximo',
  publica: 'pública',
  publico: 'público',
  referencia: 'referência',
  requisicao: 'requisição',
  responsavel: 'responsável',
  sao: 'são',
  sessao: 'sessão',
  so: 'só',
  tambem: 'também',
  titulo: 'título',
  transacao: 'transação',
  ultima: 'última',
  ultimas: 'últimas',
  ultimo: 'último',
  ultimos: 'últimos',
  unica: 'única',
  unico: 'único',
  usuario: 'usuário',
  valido: 'válido',
  versao: 'versão',
  video: 'vídeo',
  vinculo: 'vínculo',
  voce: 'você',
}

/**
 * "E" e "esta" tem duas leituras, e o acento depende de quem vem antes ou depois.
 * Aqui so as construcoes que aparecem nas mensagens da API — "nao e aceito", "esta
 * arquivado", "e obrigatorio" —, cada uma com uma leitura so. Rodam **depois** das
 * palavras: "nao e" ja chega como "não e", e "Nao e" como "Não e".
 *
 * O `(?!-)` e o "e-mail": o "E" do comeco de "E-mail do convite..." e uma letra da
 * palavra, e nao o verbo.
 */
const VERBOS: Array<[RegExp, string]> = [
  // "esta" antes de estado ou lugar e verbo; antes de nome ("esta etapa") nao.
  [
    /\besta (?=(?:arquivad|aposentad|encerrad|autorizad|configurad|vazi|fechad|em |no |na |sendo |acontecendo|mais ))/g,
    'está ',
  ],
  [/\b([Nn]ão|[Jj]á|[Ss]ó|que|ela|ele|pessoa|convite|relato|tipo) e\b(?!-)/g, '$1 é'],
  [/\bestado e (?=a entrada)/g, 'estado é '],
  [/\be (?=obrigat)/g, 'é '],
  // No comeco da frase, "E o que..." e ": e nela que..." sao sempre o verbo.
  [/(^|[.:] )e\b(?!-)/g, '$1é'],
  [/(^|\. )E\b(?!-)/g, '$1É'],
  [/\ble\b/g, 'lê'],
  // O pronome preso ao verbo: "aposenta-lo" e "aposentá-lo", "remove-la" e "removê-la".
  [/\b([a-z]+)a-(l[oa]s?)\b/g, '$1á-$2'],
  [/\b([a-z]+)e-(l[oa]s?)\b/g, '$1ê-$2'],
  // "da" e "de" sao preposicao quase sempre; o verbo so nestas.
  [/\b([Nn]ão) da para\b/g, '$1 dá para'],
  [/^De (?=um título)/, 'Dê '],
  [/^De um nome a sprint\b/, 'Dê um nome à sprint'],
  // "Peca" e "pecar" fora daqui; nas mensagens, e sempre o convite que se pede.
  [/\bPeca um novo\b/g, 'Peça um novo'],
]

/** Devolve o texto da API com os acentos que ela deixa de fora. */
export function acentuar(texto: string): string {
  const palavras = texto.replace(/\b[A-Za-z]+\b/g, (palavra) => {
    const certa = PALAVRAS[palavra.toLowerCase()]
    if (!certa) return palavra
    // Mantem a maiuscula do comeco: "Nao ha" vira "Não há", e nao "não há".
    return palavra[0] === palavra[0]?.toUpperCase()
      ? certa.charAt(0).toUpperCase() + certa.slice(1)
      : certa
  })

  return VERBOS.reduce((atual, [padrao, troca]) => atual.replace(padrao, troca), palavras)
}
