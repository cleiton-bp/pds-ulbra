// Gera, dentro do build, as respostas da API de arquivos como arquivos estaticos: e o que o
// editor publicado so para leitura le no lugar do servidor do Vite (ver src/shared/readOnly.ts).
//
//   node scripts/exportar-leitura.mjs dist
//
//   GET /api/<pasta>/files          -> dist/api/<pasta>/files.json
//   GET /api/<pasta>/file?name=X    -> dist/api/<pasta>/file/X.json
//
// O Caddy do editor (deploy/editor/Caddyfile) reescreve as duas rotas para esses arquivos e
// recusa qualquer gravacao. A leitura e a mesma do servidor (server/files.ts), entao o
// formato das respostas nao tem como divergir. Precisa de um Node que leia TypeScript sem
// compilar (22.18+).
import fs from 'node:fs/promises'
import path from 'node:path'
import { listFiles, readFile } from '../server/files.ts'

const destino = process.argv[2]
if (!destino) {
  console.error('uso: node scripts/exportar-leitura.mjs <pasta do build>')
  process.exit(1)
}

for (const pasta of ['modeling', 'use-cases']) {
  const lista = await listFiles(pasta)
  const raiz = path.join(destino, 'api', pasta)
  await fs.mkdir(path.join(raiz, 'file'), { recursive: true })
  // O caminho no disco do servidor nao interessa a quem le, e nao deve sair daqui.
  await fs.writeFile(path.join(raiz, 'files.json'), JSON.stringify({ dir: `database-models/${pasta}`, files: lista.files }))
  for (const { name } of lista.files) {
    await fs.writeFile(path.join(raiz, 'file', `${name}.json`), JSON.stringify(await readFile(pasta, name)))
  }
  console.log(`${pasta}: ${lista.files.length} arquivos`)
}
