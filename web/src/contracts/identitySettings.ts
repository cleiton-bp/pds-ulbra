/** Espelho de `Pds.Domain/Dtos/IdentitySettingsDto.cs` e `ViewModels/IdentitySettingsViewModels.cs`. */

/**
 * Como quem abre um relato e reconhecido neste projeto.
 *
 * Os valores sao os nomes do `ReporterIdentityModeEnum` em C#: a API serializa
 * enum como texto em PascalCase. O que aparece na tela e outra coisa, e mora
 * junto do formulario.
 *
 * **Sao tres, e sao excludentes.** Cada um responde de um jeito diferente a
 * pergunta "quem e voce", e combinar dois seria perguntar duas vezes.
 */
export type ReporterIdentityMode = 'Protocol' | 'PersonalCode' | 'InheritedIdentity'

/**
 * Quem pode ver os relatos deste projeto.
 *
 * Espelho do `ReportVisibilityEnum` em C#, pelo mesmo motivo do modo.
 *
 * **O padrao e o mais fechado**, e `PublicIdentified` so vale onde o modo
 * identifica: sem identidade nao ha o que mostrar, e o nivel seria o anonimo com
 * outro nome. A regra e do par, e a API confere os dois juntos.
 */
export type ReportVisibility = 'Private' | 'PublicAnonymous' | 'PublicIdentified'

/**
 * O modo de identificacao de um projeto.
 *
 * **Nunca vem vazio.** Projeto que nunca abriu a tela recebe o padrao, e a
 * resposta e indistinguivel da de quem salvou aquele mesmo valor: quem le
 * precisa saber como o projeto se comporta, e nao se existe linha no banco.
 */
export interface IdentitySettingsViewModel {
  Mode: ReporterIdentityMode
  Visibility: ReportVisibility
}

/**
 * O que a tela manda ao salvar.
 *
 * **Os dois campos vao juntos, e nao e comodidade.** "Publico identificado" so
 * vale onde o modo identifica — mandar um de cada vez faria o projeto passar por
 * um estado que a regra proibe, e qual dos dois recusar dependeria de quem
 * chegou primeiro.
 */
export interface SaveIdentitySettingsRequest {
  Mode: ReporterIdentityMode
  Visibility: ReportVisibility
}
