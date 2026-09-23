// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CreatedReportViewModel, PublicMediaSettingsViewModel } from '@/contracts'
import { EmbedApp } from '@/embed/EmbedApp'
import { DEFAULT_WIDGET_SETTINGS } from '@/embed/settings'

/**
 * O QUE ESTES TESTES TRAVAM.
 *
 * **O relato vem antes do arquivo, e o texto nunca depende do arquivo.** Enquanto
 * a pessoa escreve nada sobe; o envio comeca depois de o relato existir, com as
 * credenciais que sairam dele. E quando o arquivo falha, o protocolo continua na
 * tela e a frase diz que o texto esta salvo — e a parte que nao pode se perder.
 *
 * **Sem configuracao de midia, nao ha botao.** O quadro nao oferece o que nao sabe
 * se funciona.
 *
 * **Colar anexa.** E como se anexa print de verdade, e um teste que so
 * exercitasse o seletor deixaria a colagem quebrar em silencio.
 */
const dublê = vi.hoisted(() => ({ criar: vi.fn(), enviar: vi.fn() }))

vi.mock('@/data/publicIndex', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data/publicIndex')>()
  return { ...real, reportService: { createReport: dublê.criar } }
})

vi.mock('@/embed/sendAttachment', () => ({ sendAttachment: dublê.enviar }))

const config = {
  key: 'pk_DEMO',
  route: '/checkout',
  origin: 'loja.exemplo.com',
  viewport: '1280x800',
}

const media: PublicMediaSettingsViewModel = {
  IsEnabled: true,
  AllowsScreenCapture: true,
  AllowsOnInfoRequest: true,
  MaxFilesPerReport: 4,
  Kinds: [
    {
      Kind: 'Image',
      MaxCount: 3,
      MaxBytes: 5 * 1024 * 1024,
      MaxDurationSeconds: null,
      ContentTypes: ['image/png', 'image/jpeg', 'image/webp'],
    },
  ],
}

const criado: CreatedReportViewModel = {
  TrackingCode: '7K2M-9QXP-4TRV',
  AccessToken: 'tok-secreto',
  CreatedAt: '2026-09-23T12:00:00.000Z',
  ReporterCode: null,
}

const print = () => new File([new Uint8Array(100)], 'erro.png', { type: 'image/png' })

function escolher(arquivo: File) {
  fireEvent.change(screen.getByLabelText('Escolher arquivo para anexar'), {
    target: { files: [arquivo] },
  })
}

function montar(comMidia = true) {
  render(
    <EmbedApp settings={DEFAULT_WIDGET_SETTINGS} config={config} media={comMidia ? media : null} />,
  )
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('o anexo no formulario', () => {
  it('sem configuracao de midia, nao ha botao', () => {
    montar(false)
    expect(screen.queryByRole('button', { name: 'Anexar arquivo' })).toBeNull()
  })

  it('com midia, o botao aparece', () => {
    montar()
    expect(screen.getByRole('button', { name: 'Anexar arquivo' })).toBeDefined()
  })

  it('escolher um arquivo o poe na lista, e nada sobe ainda', async () => {
    montar()
    escolher(print())

    await screen.findByRole('button', { name: 'Remover erro.png' })
    expect(dublê.enviar).not.toHaveBeenCalled()
  })

  it('formato que o projeto nao aceita e recusado na hora, dizendo por que', async () => {
    montar()
    escolher(new File(['x'], 'contrato.pdf', { type: 'application/pdf' }))

    await screen.findByText(/formato de arquivo não é aceito/)
    expect(screen.queryByRole('button', { name: /Remover/ })).toBeNull()
  })

  it('remover tira da lista', async () => {
    montar()
    escolher(print())

    fireEvent.click(await screen.findByRole('button', { name: 'Remover erro.png' }))
    expect(screen.queryByRole('button', { name: 'Remover erro.png' })).toBeNull()
  })

  it('colar um print anexa', async () => {
    montar()
    const formulario = screen.getByRole('textbox').closest('form') as HTMLFormElement

    fireEvent.paste(formulario, { clipboardData: { files: [print()] } })

    await screen.findByRole('button', { name: 'Remover erro.png' })
  })
})

describe('o envio', () => {
  it('cria o relato primeiro, e so depois sobe o arquivo com as credenciais dele', async () => {
    const ordem: string[] = []
    dublê.criar.mockImplementation(async () => {
      ordem.push('relato')
      return criado
    })
    dublê.enviar.mockImplementation(async () => {
      ordem.push('arquivo')
    })

    montar()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'o pagamento falhou' } })
    escolher(print())
    await screen.findByRole('button', { name: 'Remover erro.png' })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))

    await waitFor(() => expect(dublê.enviar).toHaveBeenCalledOnce())
    expect(ordem).toEqual(['relato', 'arquivo'])
    expect(dublê.enviar.mock.calls[0]?.[0]).toEqual({
      trackingCode: '7K2M-9QXP-4TRV',
      token: 'tok-secreto',
    })
  })

  it('o protocolo aparece mesmo com o arquivo ainda subindo', async () => {
    dublê.criar.mockResolvedValue(criado)
    // Nunca resolve: o arquivo fica "subindo" para sempre.
    dublê.enviar.mockReturnValue(new Promise(() => {}))

    montar()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'o pagamento falhou' } })
    escolher(print())
    await screen.findByRole('button', { name: 'Remover erro.png' })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))

    await screen.findByText('7K2M-9QXP-4TRV')
  })

  it('arquivo que falha nao leva o texto: o protocolo fica, e da para tentar de novo', async () => {
    dublê.criar.mockResolvedValue(criado)
    dublê.enviar.mockRejectedValue(new Error('rede'))

    montar()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'o pagamento falhou' } })
    escolher(print())
    await screen.findByRole('button', { name: 'Remover erro.png' })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))

    await screen.findByRole('button', { name: 'Tentar de novo' })
    expect(screen.getByText('7K2M-9QXP-4TRV')).toBeDefined()
    expect(screen.getByText(/seu texto está salvo/)).toBeDefined()
  })

  it('tentar de novo manda o mesmo arquivo outra vez', async () => {
    dublê.criar.mockResolvedValue(criado)
    dublê.enviar.mockRejectedValueOnce(new Error('rede')).mockResolvedValueOnce(undefined)

    montar()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'o pagamento falhou' } })
    escolher(print())
    await screen.findByRole('button', { name: 'Remover erro.png' })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))

    fireEvent.click(await screen.findByRole('button', { name: 'Tentar de novo' }))

    await screen.findByText('enviado')
    expect(dublê.enviar).toHaveBeenCalledTimes(2)
  })

  it('sem arquivo, nada sobe', async () => {
    dublê.criar.mockResolvedValue(criado)

    montar()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'o pagamento falhou' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar' }))

    await screen.findByText('7K2M-9QXP-4TRV')
    expect(dublê.enviar).not.toHaveBeenCalled()
  })
})
