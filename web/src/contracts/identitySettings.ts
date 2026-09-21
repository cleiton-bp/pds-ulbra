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
 * O modo de identificacao de um projeto.
 *
 * **Nunca vem vazio.** Projeto que nunca abriu a tela recebe o padrao, e a
 * resposta e indistinguivel da de quem salvou aquele mesmo valor: quem le
 * precisa saber como o projeto se comporta, e nao se existe linha no banco.
 */
export interface IdentitySettingsViewModel {
  Mode: ReporterIdentityMode
}

/**
 * O que a tela manda ao salvar.
 *
 * Hoje e um campo so, e continua sendo um objeto: os proximos passos da etapa
 * acrescentam o formato da assinatura, a validade do carimbo e a visibilidade, e
 * todos vao na mesma gravacao.
 */
export interface SaveIdentitySettingsRequest {
  Mode: ReporterIdentityMode
}
