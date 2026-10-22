import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  normalizeSearch,
  SETTINGS_INDEX,
  searchSettings,
  settingTarget,
} from '@/app/configure/settingsIndex'
import { CONFIG_AREAS, sectionByKey } from '@/app/navigation'

/**
 * O QUE ESTES TESTES TRAVAM, E POR QUE.
 *
 * **A busca acha pelo que a pessoa digita**, e nao so pelo nome da tela: sem acento e
 * sem caixa ("dominio" acha "Domínios autorizados"), por sinonimo ("spam" acha os
 * limites) e com mais de uma palavra.
 *
 * **O indice nao aponta para o vazio.** Ele e escrito a mao, e a tela muda sem ele
 * saber: cada ancora daqui precisa existir no codigo das telas, como `id`. Quem mover
 * um campo de tela e esquecer o indice ve este teste falhar com o nome da ancora.
 *
 * **Toda tela das areas tem pelo menos uma opcao no indice**: tela que a busca nao
 * acha e tela que so se encontra passeando.
 */
describe('a busca da configuração', () => {
  it('acha sem acento e sem caixa', () => {
    const nomes = searchSettings('DOMINIO').map((achado) => achado.entry.label)
    expect(nomes).toContain('Domínios autorizados')
    expect(normalizeSearch('Domínio Ç')).toBe('dominio c')
  })

  it('acha por sinônimo, e diz a tela e a área', () => {
    const [primeiro, ...resto] = searchSettings('spam')
    const nomes = [primeiro, ...resto].map((achado) => achado?.entry.label)
    expect(nomes).toContain('Limites de relatos')
    expect(nomes).toContain('Bloquear um domínio')

    const limites = searchSettings('spam').find(
      (achado) => achado.entry.label === 'Limites de relatos',
    )
    // Os limites moram em Domínios, junto do resto da protecao do site.
    expect(limites?.screen.label).toBe('Domínios')
    expect(limites?.area?.label).toBe('O seu sistema')
    expect(limites?.to).toBe('domains#limites')
  })

  it('o nome vale mais que o sinônimo, e cada palavra precisa aparecer', () => {
    expect(searchSettings('cor')[0]?.entry.label).toBe('Cor do botão')
    expect(searchSettings('cor texto')[0]?.entry.label).toBe('Cor do texto do botão')
    expect(searchSettings('prazo').map((achado) => achado.entry.label)).toEqual(
      expect.arrayContaining(['Destaque do prazo', 'Prazo do convite']),
    )
    expect(searchSettings('zzz')).toEqual([])
    expect(searchSettings('   ')).toEqual([])
  })

  it('os campos que mudaram de tela apontam para a tela do assunto', () => {
    const alvo = (label: string) => {
      const entry = SETTINGS_INDEX.find((item) => item.label === label)
      return entry && settingTarget(entry)
    }
    expect(alvo('Título do formulário')).toBe('form-texts#titulo-do-formulario')
    expect(alvo('Perguntar o nome de quem relata')).toBe('form-texts#perguntar-nome')
    expect(alvo('Texto da pergunta do nome')).toBe('form-texts#pergunta-do-nome')
    expect(alvo('Mensagem de confirmação')).toBe('identity#confirmacao')
    expect(alvo('Aviso de que o relato pode virar público')).toBe('identity#aviso-publico')
    expect(alvo('O que quem relatou vê em cada coluna')).toBe('states#colunas-no-andamento')
    expect(alvo('Limite por pessoa')).toBe('domains#limite-por-pessoa')
  })

  it('o endereço é a tela com a âncora do campo', () => {
    const cor = SETTINGS_INDEX.find((entry) => entry.label === 'Cor do botão')
    expect(cor && settingTarget(cor)).toBe('tool#cor-do-botao')
    // Sem ancora, a tela: a lista inteira e o assunto.
    const etiquetas = SETTINGS_INDEX.find((entry) => entry.label === 'Etiquetas')
    expect(etiquetas && settingTarget(etiquetas)).toBe('labels')
  })
})

describe('o índice', () => {
  it('cada opção aponta para uma tela que existe', () => {
    for (const entry of SETTINGS_INDEX) {
      expect(sectionByKey(entry.section), entry.label).toBeTruthy()
    }
  })

  it('toda tela das áreas tem pelo menos uma opção', () => {
    const comOpcao = new Set(SETTINGS_INDEX.map((entry) => entry.section))
    for (const area of CONFIG_AREAS) {
      for (const section of area.sections) {
        expect(comOpcao.has(section.key), `${area.label} · ${section.label}`).toBe(true)
      }
    }
  })

  it('cada âncora existe no código das telas', () => {
    const codigo = lerTelas()
    const faltando = SETTINGS_INDEX.filter(
      (entry) =>
        entry.anchor !== undefined &&
        !codigo.includes(`"${entry.anchor}"`) &&
        !codigo.includes(`'${entry.anchor}'`),
    ).map((entry) => `${entry.label} → #${entry.anchor}`)

    expect(faltando).toEqual([])
  })
})

/** O codigo de todas as telas, junto: as ancoras sao `id="..."` ou um mapa de ids. */
function lerTelas(): string {
  const raiz = fileURLToPath(new URL('../../features', import.meta.url))
  const partes: string[] = []
  const andar = (pasta: string) => {
    for (const nome of readdirSync(pasta)) {
      const caminho = join(pasta, nome)
      if (statSync(caminho).isDirectory()) andar(caminho)
      else if (nome.endsWith('.tsx') && !nome.includes('.test.')) {
        partes.push(readFileSync(caminho, 'utf8'))
      }
    }
  }
  andar(raiz)
  return partes.join('\n')
}
