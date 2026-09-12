import { environment } from '@/data'

/**
 * A previa e a **ferramenta de verdade**, no mesmo `iframe` e pela mesma chave
 * publica que o site do cliente usa — o mesmo caminho do relato de teste.
 *
 * A tentacao era desenhar uma imitacao dela aqui dentro, com os valores do
 * formulario aplicados ao vivo. Seria bonito e seria uma segunda implementacao do
 * quadro: no dia em que as duas divergissem, a previa continuaria linda mostrando
 * o que o site do cliente nao faz.
 *
 * **O preco e que ela mostra o que esta salvo, e nao o que esta sendo digitado.**
 * Isso esta escrito na tela, e a etiqueta muda enquanto houver mudanca por
 * publicar — uma previa que parece ao vivo e nao esta e pior do que nenhuma.
 */
export function WidgetPreview({
  publicKey,
  /** Muda a cada publicacao para o quadro recarregar com o que acabou de ser salvo. */
  version,
}: {
  publicKey: string
  version: number
}) {
  if (!publicKey) {
    return (
      <p className="text-detail text-fg-muted">
        A prévia aparece quando o projeto tiver uma chave pública ativa.
      </p>
    )
  }

  return (
    <iframe
      key={`${publicKey}-${version}`}
      title="Prévia da ferramenta"
      src={`${environment.embedUrl}?k=${encodeURIComponent(publicKey)}&route=/painel/ferramenta`}
      className="h-[26rem] w-full rounded-lg border border-border bg-surface"
    />
  )
}
