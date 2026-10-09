import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { acentuar } from '@/data/errors'

/**
 * AS MENSAGENS DA API CHEGAM ACENTUADAS — E A LISTA DO PAINEL ACOMPANHA A API
 * ============================================================================
 *
 * A API escreve sem acento, por convencao da casa, e o painel acentua no caminho
 * para a tela (`acentuar`, em `data/errors.ts`). As palavras de uma leitura so vem
 * de uma lista, e **mensagem nova na API precisa ter as palavras dela la**. A regra
 * era so um comentario, e comentario nao reprova ninguem: a lista foi conferida
 * contra a API em 07/10, e em 08/10 ja faltavam "instalacao", "ultimos", "anonimo",
 * "opcao", "ordenacao" e outras — "ultimos" na tela de quem relata.
 *
 * Segue o desenho de `contractLimits.test.ts`: le os arquivos C# de verdade, passa
 * cada frase por `acentuar` e procura o que sobrou sem acento. A procura e pela
 * **forma** da palavra, e nao por dicionario: terminada em "-ao" (fora o "ao"), em
 * "-oes" ou em "-vel"; o pronome preso ao verbo ("aposenta-lo"); e uma lista curta
 * das que sempre levam acento. Pega o caso comum — a palavra que faltou na lista — e
 * nao prova o resto: "e" e "esta", de duas leituras, ficam com as construcoes de
 * `VERBOS` e com os testes de `data/errors.test.ts`.
 *
 * Fica de fora o que nao chega a tela: comentario, atributo, log e comentario de
 * coluna do banco.
 */
const API = fileURLToPath(new URL('../../../api/', import.meta.url))

/** Onde moram as mensagens que viram resposta: servicos, regras, guardas e rotas. */
const PASTAS = [
  'Pds.Service',
  'Pds.Domain',
  'Pds.Data/Repositories',
  'Pds.ApiBase',
  'Pds.WebApi/Controllers',
  'Pds.WebApi/Authorization',
]

/** O que sobrar com estas formas, depois de `acentuar`, chegou sem acento. */
const SEM_ACENTO = [
  // "nao", "padrao", "instalacao" — e nao o "ao" de "ao card".
  /\b(?!ao\b)[a-z]+ao\b/gi,
  // "acoes", "opcoes", "botoes".
  /\b[a-z]+oes\b/gi,
  // "possivel", "responsavel", "nivel".
  /\b[a-z]+[aeiou]vel\b/gi,
  // "aposenta-lo", "remove-la".
  /\b[a-z]+[ae]-l[oa]s?\b/gi,
  /\b(ultim[oa]s?|unic[oa]s?|proxim[oa]s?|maxim[oa]s?|minim[oa]s?|anonim[oa]s?|propri[oa]s?|numeros?|codigos?|paginas?|titulos?|periodos?|historicos?|videos?|voce|tambem|alguem|ninguem|porem|apos|atraves|ate|ja|so|ha)\b/gi,
  // O prefixo: "pre-marcado".
  /\bpre-[a-z]+/gi,
]

const LITERAL = /\$?"((?:[^"\\\n]|\\.)*)"/g

/** Linha que nao vira resposta: comentario, atributo, log, comentario de coluna. */
const FORA =
  /^\s*(?:\/\/|\*|\[)|\bLog(?:Information|Warning|Error|Debug|Critical|Trace)\b|HasComment/

function arquivosCs(pasta: string): string[] {
  const achados: string[] = []

  for (const entrada of readdirSync(pasta)) {
    const caminho = join(pasta, entrada)

    if (statSync(caminho).isDirectory()) {
      if (!['bin', 'obj', 'Migrations'].includes(entrada)) achados.push(...arquivosCs(caminho))
    } else if (entrada.endsWith('.cs')) {
      achados.push(caminho)
    }
  }

  return achados
}

/** Cada frase da API, com onde ela mora. Frase: comeca maiuscula e tem espaco. */
function frasesDaApi(): Array<{ onde: string; frase: string }> {
  const frases = new Map<string, string>()

  for (const pasta of PASTAS) {
    for (const arquivo of arquivosCs(join(API, pasta))) {
      readFileSync(arquivo, 'utf8')
        .split('\n')
        .forEach((linha, indice) => {
          if (FORA.test(linha)) return

          for (const [, frase] of linha.matchAll(LITERAL)) {
            if (frase === undefined || !/^[A-Z]/.test(frase) || !frase.includes(' ')) continue
            if (!frases.has(frase)) frases.set(frase, `${relative(API, arquivo)}:${indice + 1}`)
          }
        })
    }
  }

  return [...frases].map(([frase, onde]) => ({ onde, frase }))
}

describe('as mensagens da API, no caminho para a tela', () => {
  const frases = frasesDaApi()

  // Sem isto, uma pasta renomeada na API faria o teste passar lendo nada.
  it('o teste lê as mensagens de verdade', () => {
    expect(frases.length).toBeGreaterThan(300)
    expect(frases.map((item) => item.frase)).toContain('Projeto nao encontrado.')
  })

  it('nenhuma chega à tela com palavra sem acento — falta pôr a palavra em PALAVRAS', () => {
    const sobras = frases.flatMap(({ onde, frase }) => {
      const tela = acentuar(frase)
      const palavras = SEM_ACENTO.flatMap((forma) => [...tela.matchAll(forma)].map((m) => m[0]))
      return palavras.length > 0 ? [`${onde} [${palavras.join(', ')}] ${tela}`] : []
    })

    expect(sobras).toEqual([])
  })
})
