/**
 * Testes do que os dois ambientes dividem: comentario no yaml, endereco da tela e
 * as regras do servidor sobre qual pasta e qual nome aceitar.
 *
 * Roda com `npm test`, carregando os modulos TypeScript pelo proprio Vite.
 */

import { after, before, describe, it } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

let server
let hasYamlComments
let parseHash
let routeHash
let files
let fitSides
let boardRoom
let explain
let steps

before(async () => {
  server = await createServer({
    root: ROOT,
    configFile: path.join(ROOT, 'vite.config.ts'),
    server: { middlewareMode: true },
    logLevel: 'error',
  })
  ;({ hasYamlComments } = await server.ssrLoadModule('/src/shared/yamlComments.ts'))
  ;({ parseHash, routeHash } = await server.ssrLoadModule('/src/shared/navigation.tsx'))
  files = await server.ssrLoadModule('/server/files.ts')
  ;({ fitSides, boardRoom } = await server.ssrLoadModule('/src/shared/useResizable.ts'))
  explain = await server.ssrLoadModule('/src/tour/explain.ts')
  steps = await server.ssrLoadModule('/src/tour/steps.ts')
})

after(async () => { await server?.close() })

describe('comentário no arquivo', () => {
  it('percebe comentário no topo, no fim da linha e no meio da lista', () => {
    assert.equal(hasYamlComments('# topo\nactors: [Relator]\n'), true)
    assert.equal(hasYamlComments('actors: [Relator] # no fim da linha\n'), true)
    assert.equal(hasYamlComments('actors:\n  # no meio\n  - Relator\n'), true)
    assert.equal(hasYamlComments('meta:\n  title: T\n# no fim do arquivo\n'), true)
  })

  it('não confunde # dentro de texto com comentário', () => {
    assert.equal(hasYamlComments('actors: [Relator]\n'), false)
    // Sem espaco antes, o # e parte do texto; com espaco, o yaml le comentario.
    assert.equal(hasYamlComments('meta:\n  title: "Etapa #1"\n  description: cor#fff\n'), false)
    assert.equal(hasYamlComments('meta:\n  description: cor #fff\n'), true)
  })

  it('yaml quebrado responde que não, porque esse caso é barrado pelo erro de sintaxe', () => {
    assert.equal(hasYamlComments('meta:\n  title: [sem fechar # x\n'), false)
  })
})

describe('endereço da tela', () => {
  it('lê o ambiente e o arquivo do #', () => {
    assert.deepEqual(parseHash('#/modeling/07-media-attachments.yaml'), { env: 'modeling', file: '07-media-attachments.yaml' })
    assert.deepEqual(parseHash('#/use-cases'), { env: 'use-cases', file: null })
    assert.deepEqual(parseHash('#/'), { env: null, file: null })
    assert.deepEqual(parseHash(''), { env: null, file: null })
  })

  it('endereço desconhecido cai no início, em vez de abrir um editor qualquer', () => {
    assert.deepEqual(parseHash('#/outra-coisa/x.yaml'), { env: null, file: null })
  })

  it('ida e volta do endereço', () => {
    for (const route of [
      { env: null, file: null },
      { env: 'modeling', file: null },
      { env: 'use-cases', file: 'example.yaml' },
    ]) assert.deepEqual(parseHash(routeHash(route)), route)
  })
})

describe('servidor: pasta e nome', () => {
  it('só abre as duas pastas de conteúdo', () => {
    // Uma pasta por ambiente, as duas dentro de `database-models/`.
    for (const collection of ['modeling', 'use-cases']) {
      const dir = files.collectionDir(collection)
      assert.equal(path.basename(dir), collection)
      assert.equal(path.basename(path.dirname(dir)), 'database-models')
    }
    for (const name of ['src', '..', 'files', 'database-models', 'constructor', '__proto__', 'toString']) {
      assert.throws(() => files.collectionDir(name), (err) => err.status === 404, name)
    }
  })

  it('recusa nome que sairia da pasta, sem tocar no disco', async () => {
    for (const name of ['../package.json', 'a/b.yaml', '.hidden.yaml', 'x.json', '', '..yaml', 42]) {
      await assert.rejects(files.readFile('use-cases', name), (err) => err.status === 400, String(name))
    }
  })
})

describe('o que a lista do início mostra de cada arquivo', () => {
  it('conta as tabelas sem as colunas padrão, e os casos de uso', async () => {
    const modeling = (await files.listFiles('modeling')).files.find((file) => file.name === '15-performance.yaml')
    assert.equal(modeling.count, 35)
    const useCases = (await files.listFiles('use-cases')).files.find((file) => file.name === 'example.yaml')
    assert.ok(useCases.count > 0)
  })

  it('fala no singular e no plural', async () => {
    const { countLabel } = await server.ssrLoadModule('/src/shell/Home.tsx')
    assert.equal(countLabel('modeling', 1), '1 tabela')
    assert.equal(countLabel('modeling', 36), '36 tabelas')
    assert.equal(countLabel('use-cases', 1), '1 caso de uso')
    assert.equal(countLabel('use-cases', 0), 'nenhum caso de uso')
  })
})

describe('endereço malformado', () => {
  it('um % sem par não quebra a tela: abre o ambiente sem arquivo', () => {
    assert.deepEqual(parseHash('#/modeling/%E0%A4%A'), { env: 'modeling', file: null })
  })
})

describe('largura das laterais', () => {
  it('o desenho guarda 40% da janela, e nunca menos de 520px', () => {
    assert.equal(boardRoom(1440), 576)
    assert.equal(boardRoom(1024), 520)
  })

  it('cabendo, cada lateral fica com a largura escolhida', () => {
    assert.deepEqual(fitSides([{ width: 264, min: 200 }, { width: 380, min: 300 }], 864), [264, 380])
  })

  it('sem caber, cada uma cede na proporção do que tem acima do mínimo', () => {
    // 440 + 640 em 768: sobram 312 a tirar; 240 e 340 acima dos mínimos.
    const [files, panel] = fitSides([{ width: 440, min: 200 }, { width: 640, min: 300 }], 768)
    assert.equal(files + panel, 768)
    assert.ok(files >= 200 && panel >= 300)
    assert.equal(files, 311)
  })

  it('nenhuma passa abaixo do mínimo, mesmo sem lugar para as duas', () => {
    assert.deepEqual(fitSides([{ width: 440, min: 200 }, { width: 640, min: 300 }], 400), [200, 300])
  })

  it('a faixa fechada não cede', () => {
    assert.deepEqual(fitSides([{ width: 44, min: 44 }, { width: 640, min: 300 }], 500), [44, 456])
  })
})

describe('tour', () => {
  it('o assunto do arquivo é a primeira frase, até os dois-pontos', () => {
    assert.equal(explain.gist('Quem do time entra em cada projeto, e com que papel. O resto é detalhe.'), 'Quem do time entra em cada projeto, e com que papel.')
    assert.equal(explain.gist('O projeto passa a ver de onde vêm os relatos: a lista fica no projeto.'), 'O projeto passa a ver de onde vêm os relatos.')
    assert.equal(explain.gist('Conta e projeto, que vêm antes,: o resto depois.'), 'Conta e projeto, que vêm antes.')
    assert.equal(explain.gist('Limites por projeto; as contagens ficam na memória.'), 'Limites por projeto.')
    assert.equal(explain.gist('Uma lista fixa — defeito e dúvida — passa a ser do projeto.'), 'Uma lista fixa passa a ser do projeto.')
    assert.equal(explain.gist('Chamar quem trabalha junto — por projeto —, cuidar do time.'), 'Chamar quem trabalha junto, cuidar do time.')
    assert.equal(explain.gist(''), '')
  })

  it('lista nomes curta, e conta o que passou do limite', () => {
    assert.equal(explain.names(['reports']), 'reports')
    assert.equal(explain.names(['a', 'b']), 'a e b')
    assert.equal(explain.names(['a', 'b', 'c']), 'a, b e c')
    assert.equal(explain.names(['a', 'b', 'c', 'd', 'e']), 'a, b, c e mais 2')
  })

  it('o roteiro de cada arquivo deixa fora o que não vale nele', () => {
    const all = steps.stepsFor(steps.MODELING_TOUR, { comparing: true, 'has-changes': true })
    const first = steps.stepsFor(steps.MODELING_TOUR, {})
    assert.equal(all.length, steps.MODELING_TOUR.length)
    assert.ok(first.every((step) => !step.when))
    assert.ok(first.length < all.length)
    // Casos de uso sem os passos escritos ficam sem o "Por dentro".
    const written = steps.stepsFor(steps.USE_CASES_TOUR, { 'has-flow': true })
    const planned = steps.stepsFor(steps.USE_CASES_TOUR, {})
    assert.equal(written.length, planned.length + 1)
  })

  it('os textos do roteiro são curtos, numa frase só, sem travessão nem ponto no meio', () => {
    for (const step of [...steps.MODELING_TOUR, ...steps.USE_CASES_TOUR]) {
      assert.ok(step.title.split(' ').length <= 3, `título longo: ${step.title}`)
      assert.ok(step.text.split(' ').length <= 14, `texto longo: ${step.text}`)
      assert.doesNotMatch(`${step.title} ${step.text}`, /[—–·]|\s-\s/, `travessão ou ponto no meio: ${step.text}`)
      assert.doesNotMatch(step.text, /[.!?]\s+\S/, `duas frases: ${step.text}`)
    }
  })
})

