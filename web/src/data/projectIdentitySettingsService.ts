import type {
  IdentitySecretHistoryItemViewModel,
  IdentitySecretViewModel,
  IdentitySettingsViewModel,
  SaveIdentitySettingsRequest,
} from '@/contracts'

/**
 * Como quem relata e identificado num projeto.
 *
 * **Nao ha par publico desta leitura ainda.** A ferramenta vai precisar saber o
 * modo para se comportar — se pede codigo, se aceita identidade assinada, ou se
 * nao pergunta nada —, e quando precisar sera uma rota propria com so aquele
 * campo.
 */
export interface ProjectIdentitySettingsService {
  /**
   * O modo do projeto. **Nunca falha por nao existir**: projeto que nunca salvou
   * nada recebe o padrao, porque ele ja se comporta desse jeito.
   */
  getIdentitySettings(publicId: string): Promise<IdentitySettingsViewModel>

  /** Substitui a configuracao inteira. */
  saveIdentitySettings(
    publicId: string,
    settings: SaveIdentitySettingsRequest,
  ): Promise<IdentitySettingsViewModel>

  /** A chave secreta do HMAC do projeto. So administrador; recusa sem a chave mestra. */
  getIdentitySecret(publicId: string): Promise<IdentitySecretViewModel>

  /** Troca a chave secreta do HMAC e devolve a nova: todo cracha antigo deixa de valer. */
  rotateIdentitySecret(publicId: string): Promise<IdentitySecretViewModel>

  /** As ultimas chaves do HMAC que ja nao valem, so com o comeco e a data da troca. */
  getIdentitySecretHistory(publicId: string): Promise<IdentitySecretHistoryItemViewModel[]>
}
