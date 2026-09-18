import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * O CONTRATO ENTRE O `tracking.html` E O `main.tsx`
 * ============================================================================
 *
 * A pagina publica desenha uma tela de carregamento **dentro do HTML**, porque a
 * versao feita pela biblioteca so aparece depois de o pacote inteiro chegar — que
 * e exatamente quando a espera acabou. Quem abre o link do celular, com internet
 * ruim, ficava olhando tela branca.
 *
 * Isso cria uma amarra entre dois arquivos que nao se importam: o HTML desenha, e
 * o `main.tsx` tira depois de montar. **E a amarra falha em silencio**, porque a
 * remocao usa `?.`: se o identificador mudar de um lado so, nada quebra, nada
 * avisa, e o esqueleto fica na tela para sempre, por baixo do relato de verdade.
 *
 * Este teste e a unica coisa que percebe isso.
 */
const ID = 'pds-tracking-loading'

const html = readFileSync(fileURLToPath(new URL('../../tracking.html', import.meta.url)), 'utf8')
const main = readFileSync(fileURLToPath(new URL('../tracking/main.tsx', import.meta.url)), 'utf8')

describe('a tela de carregamento da pagina publica', () => {
  it('existe no HTML, e nao so no pacote', () => {
    expect(html).toContain(`id="${ID}"`)
  })

  it('e removida pela entrada depois de montar', () => {
    expect(main).toContain(`getElementById('${ID}')`)
    expect(main).toMatch(/getElementById\('pds-tracking-loading'\)\?\.remove\(\)/)
  })

  it('aparece uma vez so, e antes da raiz da biblioteca', () => {
    // Uma vez so porque `id` repetido e HTML invalido, e porque `getElementById`
    // pegaria o primeiro e deixaria o outro na tela para sempre. A primeira versao
    // deste teste olhava so a posicao, e uma duplicata passava por ela.
    expect(html.split(`id="${ID}"`).length - 1).toBe(1)

    // E antes da raiz: dentro dela, quem apagaria seria a propria biblioteca ao
    // montar, e a tela de carregamento passaria a depender de um detalhe de como
    // ela limpa o no.
    expect(html.indexOf(`id="${ID}"`)).toBeLessThan(html.indexOf('id="pds-tracking-root"'))
  })

  it('nao depende da folha de estilo, que tambem esta a caminho', () => {
    const bloco = html.slice(html.indexOf(`id="${ID}"`), html.indexOf('id="pds-tracking-root"'))

    // `class` esperaria o CSS chegar. As cores vem em `style`, resolvidas pelo
    // script do tema, que roda antes do primeiro pixel.
    expect(bloco).not.toMatch(/\sclass=/)
    expect(bloco).toContain('var(--pds-load-fundo')
  })
})
