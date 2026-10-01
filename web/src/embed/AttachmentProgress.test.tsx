// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { AttachmentProgress } from '@/embed/AttachmentPicker'
import type { Anexo } from '@/embed/attachments'

/**
 * O QUE ESTES TESTES TRAVAM.
 *
 * **Cada recusado diz o seu motivo, na propria linha.** Num envio podem ser motivos
 * diferentes — um grande demais, outro alem da cota —, e uma frase so no fim contaria
 * o de um e calaria o do outro.
 *
 * **Recusado nao oferece "Tentar de novo"; falhou oferece.** E a frase do fim fala da
 * falha, que e a que pede um gesto — e sempre diz primeiro que o texto esta salvo.
 */
function anexo(nome: string, mudanca: Partial<Anexo>): Anexo {
  return {
    id: nome,
    file: new File([new Uint8Array(100)], nome, { type: 'image/png' }),
    kind: 'Image',
    preview: null,
    displaySize: 'Full',
    thumbnail: null,
    status: 'done',
    progress: 1,
    error: null,
    uploaded: null,
    ...mudanca,
  }
}

function montar(anexos: Anexo[]) {
  render(
    <AttachmentProgress
      anexos={anexos}
      savedNote="O relato foi enviado e o seu texto está salvo."
      onRetry={() => {}}
      onDiscard={() => {}}
    />,
  )
}

/** A linha do arquivo, pelo nome dele. */
const linha = (nome: string) => screen.getByText(nome).closest('li') as HTMLElement

afterEach(cleanup)

describe('os arquivos que não foram', () => {
  it('cada recusado diz o seu motivo, na própria linha', () => {
    montar([
      anexo('grande.png', {
        status: 'refused',
        error: 'O arquivo passa do limite deste projeto, que e de 2.5 MB.',
      }),
      anexo('quarto.png', {
        status: 'refused',
        error: 'Este relato ja tem o maximo de arquivos que o projeto permite, que e 3.',
      }),
    ])

    expect(linha('grande.png').textContent).toContain('não enviado')
    expect(linha('grande.png').textContent).toContain('que e de 2.5 MB')
    expect(linha('quarto.png').textContent).toContain('que o projeto permite, que e 3')
    expect(linha('grande.png').textContent).not.toContain('que o projeto permite')
    expect(screen.queryByRole('button', { name: 'Tentar de novo' })).toBeNull()
    expect(
      screen.getByText(
        'O relato foi enviado e o seu texto está salvo. Só os arquivos marcados não foram juntos.',
      ),
    ).toBeDefined()
  })

  it('um recusado só: a frase fala dele no singular', () => {
    montar([
      anexo('erro.png', { status: 'done' }),
      anexo('tela.png', { status: 'refused', error: 'Este projeto nao aceita anexo.' }),
    ])

    expect(linha('tela.png').textContent).toContain('Este projeto nao aceita anexo.')
    expect(
      screen.getByText(
        'O relato foi enviado e o seu texto está salvo. Só o arquivo marcado não foi junto.',
      ),
    ).toBeDefined()
  })

  // A falha pede um gesto, e e dela que a frase fala. O recusado ao lado continua
  // dizendo o seu motivo, sem botao.
  it('com um que falhou e um recusado, a frase fala da falha, e o recusado do seu motivo', () => {
    montar([
      anexo('rede.png', { status: 'failed', error: 'Falha de rede ao enviar o arquivo.' }),
      anexo('video.png', { status: 'refused', error: 'Esse formato de arquivo nao e aceito.' }),
    ])

    expect(
      screen.getByText(
        'O relato foi enviado e o seu texto está salvo. Só o arquivo não foi junto — Falha de rede ao enviar o arquivo.',
      ),
    ).toBeDefined()
    expect(linha('video.png').textContent).toContain('Esse formato de arquivo nao e aceito.')
    expect(screen.getAllByRole('button', { name: 'Tentar de novo' })).toHaveLength(1)
    expect(linha('rede.png').querySelector('button')).not.toBeNull()
    expect(linha('video.png').querySelector('button')).toBeNull()
  })

  it('tudo enviado não diz nada além da lista', () => {
    montar([anexo('erro.png', { status: 'done' })])

    expect(screen.queryByText(/texto está salvo/)).toBeNull()
  })
})
