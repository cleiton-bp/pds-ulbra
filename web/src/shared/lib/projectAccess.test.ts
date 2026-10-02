import { describe, expect, it } from 'vitest'
import type { ProjectViewModel } from '@/contracts'
import { canConfigure, groupByAccount, roleLabel } from '@/shared/lib/projectAccess'

/**
 * O QUE ESTES TESTES TRAVAM, E POR QUE.
 *
 * `canConfigure` decide o que o menu mostra: errar para mais poe na frente do
 * membro telas em que todo salvar volta 403; errar para menos esconde a
 * configuracao de quem manda no projeto.
 *
 * `groupByAccount` decide a ordem do hub e do seletor: a conta propria vem
 * primeiro **mesmo com nome que viria depois em ordem alfabetica** — e a conta da
 * pessoa, e e onde nasce o projeto que ela cria.
 */
function projeto(
  publicId: string,
  conta: { id: string; nome: string },
  role: ProjectViewModel['Role'],
  dono: boolean,
): ProjectViewModel {
  return {
    PublicId: publicId,
    Name: `Projeto ${publicId}`,
    Status: 'Active',
    CreatedAt: '2026-10-01T12:00:00.000Z',
    UpdatedAt: '2026-10-01T12:00:00.000Z',
    Account: { PublicId: conta.id, Name: conta.nome },
    Role: role,
    IsAccountOwner: dono,
  }
}

const minha = { id: 'c-minha', nome: 'Zeta, a minha' }
const daAna = { id: 'c-ana', nome: 'Conta da Ana' }
const doBruno = { id: 'c-bruno', nome: 'Conta do Bruno' }

describe('canConfigure', () => {
  it('administrador e dono configuram; membro não', () => {
    expect(canConfigure(projeto('a', minha, 'Administrator', true))).toBe(true)
    expect(canConfigure(projeto('b', daAna, 'Administrator', false))).toBe(true)
    expect(canConfigure(projeto('c', daAna, 'Member', false))).toBe(false)
  })
})

describe('roleLabel', () => {
  it('a dona aparece como dona, e não como administradora', () => {
    expect(roleLabel(projeto('a', minha, 'Administrator', true))).toBe('Dono')
    expect(roleLabel(projeto('b', daAna, 'Administrator', false))).toBe('Administrador')
    expect(roleLabel(projeto('c', daAna, 'Member', false))).toBe('Membro')
  })
})

describe('groupByAccount', () => {
  it('põe a conta própria primeiro e as outras em ordem de nome, mantendo a ordem dentro do grupo', () => {
    const grupos = groupByAccount([
      projeto('b1', doBruno, 'Member', false),
      projeto('m1', minha, 'Administrator', true),
      projeto('a1', daAna, 'Member', false),
      projeto('m2', minha, 'Administrator', true),
      projeto('a2', daAna, 'Administrator', false),
    ])

    expect(grupos.map((g) => [g.account.Name, g.own])).toEqual([
      ['Zeta, a minha', true],
      ['Conta da Ana', false],
      ['Conta do Bruno', false],
    ])
    expect(grupos[0]?.projects.map((p) => p.PublicId)).toEqual(['m1', 'm2'])
    expect(grupos[1]?.projects.map((p) => p.PublicId)).toEqual(['a1', 'a2'])
  })

  it('com uma conta só, um grupo só', () => {
    const grupos = groupByAccount([projeto('m1', minha, 'Administrator', true)])
    expect(grupos).toHaveLength(1)
    expect(grupos[0]?.own).toBe(true)
  })

  it('lista vazia, nenhum grupo', () => {
    expect(groupByAccount([])).toEqual([])
  })
})
