import { useCallback, useEffect, useState } from 'react'
import type { IdentitySettingsViewModel, ReporterIdentityMode } from '@/contracts'
import { describeError, projectIdentitySettingsService } from '@/data'
import { Button } from '@/shared/components/Button'
import { Skeleton } from '@/shared/components/Skeleton'
import { toast } from '@/shared/components/toastStore'
import { useAsyncResource } from '@/shared/hooks/useAsyncResource'
import { useCurrentProject } from '@/shared/hooks/useCurrentProject'
import { cn } from '@/shared/lib/cn'

/**
 * Quem é quem neste projeto.
 *
 * **Esta tela ensina antes de perguntar, e isso é requisito.** As outras telas de
 * configuração mudam como o produto se comporta; esta muda *o que é possível* —
 * lista pessoal, visibilidade, canal de volta. Quem escolher sem entender vai
 * descobrir o efeito quando um relator reclamar, e aí já será tarde.
 *
 * **A ordem das três opções é deliberada**: da que não pede nada de ninguém para a
 * que pede trabalho do cliente. Quem abre a tela sem certeza fica no topo, que é o
 * padrão e o comportamento de hoje.
 *
 * **O que cada modo destrava aparece junto da opção, e não num aviso depois.**
 * "Sem identidade não existe lista pessoal" é a regra que atravessa a etapa — dizê-la
 * só quando a pessoa já escolheu seria dizer tarde.
 */
export function IdentityScreen() {
  const project = useCurrentProject()

  const {
    data: saved,
    loading,
    failed,
    reload,
  } = useAsyncResource(
    useCallback(
      () => projectIdentitySettingsService.getIdentitySettings(project.PublicId),
      [project.PublicId],
    ),
  )

  const [draft, setDraft] = useState<IdentitySettingsViewModel | null>(null)
  const [published, setPublished] = useState<IdentitySettingsViewModel | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setPublished(saved)
    setDraft(saved)
  }, [saved])

  const dirty = draft !== null && published !== null && draft.Mode !== published.Mode

  async function salvar() {
    if (!draft || saving) return

    setSaving(true)

    try {
      const gravado = await projectIdentitySettingsService.saveIdentitySettings(project.PublicId, {
        Mode: draft.Mode,
      })
      setPublished(gravado)
      setDraft(gravado)
      toast.done('Modo de identificação salvo.')
    } catch (falha) {
      toast.error(describeError(falha))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-170">
      <h1 className="mb-1.5 font-semibold text-screen tracking-tight">Identidade</h1>
      <p className="mb-6 text-body text-fg-muted leading-relaxed">
        Como a pessoa que abre um relato é reconhecida. É a escolha que decide o que o resto pode
        ser: sem saber quem é, não existe “os meus relatos”.
      </p>

      {failed && (
        <div className="rounded-xl border border-border bg-surface-raised p-5">
          <p className="mb-3.5 text-body text-fg-muted leading-relaxed">
            Não deu para carregar a configuração agora. Nada mudou: a falha foi ao consultar, e o
            projeto continua se comportando como estava.
          </p>
          <Button onClick={reload}>Tentar de novo</Button>
        </div>
      )}

      {loading && (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {draft && (
        <section>
          <div className="mb-5 flex flex-col gap-2.5">
            <Modo
              valor="Protocol"
              escolhido={draft.Mode}
              titulo="Protocolo"
              resumo="Ninguém é identificado."
              explicacao="O relato é tratado como se qualquer pessoa o tivesse enviado. Quem escreveu guarda o link e volta por ele — e o link é a única prova de que o relato é dela."
              destrava="Não há lista pessoal, e isso não é falta: sem saber quem é, não há como dizer quais relatos são dela."
              custo="Nada. É o que funciona colando um script numa página."
              aoEscolher={(valor) => setDraft({ ...draft, Mode: valor })}
            />

            <Modo
              valor="PersonalCode"
              escolhido={draft.Mode}
              titulo="Código pessoal"
              resumo="O sistema sorteia um código, e a pessoa guarda."
              explicacao="Algo como H7QK-3M2X-P9WD, no mesmo alfabeto do protocolo — sem 0, O, 1 e I, para ser lido em voz alta sem confusão. Navegador novo, outro aparelho: ela digita o código e reencontra os relatos dela."
              destrava="Lista pessoal, sem o cliente precisar ter login. O código soma ao link e não o substitui: perdê-lo custa a lista, não os relatos."
              custo="Nada do seu lado. O custo é da pessoa, que tem mais uma coisa para guardar."
              aoEscolher={(valor) => setDraft({ ...draft, Mode: valor })}
            />

            <Modo
              valor="InheritedIdentity"
              escolhido={draft.Mode}
              indisponivel
              titulo="Identidade do seu sistema"
              resumo="Quem já está logado no seu site não digita nada."
              explicacao="O seu servidor diria quem é o usuário, assinando essa informação com uma chave que só ele tem. Nós conferiríamos a assinatura — sem nunca chamar o seu sistema."
              destrava="Lista pessoal sem a pessoa guardar nada, porque ela já está identificada no seu site."
              custo="Ainda não está disponível, e por isso não dá para escolher. Enquanto não estiver, o código pessoal entrega a mesma lista sem exigir nada do seu lado."
              aoEscolher={(valor) => setDraft({ ...draft, Mode: valor })}
            />
          </div>

          <div className="mb-6 rounded-xl border border-border border-dashed bg-surface p-4">
            <p className="text-caption text-fg-muted leading-relaxed">
              <strong className="font-medium text-fg">Trocar de modo não mexe no passado.</strong>{' '}
              Relato que já entrou continua como entrou, e continua abrindo pelo link de sempre. A
              escolha vale daqui para frente.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button variant="primary" disabled={!dirty || saving} onClick={() => void salvar()}>
              {saving ? 'Salvando…' : 'Salvar'}
            </Button>

            {dirty && !saving && (
              <span className="text-caption text-fg-muted">Há mudança não salva.</span>
            )}
          </div>
        </section>
      )}
    </div>
  )
}

/**
 * Uma das três escolhas.
 *
 * **Cada uma diz três coisas: o que é, o que destrava e o que custa.** As duas
 * últimas são o que falta nas telas de configuração em geral — quem escolhe
 * precisa saber o que ganha e o que vai ter de fazer, e descobrir o custo depois
 * de salvar é descobrir tarde.
 */
function Modo({
  valor,
  escolhido,
  titulo,
  resumo,
  explicacao,
  destrava,
  custo,
  indisponivel = false,
  aoEscolher,
}: {
  valor: ReporterIdentityMode
  escolhido: ReporterIdentityMode
  titulo: string
  resumo: string
  explicacao: string
  destrava: string
  custo: string
  /**
   * O modo existe na configuração, e ainda não tem quem o obedeça.
   *
   * **Aparece e não deixa escolher, em vez de sumir.** Sumir esconderia uma
   * direção que o produto já tomou; deixar escolher gravaria um modo que não muda
   * nada — e quem configurasse só descobriria pela ausência de um efeito.
   *
   * Continua marcável se já for o valor salvo: esconder a escolha corrente seria
   * mentir sobre o estado do projeto.
   */
  indisponivel?: boolean
  aoEscolher: (valor: ReporterIdentityMode) => void
}) {
  const marcado = escolhido === valor
  const travado = indisponivel && !marcado

  return (
    <label
      className={cn(
        'flex gap-3 rounded-xl border p-4',
        travado ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
        marcado ? 'border-accent bg-surface-raised' : 'border-border bg-surface',
      )}
    >
      <input
        type="radio"
        name="identity-mode"
        value={valor}
        checked={marcado}
        disabled={travado}
        onChange={() => aoEscolher(valor)}
        className="mt-0.5 flex-none accent-accent"
      />
      <span className="min-w-0">
        <span className="mb-0.5 block font-medium text-detail text-fg">
          {titulo} <span className="font-normal text-fg-muted">— {resumo}</span>
        </span>
        <span className="mb-2 block text-caption text-fg-muted leading-relaxed">{explicacao}</span>

        <span className="block text-caption text-fg-muted leading-relaxed">
          <strong className="font-medium text-fg">Destrava:</strong> {destrava}
        </span>
        <span className="block text-caption text-fg-muted leading-relaxed">
          <strong className="font-medium text-fg">Custo:</strong> {custo}
        </span>
      </span>
    </label>
  )
}
