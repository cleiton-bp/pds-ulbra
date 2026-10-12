import type { CycleSettingsViewModel, MediaKind } from '@/contracts'

/**
 * Os padroes de fabrica que o painel precisa para dizer "Tudo no padrão" e para
 * "Voltar ao padrão" — **e a segunda copia deles**, como a da ferramenta em
 * `embed/settings.ts`.
 *
 * A primeira e o C# (`CycleSettingsDefaults.cs`, `MediaSettingsDefaults.cs`), que a API
 * aplica a projeto que nunca salvou nada. A API nao devolve o padrao junto da leitura,
 * e pedir uma rota so para isso seria uma leitura a mais em cada tela. O preco e manter
 * as duas iguais: `test/factoryDefaults.test.ts` le os arquivos C# e reprova a diferenca.
 *
 * Os limites de relato nao estao aqui: a leitura deles ja traz o padrao (`Defaults`).
 */

/** As regras do ciclo, como saem de `CycleSettingsDefaults.cs`. */
export const CYCLE_DEFAULTS: CycleSettingsViewModel = {
  ClosureTrigger: 'LastColumn',
  PublicDelayMinutes: 0,
  AllowsReopen: true,
  // Nulo e "a primeira coluna da fila", e nao a falta de escolha.
  ReopenStatePublicId: null,
  ReopenRequiresComment: true,
  TrackingCodeCanAct: false,
  SatisfactionEnabled: true,
  SatisfactionStyle: 'Stars',
  SatisfactionRequired: false,
  InfoRequestEnabled: true,
  InfoRequestWarnDays: 7,
  InfoRequestCloseDays: 7,
  AcceptsQuestionsDefault: true,
  AllowsReportArchiving: false,
  LastColumnVisibleDays: 14,
  DueSoonDays: 2,
  SprintsEnabled: false,
  SprintLengthWeeks: 2,
}

const MB = 1024 * 1024

/**
 * Os anexos, como saem de `MediaSettingsDefaults.cs`. Os formatos de arquivo marcados
 * de fabrica vem da propria leitura (`FileFormats[].IsDefault`), e nao daqui: o
 * catalogo e da API.
 */
export const MEDIA_DEFAULTS = {
  IsEnabled: true,
  AllowsScreenCapture: true,
  AllowsOnInfoRequest: true,
  AllowsOnReopen: true,
  Kinds: {
    Image: { IsEnabled: true, MaxCount: 3, MaxBytes: 5 * MB },
    File: { IsEnabled: false, MaxCount: 2, MaxBytes: 10 * MB },
  } satisfies Partial<
    Record<MediaKind, { IsEnabled: boolean; MaxCount: number; MaxBytes: number }>
  >,
} as const

/** O mesmo valor? Listas pelo conteudo, porque a leitura sempre traz uma lista nova. */
export function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) return JSON.stringify(a) === JSON.stringify(b)
  return a === b
}

/**
 * Os nomes, na ordem dada, dos campos cujo valor difere do padrao — o resumo do "Mais
 * opções". Cada linha diz o campo e o nome que a tela da a ele.
 */
export function changedFromDefaults<T>(
  values: T,
  defaults: Partial<T>,
  fields: ReadonlyArray<readonly [keyof T, string]>,
): string[] {
  return fields
    .filter(([campo]) => !sameValue(values[campo], defaults[campo]))
    .map(([, nome]) => nome)
}

/** O padrao so dos campos dados, para "Voltar ao padrão" mexer so neles. */
export function defaultsOf<T>(
  defaults: Partial<T>,
  fields: ReadonlyArray<readonly [keyof T, string]>,
): Partial<T> {
  return Object.fromEntries(fields.map(([campo]) => [campo, defaults[campo]])) as Partial<T>
}
