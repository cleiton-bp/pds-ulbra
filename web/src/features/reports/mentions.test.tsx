// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TeamMemberViewModel } from '@/contracts'
import { CommentBody, MentionTextarea } from '@/features/reports/MentionTextarea'
import {
  type ChosenMention,
  decodeMentions,
  encodeMentions,
  foldForSearch,
  mentionQuery,
  splitMentions,
} from '@/features/reports/mentions'
import { ReportComments } from '@/features/reports/ReportComments'

/**
 * O QUE ESTES TESTES TRAVAM: a mencao no comentario entre o time.
 *
 * - **No campo, "@Nome"; no envio, a marca com quem e** — so da mencao que ficou no
 *   texto, e sem pegar o comeco de outro nome.
 * - **Corrigir faz o caminho de volta**: a marca vira "@Nome" no campo, e reenviado o
 *   texto volta a ser o mesmo — com a marca so de quem ficou.
 * - **O "@" so abre a palavra**, e a busca acaba na quebra de linha.
 * - **A lista do "@"**: o time lido uma vez, sem quem escreve, sem acento; setas e
 *   Enter escolhem; Esc fecha so a lista — o card aberto continua aberto.
 * - **Ctrl+Enter (ou ⌘+Enter) envia**, mesmo com a lista aberta — e nao escolhe ninguem.
 * - **A leitura mostra "@Nome" destacado**, e nao a marca.
 * - **So a caixa de dentro menciona.**
 */
const ANA = 'a1000000-0000-4000-8000-000000000001'
const BRUNO = 'b1000000-0000-4000-8000-000000000002'
const JOAO = 'c1000000-0000-4000-8000-000000000003'

const dublê = vi.hoisted(() => ({ time: vi.fn(), comentar: vi.fn() }))

vi.mock('@/data', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/data')>()
  return {
    ...real,
    projectTeamService: { listMembers: dublê.time },
    projectReportService: { addInternalComment: dublê.comentar, addPublicComment: vi.fn() },
  }
})

function pessoa(UserPublicId: string, Name: string, IsYou = false): TeamMemberViewModel {
  return {
    UserPublicId,
    Name,
    Email: `${Name.split(' ')[0]?.toLowerCase()}@e8.local`,
    AvatarUrl: null,
    Role: 'Member',
    IsAccountOwner: false,
    IsYou,
    JoinedAt: null,
  }
}

describe('as marcas da menção', () => {
  it('o texto vira pedaços, com a menção à parte', () => {
    expect(splitMentions(`Oi @[Ana Dona](${ANA}), veja.`)).toEqual([
      { text: 'Oi ' },
      { mention: 'Ana Dona', id: ANA },
      { text: ', veja.' },
    ])
    expect(splitMentions('sem menção')).toEqual([{ text: 'sem menção' }])
  })

  it('no envio, só a menção que ficou vira marca, e o nome mais comprido primeiro', () => {
    const escolhidos: ChosenMention[] = [
      { name: 'Ana', id: BRUNO },
      { name: 'Ana Dona', id: ANA },
      { name: 'João', id: JOAO },
    ]
    expect(encodeMentions('@Ana Dona e @Ana, sem o @Anaconda', escolhidos)).toBe(
      `@[Ana Dona](${ANA}) e @[Ana](${BRUNO}), sem o @Anaconda`,
    )
    expect(encodeMentions('ninguém aqui', escolhidos)).toBe('ninguém aqui')
    expect(encodeMentions('@João.', escolhidos)).toBe(`@[João](${JOAO}).`)
  })

  it('corrigir: a marca volta a "@Nome", e reenviado o texto e o mesmo', () => {
    const corpo = `Oi @[Ana Dona](${ANA}) e @[Bruno Membro](${BRUNO}); @[Ana Dona](${ANA}) de novo.`
    const { text, chosen } = decodeMentions(corpo)
    expect(text).toBe('Oi @Ana Dona e @Bruno Membro; @Ana Dona de novo.')
    // Cada pessoa uma vez so, como se tivesse sido escolhida na lista.
    expect(chosen).toEqual([
      { name: 'Ana Dona', id: ANA },
      { name: 'Bruno Membro', id: BRUNO },
    ])
    expect(encodeMentions(text, chosen)).toBe(corpo)

    // Quem saiu do texto na correcao nao e mencionado de novo.
    expect(encodeMentions('Oi @Bruno Membro.', chosen)).toBe(`Oi @[Bruno Membro](${BRUNO}).`)
    expect(decodeMentions('sem menção')).toEqual({ text: 'sem menção', chosen: [] })
  })

  it('o "@" só abre a palavra, e a busca acaba na quebra de linha', () => {
    expect(mentionQuery('Oi @br', 6)).toEqual({ start: 3, query: 'br' })
    expect(mentionQuery('@', 1)).toEqual({ start: 0, query: '' })
    expect(mentionQuery('ana@e8', 6)).toBeNull()
    expect(mentionQuery('@ana\nolá', 9)).toBeNull()
    expect(mentionQuery('sem arroba', 10)).toBeNull()
    expect(foldForSearch('João Ávila')).toBe('joao avila')
  })
})

function Campo({ aoMencionar = vi.fn() }: { aoMencionar?: (m: ChosenMention) => void }) {
  const [texto, setTexto] = useState('')
  return (
    <MentionTextarea
      projectPublicId="p-1"
      ariaLabel="Entre o time"
      value={texto}
      onChange={setTexto}
      onMention={aoMencionar}
    />
  )
}

describe('o campo com "@"', () => {
  afterEach(cleanup)
  beforeEach(() => {
    dublê.time.mockReset()
    dublê.comentar.mockReset()
    dublê.time.mockResolvedValue([
      pessoa(ANA, 'Ana Dona', true),
      pessoa(BRUNO, 'Bruno Membro'),
      pessoa(JOAO, 'João Ávila'),
    ])
  })

  function digitar(campo: HTMLTextAreaElement, valor: string) {
    fireEvent.change(campo, { target: { value: valor, selectionStart: valor.length } })
  }

  it('no meio do texto, o cursor vai para depois da mencao na mesma hora — sem esperar o quadro seguinte', async () => {
    render(<Campo aoMencionar={vi.fn()} />)
    const campo = screen.getByRole('textbox', { name: 'Entre o time' }) as HTMLTextAreaElement
    fireEvent.change(campo, { target: { value: 'Olha @bru, por favor', selectionStart: 9 } })
    await screen.findByRole('listbox', { name: 'Pessoas do time' })
    const quadro = vi.spyOn(window, 'requestAnimationFrame')
    fireEvent.keyDown(campo, { key: 'Enter' })

    expect(campo.value).toBe('Olha @Bruno Membro , por favor')
    // Logo depois do Enter, antes de qualquer quadro: a proxima tecla cai no lugar certo.
    expect(campo.selectionStart).toBe('Olha @Bruno Membro '.length)
    expect(quadro).not.toHaveBeenCalled()
    quadro.mockRestore()
  })

  it('o "@" abre o time, sem quem escreve e sem acento; Enter escolhe', async () => {
    const aoMencionar = vi.fn()
    render(<Campo aoMencionar={aoMencionar} />)
    const campo = screen.getByRole('textbox', { name: 'Entre o time' }) as HTMLTextAreaElement

    digitar(campo, 'Olha @jo')
    const lista = await screen.findByRole('listbox', { name: 'Pessoas do time' })
    expect(lista.textContent).toContain('João Ávila')
    expect(lista.textContent).not.toContain('Ana Dona')

    digitar(campo, 'Olha @')
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(2))
    fireEvent.keyDown(campo, { key: 'ArrowDown' })
    expect(campo.getAttribute('aria-activedescendant')).toBe(screen.getAllByRole('option')[1]?.id)
    fireEvent.keyDown(campo, { key: 'Enter' })

    expect(campo.value).toBe('Olha @João Ávila ')
    expect(aoMencionar).toHaveBeenCalledWith({ name: 'João Ávila', id: JOAO })
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(dublê.time).toHaveBeenCalledTimes(1)
  })

  it('o Esc fecha só a lista: quem ouve o Esc no documento não fica sabendo', async () => {
    const doDialogo = vi.fn()
    document.addEventListener('keydown', doDialogo, true)
    render(<Campo />)
    const campo = screen.getByRole('textbox', { name: 'Entre o time' }) as HTMLTextAreaElement
    campo.focus()
    digitar(campo, '@b')
    await screen.findByRole('listbox')

    act(() => {
      campo.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(doDialogo).not.toHaveBeenCalled()

    // Sem a lista, o Esc segue o caminho de sempre.
    campo.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(doDialogo).toHaveBeenCalledTimes(1)
    document.removeEventListener('keydown', doDialogo, true)
  })

  it('Ctrl+Enter envia, mesmo com a lista aberta — e não escolhe ninguém', async () => {
    const enviar = vi.fn()
    const aoMencionar = vi.fn()
    function ComEnvio() {
      const [texto, setTexto] = useState('')
      return (
        <MentionTextarea
          projectPublicId="p-1"
          ariaLabel="Entre o time"
          value={texto}
          onChange={setTexto}
          onMention={aoMencionar}
          onSubmit={() => enviar(texto)}
        />
      )
    }
    render(<ComEnvio />)
    const campo = screen.getByRole('textbox', { name: 'Entre o time' }) as HTMLTextAreaElement

    digitar(campo, 'Olha @bru')
    await screen.findByRole('listbox', { name: 'Pessoas do time' })
    fireEvent.keyDown(campo, { key: 'Enter', ctrlKey: true })

    expect(enviar).toHaveBeenCalledWith('Olha @bru')
    expect(aoMencionar).not.toHaveBeenCalled()
    expect(campo.value).toBe('Olha @bru')
    expect(screen.queryByRole('listbox')).toBeNull()

    // O ⌘ do Mac vale o mesmo; o Enter sozinho e quebra de linha.
    fireEvent.keyDown(campo, { key: 'Enter', metaKey: true })
    fireEvent.keyDown(campo, { key: 'Enter' })
    expect(enviar).toHaveBeenCalledTimes(2)
  })

  it('a leitura mostra "@Nome" destacado, e não a marca', () => {
    render(
      <p>
        <CommentBody body={`Oi @[Bruno Membro](${BRUNO}), veja`} />
      </p>,
    )
    expect(screen.getByText('@Bruno Membro')).toBeTruthy()
    expect(document.body.textContent).toBe('Oi @Bruno Membro, veja')
  })

  it('o comentário entre o time sai com a marca; a caixa de quem relatou não menciona', async () => {
    dublê.comentar.mockResolvedValue({
      PublicId: 'c-1',
      AuthorName: 'Ana Dona',
      Body: `Olha @[Bruno Membro](${BRUNO})`,
      CreatedAt: '2026-10-03T12:00:00.000Z',
    })
    const conversa = {
      data: { Internal: [], Public: [] },
      loading: false,
      failed: false,
      reload: vi.fn(),
      refresh: vi.fn(),
      revalidate: vi.fn(),
      falas: new Set<string>(),
    }
    render(
      <MemoryRouter>
        <ReportComments
          projectPublicId="p-1"
          reportPublicId="r-1"
          conversa={conversa}
          aoComentar={vi.fn()}
        />
      </MemoryRouter>,
    )

    const interno = screen.getByRole('textbox', { name: 'Entre o time' }) as HTMLTextAreaElement
    const publico = screen.getByRole('textbox', { name: 'Para quem relatou' })
    expect(publico.getAttribute('aria-autocomplete')).toBeNull()

    digitar(interno, 'Olha @bru')
    await screen.findByRole('listbox')
    fireEvent.keyDown(interno, { key: 'Enter' })
    fireEvent.click(screen.getByRole('button', { name: 'Comentar entre o time' }))

    await waitFor(() =>
      expect(dublê.comentar).toHaveBeenCalledWith('p-1', 'r-1', {
        Body: `Olha @[Bruno Membro](${BRUNO})`,
      }),
    )
    expect(await screen.findByText('@Bruno Membro')).toBeTruthy()
  })
})
