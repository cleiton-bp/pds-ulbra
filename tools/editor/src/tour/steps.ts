import type { TourTarget } from './targets'
import { SOMENTE_LEITURA } from '../shared/readOnly'

/**
 * O roteiro do tour de cada ambiente: o que acende, o que diz e como a tela precisa
 * estar. So texto e estado: quem anda, desenha e devolve a tela e o `Tour.tsx`.
 *
 * Regras do roteiro:
 * - Titulo de ate tres palavras; texto de ate 14 palavras, numa frase so, sem
 *   travessao nem ponto no meio, falando com quem le ("você"), sem termo tecnico
 *   que a tela nao mostre. O texto diz para que a parte serve, e nao descreve o
 *   botao.
 * - Um passo, uma ideia, e poucos passos: o que e da modelagem em si (do que o
 *   arquivo trata, como ler uma tabela) vai para o painel (`explain`), e nao para
 *   o cartao.
 * - `stage` diz como a tela precisa estar, e nao o que fazer: o que o passo nao
 *   diz fica como estava antes do tour. Por isso voltar desfaz sozinho (o passo
 *   anterior pede o estado dele de novo), e sair devolve a tela como estava.
 * - O tour so mexe no que e de tela (laterais, vista, o que o painel mostra). Nunca
 *   edita, nunca arrasta, nunca liga a edicao: o editor grava sozinho.
 * - Passo que so vale em alguns arquivos diz quando (`when`): fica fora do tour dos
 *   outros, e a contagem "Passo 3 de 9" sai certa. Se mesmo assim o alvo nao
 *   aparecer na tela, o passo e pulado, na direcao em que se ia.
 */
export type TourStep<Stage> = {
  /** A parte da tela que acende. Sem alvo, o cartao fica no meio da tela. */
  target?: TourTarget
  title: string
  text: string
  stage?: Stage
  when?: TourCondition
}

/**
 * Quando um passo vale: `comparing`, com o arquivo comparado a um anterior;
 * `has-changes`, com tabela nova ou alterada; `has-flow`, com caso de uso que tem
 * os passos escritos.
 */
export type TourCondition = 'comparing' | 'has-changes' | 'has-flow'

/** Os passos que valem para o arquivo aberto (ver `when`). O que nao foi dito, nao vale. */
export function stepsFor<Stage>(
  steps: TourStep<Stage>[],
  facts: Partial<Record<TourCondition, boolean>>,
): TourStep<Stage>[] {
  // Publicado so para leitura, o botao de editar nao existe: o passo dele sai.
  return steps.filter((step) => (!step.when || Boolean(facts[step.when])) && !(SOMENTE_LEITURA && step.target === 'edit'))
}

/**
 * O que o painel da direita mostra no passo: em vez do que aparece ao clicar numa
 * tabela, uma explicacao feita para o tour (ver `ModelingGuide` e `UseCasesGuide`):
 * `file`, do que o arquivo trata e o que traz; `read`, como ler o desenho; `case`,
 * um caso de uso por dentro (so nos casos de uso).
 */
export type Explain = 'file' | 'read' | 'case'

/** O que o tour da modelagem pode pedir da tela. */
export type ModelingStage = {
  files?: boolean
  panel?: boolean
  view?: 'changes' | 'all'
  explain?: Exclude<Explain, 'case'>
}

/** O que o tour dos casos de uso pode pedir da tela. */
export type UseCasesStage = {
  files?: boolean
  panel?: boolean
  explain?: Explain
}

// O fim e igual nos dois ambientes.
const closingSteps = <Stage>(): TourStep<Stage>[] => [
  {
    target: 'edit',
    title: 'Editar',
    text: 'Tudo abre só para leitura, e aqui você liga a edição, que salva sozinha.',
  },
  {
    target: 'help',
    title: 'Pronto!',
    text: 'Quando quiser rever, o tour fica aqui.',
  },
]

// Os dois comecam direto pelo arquivo aberto, no painel: e o que a pessoa veio
// entender. Depois, as partes da tela, e no fim, como editar.
export const MODELING_TOUR: TourStep<ModelingStage>[] = [
  {
    target: 'panel',
    title: 'Este arquivo',
    text: 'Em poucas palavras: do que ele trata e o que traz.',
    stage: { panel: true, explain: 'file' },
  },
  {
    target: 'panel',
    title: 'Como ler',
    text: 'Uma tabela daqui, pedaço por pedaço.',
    stage: { panel: true, explain: 'read' },
  },
  {
    target: 'files',
    title: 'Os arquivos',
    text: 'Cada arquivo é uma etapa do banco, com os casos de uso no alto.',
    stage: { files: true },
  },
  {
    target: 'canvas',
    title: 'O desenho',
    text: 'Arraste o fundo para andar e use a roda do mouse para aproximar.',
  },
  {
    target: 'view',
    title: 'O que mudou',
    text: 'Mudanças destaca o que é novo, e Tudo mostra o banco inteiro.',
    stage: { view: 'changes' },
    when: 'comparing',
  },
  {
    target: 'walk',
    title: 'Uma por uma',
    text: 'Passe pelas mudanças, uma de cada vez.',
    when: 'has-changes',
  },
  {
    target: 'search',
    title: 'Buscar',
    text: 'Ache qualquer tabela pelo nome.',
  },
  ...closingSteps<ModelingStage>(),
]

export const USE_CASES_TOUR: TourStep<UseCasesStage>[] = [
  {
    target: 'panel',
    title: 'Este arquivo',
    text: 'Em poucas palavras: quem aparece e o que cada um faz.',
    stage: { panel: true, explain: 'file' },
  },
  {
    target: 'panel',
    title: 'Como ler',
    text: 'Um pedaço do desenho daqui, forma por forma.',
    stage: { panel: true, explain: 'read' },
  },
  {
    target: 'panel',
    title: 'Por dentro',
    text: 'Cada caso conta o antes, os passos e o fim.',
    stage: { panel: true, explain: 'case' },
    when: 'has-flow',
  },
  {
    target: 'files',
    title: 'Os arquivos',
    text: 'Cada arquivo é uma parte do sistema, com o banco no alto.',
    stage: { files: true },
  },
  {
    target: 'canvas',
    title: 'O desenho',
    text: 'Arraste o fundo para andar e use a roda do mouse para aproximar.',
  },
  {
    target: 'see',
    title: 'O que aparece',
    text: 'Mostre ou esconda as notas, e acenda quem faz o quê.',
  },
  {
    target: 'search',
    title: 'Buscar',
    text: 'Ache alguém ou um caso de uso pelo nome.',
  },
  ...closingSteps<UseCasesStage>(),
]
