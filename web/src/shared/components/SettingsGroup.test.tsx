// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EditorWithPreview } from '@/shared/components/EditorWithPreview'
import { SettingsGroup } from '@/shared/components/SettingsGroup'

/**
 * O QUE ESTES TESTES TRAVAM: as duas pecas das telas que mudam o que se ve (O botão,
 * Formulário, Anexos, Tipos de relato), de que as telas dependem sem repetir o teste.
 *
 * - **O grupo e um `<details>` com o `name` dado pela tela**, a ancora no `<summary>` e
 *   o nome na `section` (`aria-labelledby`), e nao num titulo dentro do botao.
 * - **Fechado, ele diz o que esta escolhido e o que mudou**; sem mudanca, nem "Mudou"
 *   nem "Voltar ao padrão". O "Voltar ao padrão" mora fora do `<summary>`.
 * - **Ele avisa quando abre, fecha, ganha e perde o foco** — e o que a previa usa.
 * - **O editor poe os controles antes da previa no codigo**, e so o desenho leva a
 *   previa para o topo; o pai dela e quem gruda.
 */
afterEach(cleanup)

function grupo(props: Partial<Parameters<typeof SettingsGroup>[0]> = {}) {
  return (
    <SettingsGroup
      name="teste"
      id="grupo-a"
      title="Grupo A"
      value="Azul · grande"
      changes={[]}
      onReset={() => {}}
      {...props}
    >
      <input aria-label="Campo de dentro" />
    </SettingsGroup>
  )
}

describe('SettingsGroup', () => {
  it('é um details do acordeão dado, com a âncora no summary e o nome na seção', () => {
    render(grupo())

    const resumo = document.getElementById('grupo-a') as HTMLElement
    expect(resumo.tagName).toBe('SUMMARY')
    expect(resumo.closest('details')?.getAttribute('name')).toBe('teste')
    expect(resumo.querySelector('h2, h3')).toBeNull()
    expect(screen.getByRole('region', { name: 'Grupo A' }).contains(resumo)).toBe(true)
    expect(resumo.textContent).toContain('Azul · grande')
  })

  it('sem mudança, não diz "Mudou" nem oferece voltar; com mudança, os dois', () => {
    const { rerender } = render(grupo())
    expect(screen.queryByText(/Mudou/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Voltar ao padrão' })).toBeNull()

    const onReset = vi.fn()
    rerender(grupo({ changes: ['Cor', 'Tamanho'], onReset }))
    expect(document.getElementById('grupo-a')?.textContent).toContain('Mudou: Cor, Tamanho')

    const voltar = within(screen.getByRole('region', { name: 'Grupo A' })).getByRole('button', {
      name: 'Voltar ao padrão',
    })
    // Fora do summary: botao dentro de botao nao funciona para o teclado.
    expect(voltar.closest('summary')).toBeNull()
    fireEvent.click(voltar)
    expect(onReset).toHaveBeenCalledTimes(1)
  })

  // A previa segue o grupo aberto, e so ele: o grupo avisa abrir e fechar, e nada mais.
  it('avisa quando abre e fecha', async () => {
    const onToggle = vi.fn()
    render(grupo({ onToggle }))
    const detalhes = document.querySelector('details') as HTMLDetailsElement

    detalhes.open = true
    await vi.waitFor(() => expect(onToggle).toHaveBeenLastCalledWith(true))
    detalhes.open = false
    await vi.waitFor(() => expect(onToggle).toHaveBeenLastCalledWith(false))
  })
})

describe('EditorWithPreview', () => {
  it('os controles vêm antes da prévia no código, e o pai da prévia gruda e vai ao topo', () => {
    render(
      <EditorWithPreview preview={<section id="previa">Prévia</section>}>
        <button type="button">Controle</button>
      </EditorWithPreview>,
    )

    const controle = screen.getByRole('button', { name: 'Controle' })
    const previa = document.getElementById('previa') as HTMLElement
    expect(controle.compareDocumentPosition(previa) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
    const pai = previa.parentElement?.className ?? ''
    expect(pai).toContain('order-first')
    expect(pai).toContain('lg:sticky')
    expect(pai).toContain('lg:order-none')
    // 60% para os controles e 40% para a previa: metade e metade apertava o que se configura.
    expect(previa.parentElement?.parentElement?.className).toContain(
      'lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]',
    )
  })
})
