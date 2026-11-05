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
 * Como o sistema do cliente assina o cracha, no modo que herda a identidade. `Hmac` (de
 * fabrica) e uma linha em qualquer linguagem, com a chave secreta do projeto; `Jwt` e um
 * JWT ES256, com a chave publica colada aqui. So um vale por vez.
 */
export type IdentityFormat = 'Hmac' | 'Jwt'

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
  /** A ferramenta pergunta o nome. **Perguntar nao e publicar.** */
  AsksForName: boolean
  /**
   * A chave publica do sistema do cliente (ECDSA P-256, SPKI em base64), com que a API
   * confere o cracha no modo que herda a identidade. **Guardada nos outros modos
   * tambem**: trocar de modo e voltar nao obriga a colar de novo. Nula enquanto
   * ninguem colou.
   */
  IdentityPublicKey: string | null
  /** Por quantos minutos, no maximo, um cracha pode valer: 1 a 60, e 15 de fabrica. */
  IdentityTokenMaxMinutes: number
  /**
   * No modo que herda a identidade: o relato sem cracha (ou com cracha que nao confere)
   * e recusado, e a ferramenta pede para entrar no sistema. Falso de fabrica: entra
   * como protocolo.
   */
  IdentityRequired: boolean
  /** Como o sistema do cliente assina o cracha. */
  IdentityFormat: IdentityFormat
  /**
   * A instalacao tem a chave mestra do HMAC (`IDENTITY_HMAC_KEY`). **Nao e do projeto**:
   * sem ela, a tela oferece so o JWT e diz por que.
   */
  IsHmacAvailable: boolean
}

/**
 * A chave secreta do HMAC do projeto. **Sai so por pedido**, numa rota propria e so para
 * administrador, e nunca na leitura da configuracao, que vai para todo membro.
 */
export interface IdentitySecretViewModel {
  /** Como o servidor do cliente a usa: o texto inteiro, em UTF-8. Comeca com `rfs_`. */
  Secret: string
}

/**
 * Uma chave do HMAC que ja nao vale: **so o comeco**, para reconhecer qual chave um
 * servidor ainda usa, e quando ela foi trocada. O valor inteiro nunca sai.
 */
export interface IdentitySecretHistoryItemViewModel {
  /** `rfs_` e oito caracteres. Nulo sem a chave mestra na instalacao, de onde ela sai. */
  Prefix: string | null
  ReplacedAt: string
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
  AsksForName: boolean
  /**
   * A chave como foi colada: PEM (`-----BEGIN PUBLIC KEY-----`) ou base64 numa linha —
   * a API limpa e confere. **Obrigatoria no modo que herda a identidade**; nos outros
   * vai como esta, para ficar guardada.
   */
  IdentityPublicKey: string | null
  IdentityTokenMaxMinutes: number
  IdentityRequired: boolean
  IdentityFormat: IdentityFormat
}
