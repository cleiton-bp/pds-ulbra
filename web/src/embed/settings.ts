import type { WidgetSettingsViewModel } from '@/contracts'

/**
 * Os padroes da ferramenta — **e a segunda copia deles**.
 *
 * A primeira e `WidgetSettingsDefaults.cs`, que a API devolve para projeto que
 * nunca salvou nada. Esta existe porque o quadro precisa abrir mesmo quando a
 * leitura falha: uma ferramenta que nao aparece porque a rede caiu e pior do que
 * uma com os textos padrao.
 *
 * As duas listas precisam continuar iguais, e a divergencia so apareceria com a
 * API fora do ar — o pior momento para descobrir. Por isso ha um teste que le o
 * arquivo C# e compara campo a campo.
 */
export const DEFAULT_WIDGET_SETTINGS: WidgetSettingsViewModel = {
  IsEnabled: true,
  // Nulo e o acento do proprio produto, que acompanha o tema.
  AccentColor: null,
  Position: 'BottomRight',
  Theme: 'Auto',
  LauncherLabel: 'Relatar',
  Title: 'Conte o que aconteceu',
  Placeholder: 'Descreva o que você viu, e onde. Se puder, diga o que esperava que acontecesse.',
  SuccessMessage: 'Recebemos. Anote o protocolo — é com ele que você acompanha.',
  ShowsTypeField: true,
  DefaultReportType: 'Bug',
  // **Este nao vem de `WidgetSettingsDefaults.cs`**, e sim de
  // `CycleSettingsDefaults.cs`: ele decide o estado inicial de uma caixa do
  // formulario, mas a resposta dela pertence ao ciclo do relato. O teste de
  // divergencia le os tres arquivos.
  AcceptsQuestionsDefault: true,
  // **Nem deste**: vem de `IdentitySettingsDefaults.cs`. O modo decide se a
  // ferramenta guarda um codigo e oferece "os meus relatos" — e com a API fora do
  // ar o seguro e o modo que nao promete lista nenhuma.
  IdentityMode: 'Protocol',
}
