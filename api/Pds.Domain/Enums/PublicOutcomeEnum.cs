namespace Pds.Domain.Enums;

/// <summary>
/// Como um relato termina, do lado de fora.
///
/// <para><b>A lista e nossa, e e curta de proposito.</b> Os estados de dentro sao
/// do cliente — essa e a decisao que sustenta a traducao. O desfecho nao: ele e a
/// ultima coisa que a pessoa de fora le, e cada time inventando o proprio
/// vocabulario de encerramento levaria de volta ao jargao que a camada publica
/// existe para esconder.</para>
///
/// <para><b>Sao quatro porque sao os quatro finais que um relato tem.</b> Sem os
/// tres de baixo so existe "Concluido", e o relato que nao vai ser feito fica
/// pendurado na jornada esperando um fim que nunca chega — que e pior do que uma
/// recusa, porque a pessoa continua esperando.</para>
/// </summary>
public enum PublicOutcomeEnum
{
    /// <summary>Foi feito. E o unico final que o conjunto de fabrica ja traz pronto.</summary>
    Done,

    /// <summary>Foi lido, foi decidido, e a resposta e nao.</summary>
    WontDo,

    /// <summary>
    /// Faltou resposta de quem relatou, e sem ela nao havia como seguir.
    ///
    /// <para>Existe separado de <see cref="WontDo"/> porque a diferenca e de quem
    /// e a vez: aqui o time parou esperando, e nao decidiu contra.</para>
    /// </summary>
    NoAnswer,

    /// <summary>
    /// Ja existia: o mesmo problema ja tinha sido relatado antes.
    ///
    /// <para>Nao e recusa. O assunto continua vivo em outro relato, e dizer isso e
    /// melhor do que encerrar sem explicacao.</para>
    /// </summary>
    Duplicate,
}
