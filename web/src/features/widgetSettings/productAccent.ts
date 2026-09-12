/**
 * A cor de acento do produto, lida da folha de estilo em vez de escrita aqui.
 *
 * Existe por dois motivos que se somam. O primeiro e a regra do projeto: cor crua
 * fora de `tokens.css` reprova em `designSystem.test.ts`, e com razao — token que
 * alguem copia vira duas verdades. O segundo e que esta cor **inverte com o
 * tema**, e o seletor precisa abrir na que esta valendo agora, nao numa
 * lembranca.
 *
 * Devolve `null` quando nao da para ler. Acontece fora do navegador e em ambiente
 * de teste sem folha carregada, e quem chama trata: nao ha cor de emergencia para
 * inventar aqui sem reintroduzir exatamente o valor cru que a regra proibe.
 */
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

export function readProductAccent(): string | null {
  if (typeof window === 'undefined') return null

  const styles = window.getComputedStyle?.(document.documentElement)
  if (!styles) return null

  // A ordem e a da camada 2 para a 1: `--accent` e o nome com significado, e e
  // ele que muda quando o tema muda.
  for (const token of ['--accent', '--ink-on-light']) {
    const value = styles.getPropertyValue(token).trim()
    if (HEX.test(value)) return expand(value)
  }

  return null
}

/**
 * `input type="color"` so aceita a forma de seis digitos: com a curta ele ignora
 * o valor e abre no preto, sem erro nenhum.
 */
function expand(value: string): string {
  if (value.length !== 4) return value.toLowerCase()

  const [, r, g, b] = value
  return `#${r}${r}${g}${g}${b}${b}`.toLowerCase()
}
