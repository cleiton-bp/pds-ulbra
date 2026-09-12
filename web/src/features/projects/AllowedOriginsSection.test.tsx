// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectOriginViewModel } from '@/contracts'
import { AllowedOriginsSection } from '@/features/projects/AllowedOriginsSection'

/**
 * O QUE ESTES TESTES TRAVAM, E POR QUE.
 *
 * Dois deles sao de comportamento: o curinga aparece na lista como `*.` (a coluna
 * e um sim/nao, e quem escreve o asterisco e a tela), e o que entra na lista
 * depois de adicionar e a forma **normalizada pela API**, e nao o que foi
 * digitado — reaproveitar o texto do campo deixaria `HTTPS://Loja.com/` na tela
 * ate alguem recarregar.
 *
 * O terceiro e de honestidade, e e o mais facil de quebrar sem querer: enquanto
 * nao existir carregador, nenhuma linha do sistema le esta tabela, e a tela nao
 * pode dizer que bloqueia coisa nenhuma. O desenho tem a frase de bloqueio pronta
 * para o dia em que ela for verdade; ate la, quem copiar essa frase para ca
 * reprova aqui.
 */
const dublê = vi.hoisted(() => ({
  listar: vi.fn<() => Promise<ProjectOriginViewModel[]>>(),
  adicionar: vi.fn(),
  remover: vi.fn(),
}))

vi.mock('@/data', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data')>()

  return {
    ...real,
    projectOriginService: {
      listProjectOrigins: dublê.listar,
      addProjectOrigin: dublê.adicionar,
      removeProjectOrigin: dublê.remover,
    },
  }
})

function origem(publicId: string, domain: string, subdominios = false): ProjectOriginViewModel {
  return {
    PublicId: publicId,
    Domain: domain,
    AllowsSubdomains: subdominios,
    CreatedAt: '2026-09-01T12:00:00.000Z',
  }
}

const campo = () => screen.getByRole('textbox', { name: 'Endereço do seu site' })
const botaoAdicionar = () => screen.getByRole('button', { name: 'Adicionar domínio' })

describe('AllowedOriginsSection', () => {
  afterEach(cleanup)

  beforeEach(() => {
    dublê.listar.mockReset()
    dublê.adicionar.mockReset()
    dublê.remover.mockReset()
  })

  it('escreve o curinga na frente de quem aceita subdomínio, e só nele', async () => {
    dublê.listar.mockResolvedValue([
      origem('o-1', 'loja.exemplo.com'),
      origem('o-2', 'exemplo.com', true),
    ])

    render(<AllowedOriginsSection projectPublicId="p-1" />)

    expect(await screen.findByText('loja.exemplo.com')).toBeTruthy()
    expect(screen.getByText('*.exemplo.com')).toBeTruthy()
    // O dominio cru do curinga nao pode aparecer sozinho em lugar nenhum.
    expect(screen.queryByText('exemplo.com')).toBeNull()
  })

  it('mostra na lista o domínio normalizado pela API, e não o que foi digitado', async () => {
    dublê.listar.mockResolvedValue([])
    dublê.adicionar.mockResolvedValue(origem('o-3', 'loja.com'))

    render(<AllowedOriginsSection projectPublicId="p-1" />)
    await waitFor(() => expect(campo()).toBeTruthy())

    fireEvent.change(campo(), { target: { value: 'HTTPS://Loja.com/' } })
    fireEvent.click(botaoAdicionar())

    expect(await screen.findByText('loja.com')).toBeTruthy()
    expect(screen.queryByText('HTTPS://Loja.com/')).toBeNull()
    expect(dublê.adicionar).toHaveBeenCalledWith('p-1', {
      Domain: 'HTTPS://Loja.com/',
      AllowsSubdomains: false,
    })
  })

  it('põe a recusa da API no próprio campo, que é onde há o que corrigir', async () => {
    const { PanelError } = await import('@/data')
    dublê.listar.mockResolvedValue([])
    dublê.adicionar.mockRejectedValue(
      new PanelError('Este dominio ja esta autorizado neste projeto.', 409),
    )

    render(<AllowedOriginsSection projectPublicId="p-1" />)
    await waitFor(() => expect(campo()).toBeTruthy())

    fireEvent.change(campo(), { target: { value: 'loja.com' } })
    fireEvent.click(botaoAdicionar())

    expect(await screen.findByText('Este dominio ja esta autorizado neste projeto.')).toBeTruthy()
  })

  it('quando a lista não carrega, diz o que continua valendo e oferece tentar de novo', async () => {
    dublê.listar.mockRejectedValue(new Error('rede'))

    render(<AllowedOriginsSection projectPublicId="p-1" />)

    expect(await screen.findByRole('button', { name: 'Tentar de novo' })).toBeTruthy()
    expect(screen.getByText(/continua exatamente como estava/)).toBeTruthy()
    // Sem a lista, nao ha o que adicionar: o campo nao aparece prometendo gravar.
    expect(screen.queryByRole('textbox', { name: 'Endereço do seu site' })).toBeNull()
  })

  it('não afirma que bloqueia nada enquanto a ferramenta não estiver no ar', async () => {
    dublê.listar.mockResolvedValue([])

    const { container } = render(<AllowedOriginsSection projectPublicId="p-1" />)
    await waitFor(() => expect(campo()).toBeTruthy())

    const texto = container.textContent ?? ''

    // A frase do desenho ("o bloqueio passa a valer...") so vale quando alguem
    // ler esta tabela, e ninguem le: o `frame-ancestors` ainda nao existe.
    expect(texto).not.toMatch(/bloqueio|bloquea|bloqueia/i)
    expect(texto).toMatch(/ainda não vale/)
    expect(texto).toMatch(/ainda não é conferida/)

    // O pds-013 pos a ferramenta no ar. Dizer o contrario passou a ser mentira, e
    // a frase antiga estava presa aqui por uma asserticao — que e o jeito de um
    // teste de honestidade envelhecer para o lado errado.
    expect(texto).not.toMatch(/ainda não está no ar|não está no ar/)
  })
})
