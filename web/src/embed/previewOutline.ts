/**
 * O contorno da parte do formulario que a tela do painel esta mudando, **so na previa**
 * (`PreviewMessage.highlight`): tracejado, fino e afastado da parte, para apontar sem
 * cobrir o que se le nela. Na cor de acao do tema do quadro, que acompanha o claro e o
 * escuro do formulario.
 *
 * Mora fora de `EmbedApp` porque a area de anexar (`AttachmentPicker`) desenha o dela.
 */
export const PREVIEW_OUTLINE = 'rounded-lg outline-2 outline-accent outline-dashed outline-offset-4'
