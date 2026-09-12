import type { WidgetSettingsViewModel } from '@/contracts'

/**
 * Os padroes da ferramenta, e a unica fonte deles.
 *
 * Enquanto a rota do pds-014 nao existe, e daqui que o quadro le tudo. Quando ela
 * existir, isto continua sendo o que vale se a leitura falhar: uma ferramenta que
 * nao abre porque a configuracao nao carregou e pior do que uma com os textos
 * padrao.
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
}
