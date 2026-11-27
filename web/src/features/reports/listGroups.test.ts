// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import type { ReportStateCountViewModel, TeamMemberViewModel } from '@/contracts'
import { buildListGroups, listGroupKeyOf } from '@/features/reports/listGroups'

/**
 * O QUE ESTES TESTES TRAVAM.
 *
 * **Nenhum card fica sem bloco.** A coluna, a prioridade e o tipo aposentados entram, e
 * sempre ha o bloco de quem nao tem ("Sem coluna", "Sem responsável", "Sem prioridade",
 * "Cards do time"). **O filtro na mesma dimensao recorta os blocos**: com o filtro de uma
 * pessoa, so o bloco dela.
 */
const nada = { columns: [], assignees: [], priorities: [], types: [] }
const semFontes = { colunas: null, pessoas: null, prioridades: null, tipos: null }

const coluna = (
  id: string | null,
  nome: string | null,
  extra: Partial<ReportStateCountViewModel> = {},
): ReportStateCountViewModel => ({
  StatePublicId: id,
  StateName: nome,
  IsActive: true,
  ClosesReport: false,
  Total: 1,
  ...extra,
})

const pessoa = (id: string, nome: string, voce = false): TeamMemberViewModel =>
  ({
    UserPublicId: id,
    Name: nome,
    Email: `${id}@exemplo.test`,
    AvatarUrl: null,
    Role: 'Member',
    IsAccountOwner: false,
    IsYou: voce,
    JoinedAt: null,
  }) as TeamMemberViewModel

describe('os blocos da lista', () => {
  it('por coluna: as ativas na ordem, as desativadas depois, e "Sem coluna" no fim; a que encerra recolhida', () => {
    const blocos = buildListGroups(
      'state',
      {
        ...semFontes,
        colunas: [
          coluna(null, null),
          coluna('s-1', 'A fazer'),
          coluna('s-velha', 'Antiga', { IsActive: false }),
          coluna('s-2', 'Feito', { ClosesReport: true }),
        ],
      },
      nada,
    )
    expect(blocos?.map((b) => [b.key, b.label, b.collapsedByDefault])).toEqual([
      ['s-1', 'A fazer', false],
      ['s-2', 'Feito', true],
      ['s-velha', 'Antiga', false],
      ['none', 'Sem coluna', false],
    ])
    expect(blocos?.[0]?.read).toEqual({ columns: ['s-1'] })
  })

  it('enquanto a fonte nao chega, nao ha blocos ainda; sem blocos, a lista e corrida', () => {
    expect(buildListGroups('state', semFontes, nada)).toBeNull()
    expect(buildListGroups('none', semFontes, nada)).toEqual([])
  })

  it('por responsavel: quem olha primeiro, o time pelo nome, e "Sem responsável" no fim', () => {
    const blocos = buildListGroups(
      'assignee',
      {
        ...semFontes,
        pessoas: [pessoa('u-z', 'Zeca'), pessoa('u-a', 'Ana'), pessoa('u-eu', 'Cleiton', true)],
      },
      nada,
    )
    expect(blocos?.map((b) => b.label)).toEqual([
      'Cleiton (você)',
      'Ana',
      'Zeca',
      'Sem responsável',
    ])
    expect(blocos?.at(-1)?.read).toEqual({ filters: { assignees: ['none'] } })
  })

  it('o filtro na mesma dimensao recorta os blocos, e o "eu" do filtro e quem olha', () => {
    const blocos = buildListGroups(
      'assignee',
      { ...semFontes, pessoas: [pessoa('u-a', 'Ana'), pessoa('u-eu', 'Cleiton', true)] },
      { ...nada, assignees: ['me', 'none'] },
    )
    expect(blocos?.map((b) => b.key)).toEqual(['u-eu', 'none'])
  })

  it('por prioridade e por tipo: as aposentadas depois das ativas, e o bloco de quem nao tem', () => {
    const prioridades = buildListGroups(
      'priority',
      {
        ...semFontes,
        prioridades: [
          {
            PublicId: 'p-velha',
            Name: 'Urgentissima',
            Color: 'Red',
            Position: 0,
            IsActive: false,
            CreatedAt: '',
          },
          {
            PublicId: 'p-alta',
            Name: 'Alta',
            Color: 'Orange',
            Position: 1,
            IsActive: true,
            CreatedAt: '',
          },
        ],
      },
      nada,
    )
    expect(prioridades?.map((b) => b.key)).toEqual(['p-alta', 'p-velha', 'none'])

    const tipos = buildListGroups(
      'type',
      {
        ...semFontes,
        tipos: [
          {
            PublicId: 't-1',
            Name: 'Defeito',
            Color: 'Red',
            Icon: 'Bug',
            Position: 0,
            IsActive: true,
            Questions: [],
            ShowsTextBox: false,
          },
        ] as never,
      },
      nada,
    )
    expect(tipos?.map((b) => [b.key, b.label])).toEqual([
      ['t-1', 'Defeito'],
      ['team', 'Cards do time'],
    ])
  })

  it('a chave do card diz em que bloco ele mora', () => {
    const card = {
      StatePublicId: 's-1',
      Assignee: null,
      Priority: { PublicId: 'p-alta' },
      Kind: 'Team',
      Type: null,
    } as never
    expect(listGroupKeyOf(card, 'state')).toBe('s-1')
    expect(listGroupKeyOf(card, 'assignee')).toBe('none')
    expect(listGroupKeyOf(card, 'priority')).toBe('p-alta')
    expect(listGroupKeyOf(card, 'type')).toBe('team')
  })
})
