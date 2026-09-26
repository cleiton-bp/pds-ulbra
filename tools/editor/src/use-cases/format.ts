import type { DocFormat } from '../shared/useWorkspace'
import { carryUids, refresh } from './model/operations'
import { emptyDoc, parseDoc } from './model/parse'
import { serializeDoc } from './model/serialize'
import type { UseCaseDoc } from './types'

/** Como um arquivo de casos de uso vira documento e volta — o que o `useWorkspace` precisa. */
export const USE_CASE_FORMAT: DocFormat<UseCaseDoc> = {
  parse: parseDoc,
  serialize: serializeDoc,
  empty: emptyDoc,
  refresh,
  carry: carryUids,
}
