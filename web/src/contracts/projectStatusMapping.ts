/** Espelho de `Pds.Domain/ViewModels/ProjectStatusMappingViewModels.cs`. */

/**
 * Um estado de dentro e para onde ele aponta.
 *
 * `StagePublicId` nulo quer dizer **sem mapeamento** — e esse e o caso que importa
 * ver: e nele que o relato para de andar do lado de fora.
 */
export interface StatusMappingEntryViewModel {
  StatePublicId: string
  StateName: string
  /** Falso no estado aposentado, que so aparece aqui enquanto tiver mapeamento. */
  StateIsActive: boolean
  StagePublicId: string | null
  StageLabel: string | null
}

/**
 * O mapa que vale agora.
 *
 * Traz **todo estado ativo**, mapeado ou nao, pelo mesmo motivo que a escolha de
 * entrada traz os tres tipos: a tela precisa mostrar a pergunta inteira, e nao so
 * as respostas dadas.
 */
export interface ProjectStatusMappingViewModel {
  /** A versao que vale. Zero enquanto nada foi ligado. */
  Version: number
  Entries: StatusMappingEntryViewModel[]
  /** Quantos estados ainda nao apontam para lugar nenhum. */
  UnmappedCount: number
}

/**
 * O mapa inteiro, de uma vez.
 *
 * **Estado que nao vier na lista fica sem mapeamento.** Nao ha como ligar um
 * estado sozinho: cada gravacao cria uma versao, e uma versao e um retrato do
 * conjunto.
 */
export interface SaveStatusMappingRequest {
  Entries: { StatePublicId: string; StagePublicId: string }[]
}
