import { useCallback, useEffect, useState } from 'react'
import type { IdentitySettingsViewModel, ReporterIdentityMode, ReportVisibility } from '@/contracts'
import { describeError, projectIdentitySettingsService } from '@/data'
import { Button } from '@/shared/components/Button'
import { Skeleton } from '@/shared/components/Skeleton'
import { toast } from '@/shared/components/toastStore'
import { useAsyncResource } from '@/shared/hooks/useAsyncResource'
import { useCurrentProject } from '@/shared/hooks/useCurrentProject'
import { cn } from '@/shared/lib/cn'

/**
 * Quem é quem neste projeto, e quem pode ver o que.
 *
 * **Esta tela ensina antes de perguntar, e isso é requisito.** As outras telas de
 * configuração mudam como o produto se comporta; esta muda *o que é possível* —
 * lista pessoal, visibilidade, canal de volta. Quem escolher sem entender vai
 * descobrir o efeito quando um relator reclamar, e aí já será tarde.
 *
 * **As duas perguntas moram na mesma tela porque a primeira decide a segunda.**
 * Sem identidade não existe "o meu relato", e não existe como o relator escolher
 * aparecer — separá-las em duas telas deixaria a segunda oferecer uma escolha que
 * a primeira já tinha tirado da mesa.
 *
 * **A ordem das opções é deliberada**: da que não pede nada de ninguém para a que
 * pede trabalho — e, na visibilidade, da mais fechada para a mais aberta. Quem abre
 * a tela sem certeza fica no topo das duas, que é o padrão e o comportamento de
 * hoje.
 *
 * **O que cada escolha destrava e o que custa aparece junto dela, e não num aviso
 * depois.** "Sem identidade não existe lista pessoal" é a regra que atravessa a
 * etapa — dizê-la só quando a pessoa já escolheu seria dizer tarde.
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

  const dirty =
    draft !== null &&
    published !== null &&
    (draft.Mode !== published.Mode ||
      draft.Visibility !== published.Visibility ||
      draft.AsksForName !== published.AsksForName)

  /**
   * A combinação que a regra não permite — e que a tela **não** desfaz sozinha.
   *
   * Ela só aparece vindo do que estava salvo: o projeto identificava, publicava
   * identificado, e alguém escolheu voltar ao protocolo. Trocar a visibilidade por
   * conta própria nesse instante mudaria quem pode ver os relatos sem ninguém ter
   * pedido, e o aviso é justamente para a escolha ser de quem configura.
   */
  const conflito =
    draft !== null && draft.Mode === 'Protocol' && draft.Visibility === 'PublicIdentified'

  async function salvar() {
    if (!draft || saving || conflito) return

    setSaving(true)

    try {
      const gravado = await projectIdentitySettingsService.saveIdentitySettings(project.PublicId, {
        Mode: draft.Mode,
        Visibility: draft.Visibility,
        AsksForName: draft.AsksForName,
      })
      setPublished(gravado)
      setDraft(gravado)
      toast.done('Identidade e visibilidade salvas.')
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
        Como a pessoa que abre um relato é reconhecida, e quem pode ver o que ela escreveu. A
        primeira escolha decide a segunda: sem saber quem é, não existe “os meus relatos” nem como
        ela escolher aparecer.
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
          <Grupo titulo="Como a pessoa é reconhecida">
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
          </Grupo>

          <div className="mb-8 rounded-xl border border-border border-dashed bg-surface p-4">
            <p className="text-caption text-fg-muted leading-relaxed">
              <strong className="font-medium text-fg">Trocar de modo não mexe no passado.</strong>{' '}
              Relato que já entrou continua como entrou, e continua abrindo pelo link de sempre. A
              escolha vale daqui para frente.
            </p>
          </div>

          <Grupo titulo="Quem pode ver os relatos">
            <Nivel
              valor="Private"
              escolhido={draft.Visibility}
              titulo="Privado"
              resumo="Só quem relatou e o time."
              explicacao="Cada relato é alcançável por quem tem o link dele, e por mais ninguém. Não existe página que liste relato de terceiro, e o protocolo de uma pessoa não abre o relato de outra."
              quemVe="Quem relatou, pelo link dele. E o time, no quadro."
              custo="Nada. É o que o projeto já faz hoje."
              aoEscolher={(valor) => setDraft({ ...draft, Visibility: valor })}
            />

            <Nivel
              valor="PublicAnonymous"
              escolhido={draft.Visibility}
              titulo="Público anônimo"
              resumo="Qualquer pessoa lê, e ninguém sabe quem escreveu."
              explicacao="O relato fica visível para quem entrar, sem nada que aponte para o autor. Serve para mostrar o que está sendo corrigido sem cada um ter de perguntar."
              quemVe="Qualquer pessoa, inclusive quem nunca relatou nada."
              custo="Alguém do time libera cada relato antes de ele aparecer. O texto livre é onde vem documento, número de pedido e print com dado de outra pessoa."
              aoEscolher={(valor) => setDraft({ ...draft, Visibility: valor })}
            />

            <Nivel
              valor="PublicIdentified"
              escolhido={draft.Visibility}
              titulo="Público identificado"
              resumo="Qualquer pessoa lê, e quem relatou aparece se quiser."
              explicacao="O mesmo do anônimo, com uma diferença: quem escreveu pode escolher assinar o relato. Aparecer continua sendo decisão dela, e não do projeto."
              quemVe="Qualquer pessoa. O nome só aparece no relato em que o próprio autor marcou."
              custo="A mesma liberação do anônimo, e um modo que identifique — no protocolo não há identidade para mostrar."
              travadoPor={
                draft.Mode === 'Protocol'
                  ? 'Depende de um modo que identifique. Escolha o código pessoal acima, e este nível fica disponível.'
                  : undefined
              }
              aoEscolher={(valor) => setDraft({ ...draft, Visibility: valor })}
            />
          </Grupo>

          <div className="mb-6 rounded-xl border border-border bg-surface p-4">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={draft.AsksForName}
                onChange={(evento) => setDraft({ ...draft, AsksForName: evento.target.checked })}
                className="mt-0.5 flex-none accent-accent"
              />
              <span className="min-w-0">
                <span className="mb-0.5 block font-medium text-detail text-fg">
                  Perguntar o nome de quem relata
                </span>
                <span className="block text-caption text-fg-muted leading-relaxed">
                  O campo aparece na ferramenta e é sempre opcional. O que a pessoa escrever fica{' '}
                  <strong className="font-medium text-fg">interno</strong>: o seu time vê, e o lado
                  de fora não.
                </span>
                {draft.Visibility === 'PublicIdentified' ? (
                  <span className="mt-1 block text-caption text-fg-muted leading-relaxed">
                    Como este projeto publica identificado, quem preencher o nome também pode
                    escolher assinar o relato — e a caixa nasce desmarcada.
                  </span>
                ) : (
                  <span className="mt-1 block text-caption text-fg-muted leading-relaxed">
                    Enquanto o projeto não publicar identificado, o nome não aparece para ninguém de
                    fora — nem se a pessoa quiser.
                  </span>
                )}
              </span>
            </label>
          </div>

          {conflito && (
            <div className="mb-6 rounded-xl border border-warn-border bg-warn-surface p-4">
              <p className="text-caption text-warn-fg leading-relaxed">
                <strong className="font-medium">
                  Este projeto publica identificado, e o protocolo não identifica ninguém.
                </strong>{' '}
                Escolha outro nível de visibilidade, ou volte para um modo que identifique. Não
                mudamos por você: quem pode ver os relatos não deve mudar de lado por causa de um
                clique em outra pergunta.
              </p>
            </div>
          )}

          <div className="mb-6 rounded-xl border border-border border-dashed bg-surface p-4">
            <p className="text-caption text-fg-muted leading-relaxed">
              <strong className="font-medium text-fg">
                Escolher público ainda não publica nada.
              </strong>{' '}
              A lista pública só vai existir atrás da fila de moderação: o relato entra, o time
              enxerga, e ele só aparece depois de liberado. Enquanto a moderação não existir, a
              escolha fica guardada e nenhum relato sai daqui.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="primary"
              disabled={!dirty || saving || conflito}
              onClick={() => void salvar()}
            >
              {saving ? 'Salvando…' : 'Salvar'}
            </Button>

            {dirty && !saving && !conflito && (
              <span className="text-caption text-fg-muted">Há mudança não salva.</span>
            )}
          </div>
        </section>
      )}
    </div>
  )
}

/**
 * Uma das duas perguntas da tela.
 *
 * **É `fieldset` de verdade, e não uma `div` com um título em cima.** As duas
 * perguntas são grupos de escolha única que convivem na mesma tela: sem o
 * agrupamento, quem usa leitor de tela ouve seis opções seguidas sem saber onde
 * uma pergunta termina e a outra começa.
 */
function Grupo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <fieldset className="mb-5">
      <legend className="mb-2.5 font-medium text-detail text-fg">{titulo}</legend>
      <div className="flex flex-col gap-2.5">{children}</div>
    </fieldset>
  )
}

/**
 * Uma das três formas de reconhecer quem relata.
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
  return (
    <Escolha
      grupo="identity-mode"
      valor={valor}
      marcado={escolhido === valor}
      travado={indisponivel && escolhido !== valor}
      titulo={titulo}
      resumo={resumo}
      explicacao={explicacao}
      linhas={[
        ['Destrava:', destrava],
        ['Custo:', custo],
      ]}
      aoEscolher={() => aoEscolher(valor)}
    />
  )
}

/**
 * Um dos três níveis de visibilidade.
 *
 * **Diz quem vê, e não só o nome do nível.** "Público" é uma palavra que cada um
 * entende de um jeito — e a diferença entre "qualquer pessoa" e "quem tem o link"
 * é a diferença entre um vazamento e um relato.
 */
function Nivel({
  valor,
  escolhido,
  titulo,
  resumo,
  explicacao,
  quemVe,
  custo,
  travadoPor,
  aoEscolher,
}: {
  valor: ReportVisibility
  escolhido: ReportVisibility
  titulo: string
  resumo: string
  explicacao: string
  quemVe: string
  custo: string
  /**
   * Por que este nível não pode ser escolhido agora — e o texto é o motivo, não um
   * aviso genérico.
   *
   * **A trava depende da outra pergunta da tela**, e muda enquanto a pessoa
   * escolhe. Um controle que fica cinza sem dizer por quê é pior do que não ter o
   * controle: quem configura conclui que o produto está quebrado.
   */
  travadoPor?: string
  aoEscolher: (valor: ReportVisibility) => void
}) {
  const marcado = escolhido === valor
  const travado = travadoPor !== undefined && !marcado

  return (
    <Escolha
      grupo="report-visibility"
      valor={valor}
      marcado={marcado}
      travado={travado}
      titulo={titulo}
      resumo={resumo}
      explicacao={explicacao}
      linhas={[
        ['Quem vê:', quemVe],
        ['Custo:', custo],
        ...(travado ? ([['Ainda não:', travadoPor]] as Array<[string, string]>) : []),
      ]}
      aoEscolher={() => aoEscolher(valor)}
    />
  )
}

/**
 * O cartão de escolha que as duas perguntas dividem.
 *
 * **Um desenho só, porque as duas escolhas pedem a mesma coisa de quem lê**: o que
 * é, o que muda e o que custa. Dois cartões parecidos mas diferentes fariam a
 * segunda pergunta parecer menos importante que a primeira, e ela é a que expõe
 * texto livre para a internet.
 */
function Escolha({
  grupo,
  valor,
  marcado,
  travado,
  titulo,
  resumo,
  explicacao,
  linhas,
  aoEscolher,
}: {
  grupo: string
  valor: string
  marcado: boolean
  travado: boolean
  titulo: string
  resumo: string
  explicacao: string
  linhas: ReadonlyArray<[string, string]>
  aoEscolher: () => void
}) {
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
        name={grupo}
        value={valor}
        checked={marcado}
        disabled={travado}
        onChange={aoEscolher}
        className="mt-0.5 flex-none accent-accent"
      />
      <span className="min-w-0">
        <span className="mb-0.5 block font-medium text-detail text-fg">
          {titulo} <span className="font-normal text-fg-muted">— {resumo}</span>
        </span>
        <span className="mb-2 block text-caption text-fg-muted leading-relaxed">{explicacao}</span>

        {linhas.map(([rotulo, texto]) => (
          <span key={rotulo} className="block text-caption text-fg-muted leading-relaxed">
            <strong className="font-medium text-fg">{rotulo}</strong> {texto}
          </span>
        ))}
      </span>
    </label>
  )
}
