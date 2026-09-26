import type { DocFormat } from '../shared/useWorkspace'
import { withWarnings } from './model/operations'
import { emptyDoc, parseDoc } from './model/parse'
import { serializeDoc } from './model/serialize'
import type { ModelDoc } from './types'

/** Como um arquivo de modelagem vira documento e volta — o que o `useWorkspace` precisa. */
export const MODELING_FORMAT: DocFormat<ModelDoc> = {
  parse: parseDoc,
  serialize: serializeDoc,
  empty: emptyDoc,
  refresh: withWarnings,
}
