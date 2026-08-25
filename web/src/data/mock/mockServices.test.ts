import { beforeEach, describe, expect, it } from 'vitest'
import { PanelError } from '@/data/errors'
import { PREFIX_LENGTH } from '@/data/mock/keyGenerator'
import { createMockAuthService } from '@/data/mock/mockAuthService'
import { MockDatabase } from '@/data/mock/mockDatabase'
import { createMockProjectKeyService } from '@/data/mock/mockProjectKeyService'
import { createMockProjectService } from '@/data/mock/mockProjectService'
import { clearToken } from '@/data/sessionToken'

/**
 * O mock so vale se recusar o que a API recusa: mock mais permissivo passa na
 * demonstracao e quebra na integracao.
 *
 * Os tres sao montados sobre **o mesmo banco**, como em producao — criar projeto
 * pelo `projects` tem de aparecer no `keys` no mesmo instante.
 */
let service: {
  auth: ReturnType<typeof createMockAuthService>
  projects: ReturnType<typeof createMockProjectService>
  keys: ReturnType<typeof createMockProjectKeyService>
}

describe('os servicos mocados', () => {
  beforeEach(() => {
    clearToken()

    // `persist: false`: cada teste comeca do zero, sem herdar o anterior.
    const database = new MockDatabase(false)
    service = {
      auth: createMockAuthService(database),
      projects: createMockProjectService(database),
      keys: createMockProjectKeyService(database),
    }
  })

  it('recusa rota autenticada sem sessao, com 401', async () => {
    await expect(service.projects.listProjects()).rejects.toMatchObject({ status: 401 })
  })

  it('abre sessao sem Google configurado', async () => {
    const session = await service.auth.signIn(null)

    expect(session.AccessToken).toBeTruthy()
    expect(session.User.Account.Name).toBeTruthy()
    expect(new Date(session.ExpiresAt).getTime()).toBeGreaterThan(Date.now())
  })

  it('comeca sem projeto nenhum, para a tela de lista vazia existir', async () => {
    await service.auth.signIn(null)

    expect(await service.projects.listProjects()).toHaveLength(0)
  })

  it('cria o projeto ja com o par de chaves', async () => {
    await service.auth.signIn(null)

    const created = await service.projects.createProject('Loja Online')

    expect(created.Project.Name).toBe('Loja Online')
    expect(created.Project.Status).toBe('Active')
    expect(created.PublicKey.Type).toBe('Public')
    expect(created.PublicKey.Value).toMatch(/^pk_/)
    expect(created.SecretKey.Value).toMatch(/^sk_/)
    expect(created.SecretKey.Prefix).toHaveLength(PREFIX_LENGTH)
  })

  it('nunca devolve o valor da chave secreta depois de criada', async () => {
    await service.auth.signIn(null)

    const created = await service.projects.createProject('Loja Online')
    const keys = await service.keys.listProjectKeys(created.Project.PublicId)

    const secret = keys.find((key) => key.Type === 'Secret')
    const publicKey = keys.find((key) => key.Type === 'Public')

    // A regra central da etapa: a secreta some, a publica continua legivel.
    expect(secret?.Value).toBeNull()
    expect(secret?.Prefix).toBe(created.SecretKey.Prefix)
    expect(publicKey?.Value).toBe(created.PublicKey.Value)
  })

  it('recusa nome vazio com 400 e nome repetido com 409', async () => {
    await service.auth.signIn(null)
    await service.projects.createProject('Loja Online')

    await expect(service.projects.createProject('   ')).rejects.toMatchObject({ status: 400 })
    // Sem diferenciar maiuscula: "Loja" e "loja" sao o mesmo projeto.
    await expect(service.projects.createProject('loja online')).rejects.toMatchObject({
      status: 409,
    })
  })

  it('aceita o mesmo nome depois de renomear o projeto que o ocupava', async () => {
    await service.auth.signIn(null)

    const first = await service.projects.createProject('Loja Online')
    await service.projects.updateProject(first.Project.PublicId, { Name: 'Loja Antiga' })

    await expect(service.projects.createProject('Loja Online')).resolves.toBeTruthy()
  })

  it('responde 404 para projeto que nao existe', async () => {
    await service.auth.signIn(null)

    // Projeto de outra conta responderia igual: dizer "existe, mas nao e seu" ja
    // seria contar que existe.
    await expect(service.projects.getProject(crypto.randomUUID())).rejects.toMatchObject({
      status: 404,
    })
  })

  it('arquiva sem apagar, e reativa', async () => {
    await service.auth.signIn(null)

    const created = await service.projects.createProject('Loja Online')
    const archived = await service.projects.updateProject(created.Project.PublicId, {
      Status: 'Archived',
    })
    expect(archived.Status).toBe('Archived')

    // Arquivado continua na listagem: nao some, so para de aceitar coisa nova.
    expect(await service.projects.listProjects()).toHaveLength(1)

    const reactivated = await service.projects.updateProject(created.Project.PublicId, {
      Status: 'Active',
    })
    expect(reactivated.Status).toBe('Active')
  })

  it('regenerar revoga a anterior e mantem o historico', async () => {
    await service.auth.signIn(null)

    const created = await service.projects.createProject('Loja Online')
    const regenerated = await service.keys.regenerateSecretKey(created.Project.PublicId)

    expect(regenerated.Value).toMatch(/^sk_/)
    expect(regenerated.Value).not.toBe(created.SecretKey.Value)

    const secrets = (await service.keys.listProjectKeys(created.Project.PublicId)).filter(
      (key) => key.Type === 'Secret',
    )

    // Duas linhas: a nova valendo e a antiga com a data em que deixou de valer.
    expect(secrets).toHaveLength(2)
    expect(secrets.filter((key) => key.IsActive)).toHaveLength(1)

    const previous = secrets.find((key) => key.Prefix === created.SecretKey.Prefix)
    expect(previous?.IsActive).toBe(false)
    expect(previous?.RevokedAt).toBeTruthy()
  })

  it('lista do mais recente para o mais antigo', async () => {
    await service.auth.signIn(null)

    await service.projects.createProject('Primeiro')
    await service.projects.createProject('Segundo')

    const projects = await service.projects.listProjects()
    expect(projects.map((project) => project.Name)).toEqual(['Segundo', 'Primeiro'])
  })

  it('sair encerra a sessao', async () => {
    await service.auth.signIn(null)
    await service.auth.signOut()

    await expect(service.auth.getCurrentUser()).rejects.toBeInstanceOf(PanelError)
  })
})
