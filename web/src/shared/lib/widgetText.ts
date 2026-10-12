/**
 * As variaveis dos textos da ferramenta, e a troca delas pelo valor.
 *
 * **Variavel so depois de enviar**: na confirmacao do quadro e no topo da pagina de
 * acompanhamento, onde o nome, o protocolo, o tipo e a etapa existem. A API recusa
 * variavel nos outros textos (`WidgetText.cs`); aqui so se troca.
 *
 * **O resultado e texto puro.** Quem chama o poe na tela como texto, e o React
 * escapa — o valor de uma variavel e o que a pessoa digitou no nome, e nunca pode
 * virar HTML.
 */

/** O conjunto fixo. A etapa so existe no acompanhamento. */
export type WidgetTextVariable = 'primeiroNome' | 'protocolo' | 'tipo' | 'projeto' | 'etapa'

/** As da confirmacao: tudo o que existe logo depois de enviar. */
export const SUCCESS_VARIABLES: readonly WidgetTextVariable[] = [
  'primeiroNome',
  'protocolo',
  'tipo',
  'projeto',
]

/** As do acompanhamento: as mesmas, e a etapa em que o relato esta. */
export const TRACKING_VARIABLES: readonly WidgetTextVariable[] = [...SUCCESS_VARIABLES, 'etapa']

/** Os valores de agora. Ausente, nulo ou em branco e "sem valor". */
export type WidgetTextValues = Partial<Record<WidgetTextVariable, string | null | undefined>>

/**
 * O que entra quando a variavel nao tem valor e o texto nao escreveu um padrao.
 *
 * So o primeiro nome falta de verdade — o projeto que nao pergunta o nome, a pessoa
 * que nao respondeu —, e "você" mantem a frase inteira: "Obrigado, você". A etapa
 * falta no projeto sem jornada. Os outros sempre tem valor onde sao aceitos; o vazio
 * aqui e so para nunca escrever "undefined".
 */
const DE_FABRICA: Record<WidgetTextVariable, string> = {
  primeiroNome: 'você',
  protocolo: '',
  tipo: 'relato',
  projeto: '',
  etapa: 'em andamento',
}

/**
 * `{{nome}}` ou `{{nome|padrao}}`, com espacos tolerados em volta do nome. A mesma
 * forma da API (`WidgetText.cs`), que confere na gravacao.
 */
const VARIAVEL = /\{\{\s*([^{}|]*?)\s*(?:\|([^{}]*))?\}\}/g

/**
 * Troca as variaveis do texto pelos valores, e devolve texto puro.
 *
 * O valor, se houver; senao o padrao escrito no texto; senao o de fabrica. Variavel
 * desconhecida — um texto gravado antes de uma regra mudar — vira o padrao escrito
 * ou nada, e **nunca derruba a tela**: e a confirmacao de um relato que ja chegou.
 */
export function renderWidgetText(template: string, values: WidgetTextValues): string {
  return template.replace(VARIAVEL, (_inteira, nome: string, padrao: string | undefined) => {
    // `hasOwn`, e nao `values[nome]` direto: `{{constructor}}` acharia a funcao do
    // proprio objeto, e a troca quebraria.
    const valor = Object.hasOwn(values, nome)
      ? values[nome as WidgetTextVariable]?.trim()
      : undefined
    if (valor) return valor
    if (padrao !== undefined) return padrao.trim()
    return Object.hasOwn(DE_FABRICA, nome) ? DE_FABRICA[nome as WidgetTextVariable] : ''
  })
}

/** A primeira palavra do nome: "Ana Paula" vira "Ana". Nulo quando nao ha nome. */
export function firstName(name: string | null | undefined): string | null {
  const primeira = (name ?? '').trim().split(/\s+/)[0]
  return primeira ? primeira : null
}
