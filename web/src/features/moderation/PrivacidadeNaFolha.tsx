import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { IdentitySettingsViewModel, ReportVisibility } from '@/contracts'
import { describeError, projectIdentitySettingsService } from '@/data'
import { BottomSheet } from '@/shared/components/BottomSheet'
import { Button } from '@/shared/components/Button'
import { RadioGroup } from '@/shared/components/SettingsControls'
import { Skeleton } from '@/shared/components/Skeleton'
import { toast } from '@/shared/components/toastStore'
import { DesenhoDoNivel, NIVEIS, nivelDe } from '@/shared/components/VisibilityLevels'
import type { EstadoDaVolta } from '@/shared/components/VoltarDeOndeVeio'

/**
 * **Mudar a privacidade sem sair da Moderação**, no celular. O link levava a tela de
 * Privacidade inteira, e quem so queria abrir ou fechar o projeto perdia a fila de vista e
 * nao tinha como voltar. A folha traz so a pergunta de quem pode ver os relatos, com os
 * mesmos tres niveis e desenhos da tela de Privacidade, e o resto fica no "Mais opções".
 *
 * **Grava so a visibilidade.** Le o registro de novo na hora de salvar e manda tudo como
 * esta, mudando so ela: o que outra pessoa mudou em Privacidade nesse meio tempo fica.
 *
 * O publico identificado fica travado no protocolo, como la: no protocolo nao ha nome
 * para mostrar, e quem decide o modo e a tela de Privacidade.
 */
export function PrivacidadeNaFolha({
  open,
  onOpenChange,
  projectPublicId,
  aoSalvar,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectPublicId: string
  /** Depois de gravar: a Moderação relê a privacidade, e a frase do topo troca. */
  aoSalvar: () => void
}) {
  const [lido, setLido] = useState<IdentitySettingsViewModel | null>(null)
  const [falhou, setFalhou] = useState(false)
  const [escolha, setEscolha] = useState<ReportVisibility | null>(null)
  const [salvando, setSalvando] = useState(false)
  const pedido = useRef(0)

  // Cada vez que abre, le de novo: a folha mostra o que esta gravado agora.
  useEffect(() => {
    if (!open) return
    const meu = ++pedido.current
    setLido(null)
    setFalhou(false)
    projectIdentitySettingsService.getIdentitySettings(projectPublicId).then(
      (configuracao) => {
        if (meu !== pedido.current) return
        setLido(configuracao)
        setEscolha(configuracao.Visibility)
      },
      () => {
        if (meu === pedido.current) setFalhou(true)
      },
    )
  }, [open, projectPublicId])

  async function salvar() {
    if (!lido || !escolha || salvando) return
    setSalvando(true)
    try {
      const agora = await projectIdentitySettingsService.getIdentitySettings(projectPublicId)
      await projectIdentitySettingsService.saveIdentitySettings(projectPublicId, {
        Mode: agora.Mode,
        Visibility: escolha,
        AsksForName: agora.AsksForName,
        IdentityPublicKey: agora.IdentityPublicKey,
        IdentityTokenMaxMinutes: agora.IdentityTokenMaxMinutes,
        IdentityRequired: agora.IdentityRequired,
        IdentityFormat: agora.IdentityFormat,
      })
      toast.done('Privacidade: salvo.')
      aoSalvar()
      onOpenChange(false)
    } catch (falha) {
      toast.error(describeError(falha))
    } finally {
      setSalvando(false)
    }
  }

  const volta: EstadoDaVolta = {
    voltarPara: `/projects/${projectPublicId}/moderation`,
    rotuloDaVolta: 'Moderação',
  }
  const mudou = lido !== null && escolha !== null && escolha !== lido.Visibility

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Quem pode ver os relatos"
      footer={
        <>
          <Link
            to={`/projects/${projectPublicId}/identity#visibilidade`}
            state={volta}
            className="alvo-de-toque relative py-2 text-detail text-fg-muted underline underline-offset-4 hover:text-fg"
          >
            Mais opções
          </Link>
          <Button variant="primary" disabled={!mudou || salvando} onClick={() => void salvar()}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </Button>
        </>
      }
    >
      {falhou ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-body text-fg-muted leading-relaxed">
            Não deu para ler a privacidade agora, e nada mudou.
          </p>
          <Button onClick={() => onOpenChange(false)}>Fechar</Button>
        </div>
      ) : !lido || !escolha ? (
        <Skeleton className="h-36 w-full rounded-xl" />
      ) : (
        <>
          {/* `pt-1.5`: o visto da peca marcada sai 6px pelo alto, e a area que rola o
              cortava. As tres numa linha so, ate em 320 (`min-w-0`): com a largura minima
              da tela de Privacidade, a terceira caia sozinha embaixo. */}
          <RadioGroup<ReportVisibility>
            label="Quem pode ver os relatos"
            className="flex-nowrap pt-1.5"
            value={escolha}
            onChange={setEscolha}
            options={NIVEIS.map((nivel) => {
              const travado =
                nivel.valor === 'PublicIdentified' &&
                lido.Mode === 'Protocol' &&
                lido.Visibility !== nivel.valor
              return {
                value: nivel.valor,
                label: nivel.titulo,
                drawing: <DesenhoDoNivel nivel={nivel.valor} />,
                note: travado ? 'Depende de um modo que identifique' : undefined,
                disabled: travado,
                className: 'min-w-0 flex-1 basis-0 text-center',
              }
            })}
          />
          {/* O que a escolha marcada faz, numa frase, e dito de novo a cada troca. */}
          <p aria-live="polite" className="mt-3 text-body text-fg leading-relaxed">
            {nivelDe(escolha).resumo}
          </p>
          {escolha !== 'Private' && (
            <p className="mt-1 text-detail text-fg-muted leading-relaxed">
              Cada relato só aparece depois que alguém do time o libera aqui.
            </p>
          )}
        </>
      )}
    </BottomSheet>
  )
}
