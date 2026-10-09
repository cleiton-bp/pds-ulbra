import { describe, expect, it } from 'vitest'
import { acentuar, describeError, PanelError } from '@/data/errors'

/**
 * O QUE ESTES TESTES TRAVAM, E POR QUE.
 *
 * **O 403 repete a mensagem da API, e nao ganha frase propria.** Uma frase fixa
 * para o 403 ("so quem administra…") chegou a existir e estava errada: esta
 * funcao serve tambem ao quadro e a pagina de acompanhamento, e a API usa 403
 * para regra de negocio — projeto arquivado, endereco nao autorizado, reabertura
 * recusada, pedido de informacao que nao cabe. Com a frase fixa, quem relatava
 * lia que precisava administrar o projeto, e a propria dona lia o mesmo ao pedir
 * informacao a quem nao aceita pergunta.
 *
 * **As frases proprias falam com qualquer um.** Rede caida, servidor fora e erro
 * sem mensagem viram frase do painel — e a mesma frase chega a quem relata, no
 * quadro do site e na pagina de acompanhamento. Por isso nenhuma delas pode usar a
 * lingua do time (card, coluna, quadro): quem relata nao sabe o que e isso.
 *
 * **O que a API diz chega acentuado.** A API escreve sem acento por convencao da
 * casa, e o painel acentua no caminho — so o que tem uma leitura. O perigo e o
 * contrario do esquecimento: "esta etapa" virar "está etapa", "e senha" virar "é
 * senha", "E-mail" virar "É-mail". Os casos de baixo sao frases de verdade da API.
 */
describe('describeError', () => {
  it('o 403 diz o que a API disse, acentuado', () => {
    expect(
      describeError(new PanelError('Este projeto esta arquivado e nao aceita relatos novos.', 403)),
    ).toBe('Este projeto está arquivado e não aceita relatos novos.')
  })

  it('os outros códigos também', () => {
    expect(describeError(new PanelError('Ja existe um projeto com este nome na conta.', 409))).toBe(
      'Já existe um projeto com este nome na conta.',
    )
  })

  it('rede caída não fala de API', () => {
    expect(describeError(new PanelError('Falha de rede ao contatar a API.', 0))).toBe(
      'Sem conexão com o servidor agora. Confira a internet e tente de novo — nada se perdeu.',
    )
  })

  it('rede caída, com a ação: diz o que não deu, e o que conferir', () => {
    expect(
      describeError(new PanelError('Falha de rede ao contatar a API.', 0), 'mudar a prioridade'),
    ).toBe(
      'Não deu para mudar a prioridade: sem conexão com o servidor agora. Confira a internet e tente de novo.',
    )
  })

  it('erro do servidor diz qual ação falhou, quando a tela conta', () => {
    expect(describeError(new PanelError('Erro interno.', 500), 'mudar a prioridade')).toBe(
      'Não deu para mudar a prioridade agora. Tente de novo.',
    )
  })

  it('erro do servidor sem a ação: a frase genérica, e não "Erro interno."', () => {
    expect(describeError(new PanelError('Erro ao processar a requisicao.', 503))).toBe(
      'Não deu para concluir agora. Tente de novo.',
    )
  })

  // "Erro 404." e o que o cliente escreve quando a resposta veio sem corpo: nao ha
  // mensagem da API para repetir, e o numero nao diz nada a quem le.
  it('resposta sem mensagem ("Erro 404.") não mostra o número', () => {
    expect(describeError(new PanelError('Erro 404.', 404))).toBe(
      'Não deu para concluir agora. Tente de novo.',
    )
    expect(describeError(new PanelError('Erro 404.', 404), 'abrir o card')).toBe(
      'Não deu para abrir o card agora. Tente de novo.',
    )
  })

  // A acao e para o que nao e culpa de ninguem na tela: a recusa da API ja diz a
  // regra, e "Nao deu para mudar a prioridade" por cima dela esconderia o porque.
  it('a recusa da API ignora a ação: a regra é a mensagem', () => {
    expect(
      describeError(
        new PanelError('Esta prioridade esta aposentada e nao e mais oferecida.', 409),
        'mudar a prioridade',
      ),
    ).toBe('Esta prioridade está aposentada e não é mais oferecida.')
  })

  it('erro que não veio da camada de dados vira a frase genérica', () => {
    expect(describeError(new Error('qualquer coisa'))).toBe(
      'Não deu para concluir agora. Tente de novo.',
    )
    expect(describeError('texto solto', 'salvar o nome')).toBe(
      'Não deu para salvar o nome agora. Tente de novo.',
    )
  })

  it('nenhuma frase própria usa a língua do time: ela chega também a quem relata', () => {
    const frases = [
      describeError(new PanelError('x', 0)),
      describeError(new PanelError('x', 0), 'enviar a sua resposta'),
      describeError(new PanelError('x', 500)),
      describeError(new PanelError('x', 500), 'enviar a sua resposta'),
      describeError(new Error('x')),
    ]

    for (const frase of frases) {
      expect(frase).not.toMatch(/\b(card|cards|time|coluna|colunas|quadro|API)\b/i)
    }
  })
})

describe('acentuar', () => {
  it('as palavras de uma leitura só, mantendo a maiúscula do começo', () => {
    expect(acentuar('Nao ha nenhuma pergunta aberta neste relato.')).toBe(
      'Não há nenhuma pergunta aberta neste relato.',
    )
    expect(acentuar('O * so vale no comeco, como em *.site.com.')).toBe(
      'O * só vale no começo, como em *.site.com.',
    )
  })

  it('"é" e "está" nas construções que a API escreve', () => {
    expect(acentuar('Esse formato de arquivo nao e aceito.')).toBe(
      'Esse formato de arquivo não é aceito.',
    )
    expect(acentuar('Este estado esta aposentado e nao recebe card novo.')).toBe(
      'Este estado está aposentado e não recebe card novo.',
    )
    expect(acentuar('O nome do projeto e obrigatorio.')).toBe('O nome do projeto é obrigatório.')
    expect(acentuar('Essa pessoa e dona do projeto.')).toBe('Essa pessoa é dona do projeto.')
    // No comeco da frase, depois do ponto e depois dos dois-pontos, "e" e sempre o verbo.
    expect(acentuar('Escreva o motivo. E o que quem relatou vai ler.')).toBe(
      'Escreva o motivo. É o que quem relatou vai ler.',
    )
    expect(acentuar('Escolha o desfecho desta etapa: e nela que o relato termina.')).toBe(
      'Escolha o desfecho desta etapa: é nela que o relato termina.',
    )
    expect(acentuar('Este estado e a entrada de algum tipo de relato.')).toBe(
      'Este estado é a entrada de algum tipo de relato.',
    )
  })

  // "Nao e" no comeco da frase chegava como "Não e": a construcao so conhecia o
  // minusculo.
  it('a construção vale também com a maiúscula do começo', () => {
    expect(acentuar('Nao e possivel apagar agora.')).toBe('Não é possível apagar agora.')
    expect(acentuar('Ja e tarde.')).toBe('Já é tarde.')
  })

  it('"lê", "dá para", "dê" e o pronome preso ao verbo', () => {
    expect(acentuar('Escolha o desfecho: quem le precisa saber como terminou.')).toBe(
      'Escolha o desfecho: quem lê precisa saber como terminou.',
    )
    expect(acentuar('Nao da para mover agora.')).toBe('Não dá para mover agora.')
    expect(acentuar('De um titulo ao card.')).toBe('Dê um título ao card.')
    expect(acentuar('De um nome a sprint.')).toBe('Dê um nome à sprint.')
    expect(acentuar('Escolha outro destino antes de aposenta-lo.')).toBe(
      'Escolha outro destino antes de aposentá-lo.',
    )
    expect(acentuar('Aponte esses estados para outra etapa antes de remove-la.')).toBe(
      'Aponte esses estados para outra etapa antes de removê-la.',
    )
    expect(acentuar('Este convite venceu. Peca um novo a quem convidou.')).toBe(
      'Este convite venceu. Peça um novo a quem convidou.',
    )
  })

  // As de duas leituras ficam como vieram fora das construcoes conhecidas: errar o
  // acento e pior do que deixar sem.
  it('palavra de duas leituras fica como veio', () => {
    // "esta" antes de nome e o demonstrativo, e nao o verbo.
    expect(acentuar('Escreva uma frase explicando esta etapa para quem relatou.')).toBe(
      'Escreva uma frase explicando esta etapa para quem relatou.',
    )
    expect(acentuar('Esta coluna esta aposentada.')).toBe('Esta coluna está aposentada.')
    // "e" no meio da frase e a conjuncao.
    expect(acentuar('Informe apenas o dominio, sem usuario e senha.')).toBe(
      'Informe apenas o domínio, sem usuário e senha.',
    )
    // "da" e "de" sao preposicao.
    expect(acentuar('A frase da etapa pode ter ate 200 caracteres.')).toBe(
      'A frase da etapa pode ter até 200 caracteres.',
    )
    // "por" e preposicao, e nao "pôr".
    expect(acentuar('Informe por quantos dias o convite vale.')).toBe(
      'Informe por quantos dias o convite vale.',
    )
  })

  it('o "E" de "E-mail" é letra da palavra, e não o verbo', () => {
    expect(acentuar('E-mail do convite enviado.')).toBe('E-mail do convite enviado.')
    expect(acentuar('Enviado. E-mail na fila.')).toBe('Enviado. E-mail na fila.')
    expect(acentuar('Confira: e-mail sem arroba.')).toBe('Confira: e-mail sem arroba.')
    expect(acentuar('Informe o endereco que e-mail nenhum recusou.')).toBe(
      'Informe o endereço que e-mail nenhum recusou.',
    )
  })

  // Conferidas rodando `acentuar` em todas as mensagens da API em 08/10: estas
  // chegavam sem acento a uma tela — as duas primeiras, a de quem relata.
  it('as palavras que faltavam na lista', () => {
    expect(
      acentuar('Nao ha resposta sua dos ultimos 10 minutos neste relato para prender o arquivo.'),
    ).toBe('Não há resposta sua dos últimos 10 minutos neste relato para prender o arquivo.')
    expect(
      acentuar('Nao ha armazenamento configurado nesta instalacao para guardar ou ler midia.'),
    ).toBe('Não há armazenamento configurado nesta instalação para guardar ou ler mídia.')
    expect(acentuar('Escolha o codigo pessoal, ou publique como anonimo.')).toBe(
      'Escolha o código pessoal, ou publique como anônimo.',
    )
    expect(acentuar('Informe como a opcao de aceitar duvidas vem marcada.')).toBe(
      'Informe como a opção de aceitar dúvidas vem marcada.',
    )
    expect(acentuar('Informe se o botao de capturar a tela aparece.')).toBe(
      'Informe se o botão de capturar a tela aparece.',
    )
    expect(acentuar('Informe a quantidade maxima de imagens.')).toBe(
      'Informe a quantidade máxima de imagens.',
    )
    expect(acentuar('A direcao (dir) vai junto da ordenacao (sort).')).toBe(
      'A direção (dir) vai junto da ordenação (sort).',
    )
    expect(acentuar('Nao foi possivel gerar um protocolo unico.')).toBe(
      'Não foi possível gerar um protocolo único.',
    )
    expect(acentuar('Video nao e mais aceito como anexo.')).toBe(
      'Vídeo não é mais aceito como anexo.',
    )
    expect(acentuar('Informe o tipo pre-marcado.')).toBe('Informe o tipo pré-marcado.')
  })

  it('texto que já veio com acento não muda', () => {
    const certo = 'Você não está no time: peça um convite a quem administra.'
    expect(acentuar(certo)).toBe(certo)
  })
})
