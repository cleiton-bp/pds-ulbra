import type { WidgetReportTypeViewModel, WidgetSettingsViewModel } from '@/contracts'
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

/**
 * O tipo de verdade que corresponde a um tipo de fabrica do quadro — ou por que nao
 * deu para achar.
 *
 * **So existe porque a leitura pode falhar.** Sem ela, o quadro abre com os tipos de
 * fabrica (`FALLBACK_REPORT_TYPES`), que nao tem identificador de verdade: cada
 * projeto tem os seus. Antes, o tipo era uma palavra fixa e o envio funcionava assim
 * mesmo; agora ele precisa do identificador, e mandar um inventado seria recusado — ou
 * pior, cairia num tipo errado.
 *
 * Entao, na hora de enviar, o quadro **le de novo** e procura o tipo com o mesmo nome
 * e as mesmas perguntas — o projeto que nunca mexeu nos tipos, que e o caso comum,
 * acha. As respostas so casam com as perguntas se elas forem as mesmas, e por isso
 * nome igual nao basta.
 *
 * - `{ found: id }`: achou, e o envio segue com ele;
 * - `'failed'`: a leitura falhou de novo, ou foi recusada — tentar mais tarde;
 * - `'changed'`: leu, e o projeto nao tem mais esse tipo como o quadro o desenhou.
 */
export async function findRealType(
  key: string,
  origin: string | null,
  fallback: WidgetReportTypeViewModel,
): Promise<{ found: string } | 'failed' | 'changed'> {
  if (key.trim().length === 0) return 'failed'

  let lida: WidgetSettingsViewModel | null
  try {
    lida = await widgetSettingsService.loadWidgetSettings(key, origin)
  } catch {
    return 'failed'
  }
  if (!lida) return 'failed'

  const nome = fallback.Name.trim().toLowerCase()
  const igual = lida.Types.find(
    (tipo) =>
      tipo.Name.trim().toLowerCase() === nome &&
      tipo.ShowsTextBox === fallback.ShowsTextBox &&
      tipo.Questions.length === fallback.Questions.length &&
      tipo.Questions.every((pergunta, index) => pergunta === fallback.Questions[index]),
  )

  return igual ? { found: igual.PublicId } : 'changed'
}
