import { MockDatabase } from '@/data/mock/mockDatabase'

/**
 * Os tres servicos mocados compartilham esta instancia: criar projeto pelo
 * `mockProjectService` tem de aparecer no `mockProjectKeyService` no mesmo
 * instante. Os testes montam a propria, com `persist: false`.
 */
export const demoDatabase = new MockDatabase()
