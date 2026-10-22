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
 * A lista nao abre nem fecha a ferramenta: ela separa o relato que entra direto no
 * Trabalho do que espera em "Aguardando liberacao". Com a lista vazia, todo endereco
 * novo espera — dizer que ela "abre em qualquer endereco" seria a frase de antes, e
 * deixou de ser verdade.
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

const campo = () => screen.getByRole('textbox', { name: 'Endereço do seu sistema' })
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

    // A API escreve sem acento (convencao da casa); a tela acentua no caminho.
    expect(await screen.findByText('Este domínio já está autorizado neste projeto.')).toBeTruthy()
  })

  it('quando a lista não carrega, diz o que continua valendo e oferece tentar de novo', async () => {
    dublê.listar.mockRejectedValue(new Error('rede'))

    render(<AllowedOriginsSection projectPublicId="p-1" />)

    expect(await screen.findByRole('button', { name: 'Tentar de novo' })).toBeTruthy()
    expect(screen.getByText(/continua exatamente como estava/)).toBeTruthy()
    // Sem a lista, nao ha o que adicionar: o campo nao aparece prometendo gravar.
    expect(screen.queryByRole('textbox', { name: 'Endereço do seu sistema' })).toBeNull()
  })

  it('com a lista vazia, diz que o primeiro relato de cada endereço espera — e não que abre em qualquer um', async () => {
    dublê.listar.mockResolvedValue([])

    const { container } = render(<AllowedOriginsSection projectPublicId="p-1" />)
    await waitFor(() => expect(campo()).toBeTruthy())

    const texto = container.textContent ?? ''

    // Lista vazia e o estado de todo projeto novo: a tela precisa dizer o que **esta**
    // acontecendo — o relato de endereco novo chega e espera a decisao.
    expect(texto).toMatch(/primeiro relato de cada endereço pede a sua decisão/)
    expect(texto).toMatch(/Aguardando liberação/)
    // A frase de quando a lista vazia deixava tudo entrar.
    expect(texto).not.toMatch(/abre em qualquer endereço/)

    // As duas frases da espera, que eram verdade e deixaram de ser.
    expect(texto).not.toMatch(/ainda não vale|ainda não é conferida|não está no ar/)

    // A conferencia vale sempre, entao a ressalva sobre o que ela nao pega tambem.
    expect(texto).toMatch(/caso comum/)
  })

  it('o vazio diz o que fazer: o primeiro relato espera, e o teste local é localhost:3000', async () => {
    dublê.listar.mockResolvedValue([])

    render(<AllowedOriginsSection projectPublicId="p-1" />)

    const vazio = await screen.findByText(/Nenhum endereço autorizado ainda/)
    expect(vazio.textContent).toMatch(/pede a sua decisão, em “Aguardando liberação”/)
    expect(vazio.textContent).toMatch(/localhost:3000/)
    // O campo continua logo abaixo: o vazio explica, e nao substitui o convite.
    expect(campo()).toBeTruthy()
  })

  it('a explicação longa fica recolhida em "Como funciona", e aponta os limites na aba Proteção', async () => {
    dublê.listar.mockResolvedValue([origem('o-1', 'loja.exemplo.com')])

    const { container } = render(<AllowedOriginsSection projectPublicId="p-1" />)
    expect(await screen.findByText('loja.exemplo.com')).toBeTruthy()

    const ajuda = container.querySelector('details')
    expect(ajuda?.open).toBe(false)
    expect(ajuda?.querySelector('summary')?.textContent).toBe('Como funciona')
    expect(ajuda?.textContent).toMatch(/caso comum/)
    expect(ajuda?.textContent).toMatch(/na aba Proteção/)
    expect(ajuda?.textContent).not.toMatch(/Mais opções/)
    // Fechada, a ajuda nao conta como lista vazia: sem o texto do vazio.
    expect(container.textContent).not.toMatch(/Nenhum endereço autorizado ainda/)
  })

  it('com a lista cheia, diz o que a lista faz sem prometer impossibilidade', async () => {
    dublê.listar.mockResolvedValue([origem('o-1', 'loja.exemplo.com')])

    const { container } = render(<AllowedOriginsSection projectPublicId="p-1" />)
    expect(await screen.findByText('loja.exemplo.com')).toBeTruthy()

    const texto = container.textContent ?? ''

    expect(texto).toMatch(/entra direto no Trabalho/)
    expect(texto).toMatch(/Aguardando liberação/)
    // Tirar um endereco da lista nao mexe no que ja entrou.
    expect(texto).toMatch(/vale para o próximo relato/)
    expect(texto).not.toMatch(/primeiro relato de cada endereço/)
    // A ressalva anda junto com a promessa. Sem ela, a tela venderia como muro
    // uma conferencia que qualquer um contorna falando direto com a API.
    expect(texto).toMatch(/caso comum/)

    // Palavras que prometeriam o que esta conferencia nao da.
    expect(texto).not.toMatch(/impede|impossível|garante|ninguém mais/i)
  })
})
