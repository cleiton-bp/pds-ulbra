import type { WidgetSettingsViewModel } from '@/contracts'
import { widgetSettingsService } from '@/data/publicIndex'
import { DEFAULT_WIDGET_SETTINGS } from '@/embed/settings'

/**
 * A configuracao que vale para esta abertura do quadro.
 *
 * Mora separado de `settings.ts` de proposito: la sao **dados**, e um arquivo de
 * dados que faz rede arrasta a camada inteira atras de si — o teste de aparencia,
 * que so queria os padroes, passou a exigir `window` no dia em que os dois
 * moraram juntos.
 *
 * As tres respostas possiveis sao diferentes de proposito:
 *
 * - **os valores do cliente**, quando a leitura da certo;
 * - **os padroes**, quando ela falha — rede fora, 500, JSON torto. "Nao consegui
 *   saber" nao pode virar "nao apareco": quem visita o site perderia a unica
 *   forma de avisar que algo quebrou, justamente quando algo quebrou;
 * - **`null`**, quando a resposta e uma recusa: a chave nao vale, ou este
 *   endereco nao esta autorizado no projeto. Ai nao e falta de informacao, e a
 *   informacao de que nao e para abrir. Desenhar o formulario faria a pessoa
 *   escrever ate o fim para o envio ser recusado pelo mesmo motivo.
 *
 * A diferenca entre a segunda e a terceira e a unica coisa que este arquivo
 * decide, e ela e o que separa "algo quebrou do nosso lado" de "nao e aqui".
 */
export async function resolveWidgetSettings(
  key: string,
  origin: string | null,
): Promise<WidgetSettingsViewModel | null> {
  // Sem chave nao ha o que perguntar. Acontece ao abrir `embed.html` na mao, e o
  // formulario desenhado com os padroes e o que torna o quadro demonstravel.
  if (key.trim().length === 0) return DEFAULT_WIDGET_SETTINGS

  try {
    return await widgetSettingsService.loadWidgetSettings(key, origin)
  } catch {
    return DEFAULT_WIDGET_SETTINGS
  }
}
