import type { ParseResult as SharedParseResult } from '../shared/types'

/**
 * O vocabulario do editor, num lugar so.
 *
 * Sao `type` e nao `interface` de proposito: o React Flow exige que o payload de
 * um no seja compativel com Record<string, unknown>, e interface nao satisfaz
 * essa restricao em TypeScript.
 */

export type Position = { x: number; y: number }

/**
 * Chaves que o arquivo tem e o editor nao conhece — um campo escrito a mao, um
 * nome digitado errado. Ficam guardadas e sao gravadas de volta como estavam:
 * gravar pelo editor nunca apaga o que ele nao entende.
 */
export type Extra = Record<string, unknown>

/** Pessoa vira boneco no desenho; sistema externo vira caixa com «sistema». */
export type ActorKind = 'person' | 'system'

/** Quem usa o sistema. `uid` so existe em memoria, nunca vai para o arquivo. */
export type Actor = {
  uid: string
  /** Nome no desenho, em portugues — e o que as ligacoes citam no arquivo. */
  name: string
  kind: ActorKind
  description: string
  position: Position
  extra: Extra
}

/** Caminho que foge do fluxo principal: o titulo diz quando, os passos dizem o que muda. */
export type AlternativeFlow = {
  uid: string
  title: string
  steps: string[]
  extra: Extra
}

/** Uma acao que o sistema oferece a algum ator. */
export type UseCase = {
  uid: string
  /** Codigo curto e estavel, como "UC01" — e o que as ligacoes citam no arquivo. */
  id: string
  /** A acao, com verbo no infinitivo: "Abrir relato". */
  name: string
  description: string
  position: Position
  /** Largura da elipse. A altura e a mesma para todas — ver `model/geometry`. */
  width: number
  preconditions: string
  postconditions: string
  /** Um passo por item, na ordem em que acontecem. */
  mainFlow: string[]
  alternativeFlows: AlternativeFlow[]
  extra: Extra
}

export type LinkKind = 'association' | 'include' | 'extend' | 'generalization'

/**
 * Ponta de uma ligacao, ou o alvo da seta de uma nota.
 *
 * Em memoria aponta pelo `uid`, e o nome so e escrito na hora de gravar. Assim
 * renomear um ator nao precisa sair corrigindo ligacao por ligacao — e digitar um
 * nome que passa, letra a letra, pelo nome de outro ator ("Admin" a caminho de
 * "Administrador") nao rouba as ligacoes dele no meio do caminho.
 *
 * `missing` guarda o texto de uma referencia que o arquivo cita mas que nao existe:
 * vira aviso e continua sendo gravada, nunca some em silencio. Ela continua sendo
 * texto — resolvido pelo nome a cada leitura, sem se prender a ninguem (ver
 * `targetOf` em `model/refs`).
 */
export type Ref = { uid: string } | { missing: string }

/**
 * Liga dois elementos. O sentido importa em tres dos quatro tipos:
 * - include — `from` sempre executa `to` junto;
 * - extend — `from` acrescenta algo a `to`, sob uma condicao;
 * - generalization — `from` e um caso particular de `to` (o filho aponta o pai).
 *
 * Na associacao o sentido nao carrega significado, e o editor grava o ator em `from`.
 */
export type Link = {
  uid: string
  from: Ref
  to: Ref
  kind: LinkKind
  /**
   * O tipo como estava escrito, quando o editor nao o reconhece ("depende de").
   * A linha aparece com o tipo que as pontas sugerem, e o texto original volta
   * para o arquivo ate alguem escolher outro tipo no painel. Vazio no resto.
   */
  unknownKind: string
  /** Observacao livre — na extensao, e a condicao em que ela acontece. */
  note: string
  extra: Extra
}

/** Caixa de texto livre no canvas, para explicacao que nao cabe no desenho. */
export type Note = {
  uid: string
  text: string
  position: Position
  width: number
  /** Ator ou caso de uso para onde a nota aponta. `null` = nota solta. */
  anchor: Ref | null
  extra: Extra
}

export type DocMeta = {
  title: string
  /** Nome escrito no topo da fronteira do sistema. */
  system: string
  description: string
  extra: Extra
}

/** As listas do topo do arquivo. */
export type Section = 'actors' | 'useCases' | 'links' | 'notes'

export type UseCaseDoc = {
  meta: DocMeta
  actors: Actor[]
  useCases: UseCase[]
  links: Link[]
  notes: Note[]
  /** Chaves desconhecidas no topo do arquivo — ver `Extra`. */
  extra: Extra
  /**
   * Itens de uma lista que nao tem o formato de nada que o editor conhece — uma
   * ligacao escrita como texto solto, `"Relator -> UC01"`. Nao aparecem no desenho,
   * mas voltam para o arquivo no fim da lista em que estavam.
   */
  stray: Partial<Record<Section, unknown[]>>
  /** Problemas que nao impedem a edicao — ex.: ligacao citando algo que nao existe. */
  warnings: string[]
}

/** Erro de sintaxe no arquivo: o editor mostra o aviso em vez de abrir vazio. */
export type ParseResult = SharedParseResult<UseCaseDoc>

export type Selection =
  | { type: 'actor'; uid: string }
  | { type: 'useCase'; uid: string }
  | { type: 'link'; uid: string }
  | { type: 'note'; uid: string }
  | null

