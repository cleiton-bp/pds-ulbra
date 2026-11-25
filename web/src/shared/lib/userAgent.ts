/**
 * O navegador como o time le: "Chrome 142 no macOS", e nao a linha tecnica que o navegador
 * manda ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ..."), que
 * ninguem do time le. A linha inteira continua disponivel para quem precisa (no `title`).
 *
 * **A ordem importa**: o Edge e o Opera tambem dizem "Chrome", e o Chrome tambem diz
 * "Safari". O que nao se reconhece volta como veio, para nao esconder o dado.
 */
export function resumirNavegador(linha: string): string {
  const navegador = qualNavegador(linha)
  const sistema = qualSistema(linha)
  if (navegador && sistema) return `${navegador} no ${sistema}`
  return navegador ?? sistema ?? linha
}

const NAVEGADORES: Array<[RegExp, string]> = [
  [/\bEdg(?:e|A|iOS)?\/(\d+)/, 'Edge'],
  [/\bOPR\/(\d+)/, 'Opera'],
  [/\bSamsungBrowser\/(\d+)/, 'Samsung Internet'],
  [/\b(?:Firefox|FxiOS)\/(\d+)/, 'Firefox'],
  // O Chrome sem janela (o das automacoes e dos testes) diz HeadlessChrome.
  [/\b(?:HeadlessChrome|Chrome|CriOS)\/(\d+)/, 'Chrome'],
  [/\bVersion\/(\d+(?:\.\d+)?).*\bSafari\//, 'Safari'],
]

function qualNavegador(linha: string): string | null {
  for (const [padrao, nome] of NAVEGADORES) {
    const achou = padrao.exec(linha)
    if (achou) return `${nome} ${achou[1]}`
  }
  return null
}

function qualSistema(linha: string): string | null {
  if (/\biPad\b/.test(linha)) return 'iPadOS'
  const ios = /\b(?:iPhone|iPod).*?\bOS (\d+)_/.exec(linha)
  if (ios) return `iOS ${ios[1]}`
  const android = /\bAndroid (\d+)/.exec(linha)
  if (android) return `Android ${android[1]}`
  if (/\bWindows NT\b/.test(linha)) return 'Windows'
  if (/\bCrOS\b/.test(linha)) return 'ChromeOS'
  // O macOS congelou a versao na linha (10_15_7) ha anos: dizer a versao seria mentir.
  if (/\bMac OS X\b/.test(linha)) return 'macOS'
  if (/\bLinux\b/.test(linha)) return 'Linux'
  return null
}
