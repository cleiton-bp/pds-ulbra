import type { PublicMediaSettingsViewModel } from '@/contracts'
import { publicMediaService } from '@/data/publicIndex'

/**
 * O que o quadro pode oferecer de anexo nesta abertura — ou `null` para nao
 * oferecer nada.
 *
 * **Aqui a falha vira "nao mostra", e isso e o contrario da configuracao da
 * ferramenta.** La, "nao consegui saber" cai nos padroes, porque os padroes ainda
 * desenham um formulario que funciona. Aqui os padroes desenhariam um botao cujos
 * limites estariamos chutando — e o envio falharia depois de a pessoa ter escolhido
 * o arquivo, que e o pior momento para descobrir. Sem anexo, o relato continua
 * inteiro: o texto e a parte que importa.
 *
 * **Desligado tambem vira `null`**, para o quadro so precisar perguntar uma coisa.
 */
export async function resolveMediaSettings(
  key: string,
  origin: string | null,
): Promise<PublicMediaSettingsViewModel | null> {
  try {
    const settings = await publicMediaService.loadMediaSettings(key, origin)

    return settings?.IsEnabled && settings.Kinds.length > 0 ? settings : null
  } catch {
    return null
  }
}
