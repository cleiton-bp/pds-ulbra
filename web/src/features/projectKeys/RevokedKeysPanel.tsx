import { useState } from 'react'
import type { ProjectKeyViewModel } from '@/contracts'
import { Button } from '@/shared/components/Button'
import { Modal } from '@/shared/components/Modal'
import { formatDateTime } from '@/shared/lib/datetime'

/**
 * Quantas revogadas a secao mostra antes de mandar o resto para o dialogo. Cinco
 * cabe sem a integracao avancada virar relatorio, e quem rotaciona chave toda
 * semana ainda tem o historico inteiro a um clique.
 */
const VISIBLE = 5

/**
 * O registro do que ja nao vale.
 *
 * **Duas datas por linha, e elas se parecem.** Sem cabecalho de coluna, "valeu de
 * 02/07 a 12/08" obrigava a ler a frase inteira para saber qual era qual. A
 * tabela nomeia as colunas uma vez e as linhas viram so numero, que e o que se
 * compara.
 *
 * A hora entra junto porque duas rotacoes do mesmo dia sao indistinguiveis pelo
 * dia — e rotacao em sequencia e exatamente o que acontece quando alguem esta
 * consertando um vazamento.
 */
export function RevokedKeysPanel({ keys }: { keys: ProjectKeyViewModel[] }) {
  const [showingAll, setShowingAll] = useState(false)

  const ordered = [...keys].sort((one, other) => revokedTime(other) - revokedTime(one))
  const hidden = ordered.length - VISIBLE

  return (
    <div className="mt-6">
      <h3 className="mb-1 font-semibold text-body">Chaves revogadas</h3>
      <p className="mb-3 text-detail text-fg-muted">
        Chaves secretas que já não valem. Ficam aqui só como registro.
      </p>

      <RevokedTable keys={ordered.slice(0, VISIBLE)} />

      {hidden > 0 && (
        <Button size="sm" className="mt-3" onClick={() => setShowingAll(true)}>
          Ver as {ordered.length} revogadas
        </Button>
      )}

      <Modal
        open={showingAll}
        onOpenChange={setShowingAll}
        title="Chaves revogadas"
        description={`As ${ordered.length} chaves secretas deste projeto que já não valem, da mais recente para a mais antiga.`}
        width="w-[min(34rem,calc(100vw-2rem))]"
        footer={
          <Button variant="quiet" onClick={() => setShowingAll(false)}>
            Fechar
          </Button>
        }
      >
        {/* Rola aqui dentro: lista longa empurraria o "Fechar" para fora da tela. */}
        <div className="max-h-[min(24rem,55vh)] overflow-y-auto">
          <RevokedTable keys={ordered} />
        </div>
      </Modal>
    </div>
  )
}

function RevokedTable({ keys }: { keys: ProjectKeyViewModel[] }) {
  return (
    <table className="w-full border-separate border-spacing-0">
      <thead>
        <tr>
          {/* `sticky` funciona sem `z-index`: elemento posicionado pinta depois
              das celulas comuns, que nao sao posicionadas. */}
          {['chave', 'criada', 'revogada'].map((label) => (
            <th
              key={label}
              className="sticky top-0 border-border border-b bg-surface-raised py-2 pr-3 text-left font-normal text-caption text-fg-muted"
            >
              {label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {keys.map((key) => (
          <tr key={key.PublicId}>
            <td className="border-border border-b py-2.5 pr-3 font-mono text-detail text-fg-muted">
              {key.Prefix}•••
            </td>
            <td className="border-border border-b py-2.5 pr-3 text-caption text-fg-muted tabular-nums">
              {formatDateTime(key.CreatedAt)}
            </td>
            <td className="border-border border-b py-2.5 text-caption text-fg-muted tabular-nums">
              {formatDateTime(key.RevokedAt)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** Sem `RevokedAt` a chave cai para o fim, e nao para o topo por causa de um `NaN`. */
function revokedTime(key: ProjectKeyViewModel): number {
  return key.RevokedAt ? new Date(key.RevokedAt).getTime() : 0
}
