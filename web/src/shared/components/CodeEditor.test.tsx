// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CodeEditor } from '@/shared/components/CodeEditor'

/**
 * O QUE ESTES TESTES TRAVAM: o editor mostra o codigo como texto (nunca como HTML), com
 * numero em cada linha; o copiar leva o arquivo aberto; e, com varios arquivos, as abas
 * sao abas de verdade.
 */
const copiar = vi.hoisted(() => vi.fn(async () => true))
vi.mock('@/shared/lib/clipboard', () => ({ copyText: copiar }))

afterEach(() => {
  cleanup()
  copiar.mockClear()
})

describe('CodeEditor', () => {
  it('mostra o codigo como texto, com numero em cada linha', () => {
    const { container } = render(
      <CodeEditor
        files={[{ id: 'a', name: 'index.html', language: 'html', code: '<script>\n</script>' }]}
      />,
    )
    // Nenhum elemento de script nasceu do exemplo: ele continua texto.
    expect(container.querySelector('script')).toBeNull()
    expect(container.textContent).toContain('<script>')
    expect(
      screen.getByRole('region', { name: 'index.html' }).querySelectorAll('pre > div'),
    ).toHaveLength(2)
  })

  it('o copiar leva o codigo do arquivo aberto', async () => {
    render(<CodeEditor files={[{ id: 'a', name: 'a.js', language: 'js', code: 'foo()' }]} />)
    fireEvent.click(screen.getByRole('button', { name: /Copiar/ }))
    await waitFor(() => expect(copiar).toHaveBeenCalledWith('foo()'))
    expect(await screen.findByText('Copiado')).toBeTruthy()
  })

  it('as linhas novas ganham o + e o copiar leva so elas', async () => {
    render(
      <CodeEditor
        files={[
          {
            id: 'a',
            name: 'index.html',
            language: 'html',
            code: '<script\n  data-key="pk"\n  data-identity="x"\n  defer></script>',
            added: [3],
          },
        ]}
      />,
    )
    const linhas = screen.getByRole('region', { name: 'index.html' }).querySelectorAll('pre > div')
    expect(linhas[2]?.textContent).toBe('+Linha nova:   data-identity="x"')
    expect(linhas[1]?.textContent).toBe('2  data-key="pk"')

    fireEvent.click(screen.getByRole('button', { name: /Copiar as linhas novas/ }))
    await waitFor(() => expect(copiar).toHaveBeenCalledWith('  data-identity="x"'))
  })

  it('com varios arquivos, as abas trocam o arquivo aberto', () => {
    const trocar = vi.fn()
    render(
      <CodeEditor
        ariaLabel="Linguagem"
        active="b"
        onActiveChange={trocar}
        files={[
          { id: 'a', name: 'a.js', label: 'Node', language: 'js', code: 'um()' },
          { id: 'b', name: 'b.py', label: 'Python', language: 'python', code: 'dois()' },
        ]}
      />,
    )
    expect(screen.getByRole('tablist', { name: 'Linguagem' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: 'Python' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getByRole('tabpanel').textContent).toContain('dois()')

    fireEvent.click(screen.getByRole('tab', { name: 'Node' }))
    expect(trocar).toHaveBeenCalledWith('a')
  })
})
