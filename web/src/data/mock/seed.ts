/**
 * A lista de projetos nasce **vazia** de proposito: a tela de lista vazia e a
 * mais dificil de acertar e seria a unica que ninguem veria se o seed a pulasse.
 *
 * A conta e a do design (`Painel de relato de bugs`), para tela e prancheta
 * poderem ser comparadas lado a lado; a pessoa e a dona do projeto.
 */

import type { AccountViewModel, MeViewModel } from '@/contracts'

export const demoAccount: AccountViewModel = {
  PublicId: '2f1c0a54-77b1-4e2f-9f0d-9a1d3c5b7e01',
  Name: 'Studio Nove',
  CreatedAt: '2026-08-01T12:00:00.000Z',
}

export const demoUser: MeViewModel = {
  PublicId: 'c48a6b12-5d3e-4a77-8b90-1e2f3a4b5c02',
  Name: 'Cleiton Pereira',
  Email: 'admin@admin.com',
  AvatarUrl: null,
  LastLoginAt: null,
  Account: demoAccount,
}
