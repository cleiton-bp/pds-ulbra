import type {
  CardColor,
  ProjectReportTypeViewModel,
  ProjectStateViewModel,
  ReportTypeIcon,
  SaveProjectReportTypeRequest,
  WidgetReportTypeViewModel,
} from '@/contracts'

/**
 * O tipo aberto na tela, como esta escrito agora — o rascunho de um item da lista.
 *
 * **Mora na tela, e nao dentro do editor**: e a tela que decide se fechar o item ou
 * abrir outro precisa perguntar antes (`draftChanged`), e e ela que manda o rascunho a
 * previa. Com o estado preso no editor, a tela so saberia do rascunho pelo aviso dele.
 */
export interface TypeDraft {
  nome: string
  cor: CardColor
  desenho: ReportTypeIcon
  perguntas: QuestionDraft[]
  caixa: boolean
  textoDaCaixa: string
  coluna: string | null
}

/** Uma pergunta no editor. O `id` e so da tela: segura o foco e a chave ao reordenar. */
export interface QuestionDraft {
  id: number
  texto: string
}

let proximaPergunta = 0

/** Uma pergunta com `id` novo: unico na pagina inteira, e nao so no tipo aberto. */
export function newQuestion(texto = ''): QuestionDraft {
  proximaPergunta += 1
  return { id: proximaPergunta, texto }
}

/** O rascunho de um tipo salvo, ou o de um tipo novo — sem `tipo`. */
export function draftFrom(tipo?: ProjectReportTypeViewModel): TypeDraft {
  return {
    nome: tipo?.Name ?? '',
    cor: tipo?.Color ?? 'Gray',
    desenho: tipo?.Icon ?? 'Other',
    perguntas: (tipo?.Questions ?? []).map((texto) => newQuestion(texto)),
    // O tipo novo comeca com a caixa: e o jeito mais simples de pedir alguma coisa.
    caixa: tipo?.ShowsTextBox ?? true,
    textoDaCaixa: tipo?.TextBoxPrompt ?? '',
    coluna: tipo?.InitialStatePublicId ?? null,
  }
}

/**
 * O rascunho difere do que esta salvo (ou do tipo novo em branco). Compara o texto como
 * esta escrito, e nao aparado: um espaco a mais tambem e mudanca que se perderia.
 */
export function draftChanged(draft: TypeDraft, tipo?: ProjectReportTypeViewModel): boolean {
  const inicial = draftFrom(tipo)
  return (
    draft.nome !== inicial.nome ||
    draft.cor !== inicial.cor ||
    draft.desenho !== inicial.desenho ||
    draft.caixa !== inicial.caixa ||
    draft.textoDaCaixa !== inicial.textoDaCaixa ||
    draft.coluna !== inicial.coluna ||
    draft.perguntas.length !== inicial.perguntas.length ||
    draft.perguntas.some((pergunta, index) => pergunta.texto !== inicial.perguntas[index]?.texto)
  )
}

/** As perguntas que pedem alguma coisa: a em branco nao vai, e a API a descartaria. */
export function filledQuestions(draft: TypeDraft): string[] {
  return draft.perguntas.map((item) => item.texto.trim()).filter((texto) => texto.length > 0)
}

/**
 * **O salvar diz o que falta antes de a API dizer** — sem nome, sem nada a perguntar,
 * pergunta repetida, caixa sem texto —, e a API continua conferindo, porque quem chama a
 * rota direto nao passa por aqui.
 */
export function checkDraft(draft: TypeDraft): { incompleto: boolean; aviso: string | null } {
  const preenchidas = filledQuestions(draft)
  // Sem diferenciar maiuscula, como a API confere.
  const repetida = preenchidas.find(
    (texto, index) =>
      preenchidas.findIndex((outra) => outra.toLowerCase() === texto.toLowerCase()) !== index,
  )
  const semNada = preenchidas.length === 0 && !draft.caixa
  const semTextoDaCaixa = draft.caixa && draft.textoDaCaixa.trim().length === 0

  return {
    incompleto:
      draft.nome.trim().length === 0 || semNada || repetida !== undefined || semTextoDaCaixa,
    aviso: semNada
      ? 'O tipo precisa pedir alguma coisa: escreva uma pergunta, ou mostre a caixa de texto livre.'
      : repetida !== undefined
        ? `A pergunta “${repetida}” aparece duas vezes.`
        : null,
  }
}

/** O pedido de salvar: o tipo inteiro, como a API grava. */
export function requestFrom(draft: TypeDraft): SaveProjectReportTypeRequest {
  const textoDaCaixa = draft.textoDaCaixa.trim()
  return {
    Name: draft.nome.trim(),
    Color: draft.cor,
    Icon: draft.desenho,
    Questions: filledQuestions(draft),
    ShowsTextBox: draft.caixa,
    // Com a caixa escondida, o texto vai assim mesmo: fica guardado para quando ela
    // voltar, como a API faz.
    TextBoxPrompt: textoDaCaixa ? textoDaCaixa : null,
    InitialStatePublicId: draft.coluna,
  }
}

/** O tipo como a ferramenta o desenha, a partir do rascunho — para a previa. */
export function previewTypeFrom(draft: TypeDraft, publicId: string): WidgetReportTypeViewModel {
  return {
    PublicId: publicId,
    Name: draft.nome.trim() || 'Novo tipo',
    Icon: draft.desenho,
    Questions: filledQuestions(draft),
    ShowsTextBox: draft.caixa,
    TextBoxPrompt: draft.caixa ? draft.textoDaCaixa.trim() || null : null,
  }
}

/**
 * Os tipos como a ferramenta os desenha: os ativos, na ordem da lista, com o tipo aberto
 * por cima do salvo — ou no fim, se e novo ou esta desativado.
 */
export function previewTypes(
  tipos: ProjectReportTypeViewModel[] | null,
  rascunho: WidgetReportTypeViewModel | null,
): WidgetReportTypeViewModel[] {
  const ativos: WidgetReportTypeViewModel[] = (tipos ?? [])
    .filter((tipo) => tipo.IsActive)
    .map((tipo) => ({
      PublicId: tipo.PublicId,
      Name: tipo.Name,
      Icon: tipo.Icon,
      Questions: tipo.Questions,
      ShowsTextBox: tipo.ShowsTextBox,
      TextBoxPrompt: tipo.ShowsTextBox ? tipo.TextBoxPrompt : null,
    }))
  if (!rascunho) return ativos
  return ativos.some((tipo) => tipo.PublicId === rascunho.PublicId)
    ? ativos.map((tipo) => (tipo.PublicId === rascunho.PublicId ? rascunho : tipo))
    : [...ativos, rascunho]
}

/**
 * O que o tipo pede e onde ele entra, numa linha: "3 perguntas + caixa · entra em
 * Triagem". E o resumo do item fechado — o bastante para comparar os tipos sem abrir. O
 * desativado diz so isso: fora do formulario, o que ele pergunta deixa de importar.
 */
export function describeType(
  tipo: { perguntas: number; caixa: boolean; coluna: string | null; ativo: boolean },
  colunas: ProjectStateViewModel[] | null,
): string {
  if (!tipo.ativo) return 'Desativado'

  const perguntas = tipo.perguntas === 1 ? '1 pergunta' : `${tipo.perguntas} perguntas`
  const pede =
    tipo.perguntas === 0
      ? tipo.caixa
        ? 'Só a caixa'
        : 'Nada a perguntar'
      : tipo.caixa
        ? `${perguntas} + caixa`
        : perguntas

  if (tipo.coluna === null) return `${pede} · entra na primeira coluna`

  // A coluna que nao carregou, ou que sumiu: o resumo fica so com o que o tipo pede.
  const coluna = colunas?.find((item) => item.PublicId === tipo.coluna)
  return coluna ? `${pede} · entra em ${coluna.Name}` : pede
}
