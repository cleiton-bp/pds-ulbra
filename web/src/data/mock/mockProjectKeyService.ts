import type { ProjectKeyViewModel, RevealedSecretKeyViewModel } from '@/contracts'
import { demoDatabase } from '@/data/mock/demoDatabase'
import { generateSecretKey } from '@/data/mock/keyGenerator'
import type { MockDatabase } from '@/data/mock/mockDatabase'
import {
  delay,
  newKeyRow,
  nowIso,
  requireProject,
  requireSession,
  toKeyViewModel,
} from '@/data/mock/mockInternals'
import type { ProjectKeyService } from '@/data/projectKeyService'

export function createMockProjectKeyService(database: MockDatabase): ProjectKeyService {
  return {
    async listProjectKeys(publicId: string): Promise<ProjectKeyViewModel[]> {
      await delay()
      requireSession()
      requireProject(database, publicId)

      // As revogadas ficam: o historico e o que permite investigar um incidente.
      return database
        .read()
        .keys.filter((key) => key.projectPublicId === publicId)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        .map(toKeyViewModel)
    },

    async regenerateSecretKey(publicId: string): Promise<RevealedSecretKeyViewModel> {
      await delay()
      requireSession()
      requireProject(database, publicId)

      const generated = generateSecretKey()
      const timestamp = nowIso()
      const created = newKeyRow(publicId, 'Secret', generated, timestamp)

      database.write((state) => {
        // Revogar preenche a data e mantem a linha; a anterior nao e sobrescrita.
        const current = state.keys.find(
          (key) => key.projectPublicId === publicId && key.type === 'Secret' && !key.revokedAt,
        )
        if (current) current.revokedAt = timestamp

        state.keys.push(created)
      })

      return {
        PublicId: created.publicId,
        Value: generated.value,
        Prefix: created.prefix,
        CreatedAt: created.createdAt,
      }
    },
  }
}

export const mockProjectKeyService = createMockProjectKeyService(demoDatabase)
