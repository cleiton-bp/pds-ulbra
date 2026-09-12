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
 * Os dois ultimos sao de honestidade, e sao os mais faceis de quebrar sem querer.
 * Eles trocaram de lado na pds-016: ate a pds-015 a tela **nao podia** dizer que
 * restringia, porque nenhuma linha do sistema lia esta tabela; agora ela e
 * conferida nas duas rotas publicas, e o que passou a ser mentira e o contrario.
 *
 * O que continua sendo mentira, e por isso tem asserticao negativa: **muro.** Quem
 * declara o endereco e o carregador, que e codigo nosso — a lista pega a chave
 * colada no site errado, e nao pega quem fala direto com a API. Palavra de
 * impossibilidade nesta tela reprova aqui.
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

  it('com a lista vazia, diz que abre em qualquer endereço — e não que restringe', async () => {
    dublê.listar.mockResolvedValue([])

    const { container } = render(<AllowedOriginsSection projectPublicId="p-1" />)
    await waitFor(() => expect(campo()).toBeTruthy())

    const texto = container.textContent ?? ''

    // Lista vazia nao restringe nada, e e o estado de todo projeto que existe
    // hoje: a tela precisa dizer o que **esta** acontecendo, e nao o que a lista
    // faria se tivesse alguma linha.
    expect(texto).toMatch(/abre em qualquer endereço/)
    // E precisa dizer o que muda no primeiro endereco, porque a consequencia
    // ultrapassa a linha que a pessoa esta adicionando: os outros sites param.
    expect(texto).toMatch(/primeiro endereço/)

    // As duas frases da espera, que eram verdade e deixaram de ser.
    expect(texto).not.toMatch(/ainda não vale|ainda não é conferida|não está no ar/)

    // A ressalva sobre o que a conferencia nao pega nao aparece aqui: nao ha
    // conferencia ligada para ressalvar.
    expect(texto).not.toMatch(/caso comum/)
  })

  it('com a lista cheia, diz que restringe sem prometer impossibilidade', async () => {
    dublê.listar.mockResolvedValue([origem('o-1', 'loja.exemplo.com')])

    const { container } = render(<AllowedOriginsSection projectPublicId="p-1" />)
    expect(await screen.findByText('loja.exemplo.com')).toBeTruthy()

    const texto = container.textContent ?? ''

    expect(texto).toMatch(/só abre nos endereços desta lista/)
    // A ressalva anda junto com a promessa. Sem ela, a tela venderia como muro
    // uma conferencia que qualquer um contorna falando direto com a API.
    expect(texto).toMatch(/caso comum/)

    // Palavras que prometeriam o que o `frame-ancestors` vai dar, e que esta
    // conferencia nao da.
    expect(texto).not.toMatch(/impede|impossível|garante|ninguém mais/i)
  })
})
