import { useState } from 'react'
import { MAX_ORIGIN_DOMAIN_LENGTH } from '@/contracts'
import { describeError, projectOriginService } from '@/data'
import { Button } from '@/shared/components/Button'
import { TextField } from '@/shared/components/TextField'
import { toast } from '@/shared/components/toastStore'

/**
 * Autorizar o dominio sem ir a Domínios — na pagina central e no passo da Instalação: e
 * a mesma lista de autorizados, e a API faz o mesmo de la — o relato que estava retido
 * daquele endereco entra no Trabalho. O dominio que ja mandou relato aparece pronto, com
 * um botao.
 */
export function AuthorizeDomain({
  projectPublicId,
  held,
  onAuthorized,
}: {
  projectPublicId: string
  held: string | null
  onAuthorized: () => void
}) {
  const [domain, setDomain] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function authorize(value: string, fromField: boolean) {
    const trimmed = value.trim()
    if (trimmed.length === 0 || saving) return

    setSaving(true)
    setError(null)
    try {
      const created = await projectOriginService.addProjectOrigin(projectPublicId, {
        Domain: trimmed,
        AllowsSubdomains: false,
      })
      toast.done(`${created.Domain} autorizado: os relatos dele entram direto no Trabalho.`)
      setDomain('')
      onAuthorized()
    } catch (failure) {
      // O erro do campo fica no campo, onde ha o que corrigir; o do botao pronto vira
      // aviso, porque ali nao ha o que digitar.
      if (fromField) setError(describeError(failure))
      else toast.error(describeError(failure))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-3">
      {held && (
        <p className="mb-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-lg border border-warn-border bg-warn-surface px-3 py-2 text-detail text-warn-fg">
          <span className="min-w-0">
            <code className="font-mono">{held}</code> mandou relato e está esperando.
          </span>
          <Button size="sm" disabled={saving} onClick={() => void authorize(held, false)}>
            Autorizar {held}
          </Button>
        </p>
      )}
      <div className="flex items-start gap-2">
        <TextField
          className="min-w-0 flex-1"
          ariaLabel="Domínio do seu sistema"
          value={domain}
          onChange={(value) => {
            setDomain(value)
            if (error) setError(null)
          }}
          placeholder="loja.exemplo.com"
          error={error}
          maxLength={MAX_ORIGIN_DOMAIN_LENGTH}
          disabled={saving}
          onSubmit={() => void authorize(domain, true)}
        />
        <Button
          variant="primary"
          disabled={domain.trim().length === 0 || saving}
          onClick={() => void authorize(domain, true)}
        >
          Autorizar
        </Button>
      </div>
    </div>
  )
}
