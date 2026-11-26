import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { expect } from 'vitest'

/** Os campos que moram no "Filtrar" da barra do Trabalho, na tela larga. */
export const CAMPOS_DO_FILTRAR = [
  'Responsável',
  'Etiqueta',
  'Prioridade',
  'Tipo',
  'Coluna',
  'Sprint',
]

const abrirNoPonteiro = (alvo: HTMLElement) =>
  // O Radix abre no `pointerdown`, e nao no clique.
  fireEvent.pointerDown(alvo, { button: 0, ctrlKey: false, pointerType: 'mouse' })

/**
 * Abre um menu da barra de filtros e devolve ele. Os campos de lista (responsavel,
 * etiqueta, prioridade, tipo, coluna e sprint) ficam dentro do "Filtrar": abre o "Filtrar"
 * e, nele, o campo, que abre ao lado. Os outros (a ordem) abrem direto.
 */
export async function abrirMenuDaBarra(nome: string | RegExp): Promise<HTMLElement> {
  const campo = CAMPOS_DO_FILTRAR.find((rotulo) =>
    typeof nome === 'string' ? nome === rotulo || nome.startsWith(`${rotulo}:`) : nome.test(rotulo),
  )
  if (!campo) {
    abrirNoPonteiro(await screen.findByRole('button', { name: nome }))
    return screen.findByRole('menu')
  }
  abrirNoPonteiro(await screen.findByRole('button', { name: /^Filtrar/ }))
  const filtrar = await screen.findByRole('menu')
  // O campo pode chegar depois do menu aberto (a sprint vem com a lista das sprints).
  fireEvent.click(await within(filtrar).findByRole('menuitem', { name: new RegExp(`^${campo}`) }))
  await waitFor(() => expect(screen.getAllByRole('menu')).toHaveLength(2))
  return screen.getAllByRole('menu')[1] as HTMLElement
}

/** Fecha o menu aberto (e o "Filtrar" junto) pelo Esc, como a pessoa faz. */
export async function fecharMenuDaBarra(): Promise<void> {
  const abertos = screen.getAllByRole('menu')
  fireEvent.keyDown(abertos[abertos.length - 1] as HTMLElement, { key: 'Escape' })
  await waitFor(() => expect(screen.queryAllByRole('menu')).toHaveLength(0))
}

/**
 * O que um campo do "Filtrar" diz que esta marcado (o inteiro, da dica), sem chips na
 * tela: abre o "Filtrar", le o campo e fecha. Vazio quando o campo nao tem nada marcado.
 */
export async function marcadosNoFiltrar(campo: string): Promise<string> {
  abrirNoPonteiro(await screen.findByRole('button', { name: /^Filtrar/ }))
  const filtrar = await screen.findByRole('menu')
  const item = await within(filtrar).findByRole('menuitem', { name: new RegExp(`^${campo}`) })
  const marcados = item.querySelector<HTMLElement>('[title]')?.title ?? ''
  fireEvent.keyDown(filtrar, { key: 'Escape' })
  await waitFor(() => expect(screen.queryAllByRole('menu')).toHaveLength(0))
  return marcados
}
