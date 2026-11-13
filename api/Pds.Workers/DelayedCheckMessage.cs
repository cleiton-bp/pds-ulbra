using Pds.Domain.Interfaces.ServiceInterfaces;

namespace Pds.Workers;

/// <summary>
/// O que viaja na fila: qual verificacao, e sobre qual relato. Nada mais.
///
/// <para><b>A decisao nao vai junto, e isso e a regra do desenho.</b> Se a mensagem
/// carregasse "mova para a etapa X" ou "encerre como sem retorno", ela estaria
/// congelando no agendamento uma resposta que so vale no consumo — e o desfazer,
/// que e o motivo de tudo isto existir, deixaria de funcionar: a mensagem chegaria
/// depois insistindo numa acao que ja nao cabe.</para>
///
/// <para>Levando so o identificador, quem consome e obrigado a reler o estado
/// atual. Dai sair de graca que mensagem duplicada nao faz dano, que mensagem fora
/// de ordem nao faz dano, e que desfazer nao precisa cancelar nada.</para>
/// </summary>
/// <param name="Kind">Qual verificacao.</param>
/// <param name="ReportPublicId">O relato a reavaliar, nas verificacoes de relato; vazio na da conta.</param>
/// <param name="AccountPublicId">
/// A conta a reavaliar, so na limpeza da exclusao. Opcional e no fim, de proposito: as
/// mensagens que ja estao na fila, gravadas antes deste campo existir, continuam sendo
/// lidas do mesmo jeito.
/// </param>
public record DelayedCheckMessage(DelayedCheckKind Kind, Guid ReportPublicId, Guid? AccountPublicId = null);
