namespace Pds.Translation;

/// <summary>
/// O que a jornada publica faz diante de um movimento interno.
///
/// <para><b>Sao quatro, e nao um sim/nao</b>, porque os tres jeitos de nao andar
/// sao fatos diferentes: um e rotina, um e uma decisao de produto e um e
/// configuracao faltando. Um booleano juntaria os tres, e quem lesse o historico
/// depois nao teria como separa-los.</para>
/// </summary>
public enum TranslationOutcomeEnum
{
    /// <summary>A jornada anda para a etapa nova.</summary>
    Advance,

    /// <summary>
    /// O movimento interno caiu na mesma etapa publica em que o relato ja estava.
    ///
    /// <para>E o caso mais comum, e e o produto funcionando: o time mexeu em algo
    /// que nao muda nada para quem esta de fora.</para>
    /// </summary>
    SameStage,

    /// <summary>
    /// O movimento voltaria a jornada para tras, e a etapa de destino nao permite.
    ///
    /// <para><b>E decisao de produto, e nao limitacao.</b> Regressao publica destroi
    /// a confianca de quem acompanha — ver o relato desandar e pior do que ve-lo
    /// parado. A regressao continua gravada como evento interno: nada se perde, so
    /// nao aparece.</para>
    /// </summary>
    RegressionHeld,

    /// <summary>
    /// O estado interno nao esta no mapa.
    ///
    /// <para>O relato fica onde esta. Nao vaza o nome do estado, nao inventa uma
    /// etapa e nao recusa o movimento de dentro — o time continua trabalhando, e
    /// quem configurou e avisado de que falta uma ligacao.</para>
    /// </summary>
    Unmapped,
}

/// <summary>
/// O que o motor decidiu, e para onde.
/// </summary>
/// <param name="Outcome">A decisao.</param>
/// <param name="Stage">
/// A etapa envolvida: o destino quando a jornada anda, e a etapa <b>pretendida</b>
/// quando ela nao anda. Nula so em <see cref="TranslationOutcomeEnum.Unmapped"/>,
/// que e justamente o caso em que nao ha etapa nenhuma.
/// </param>
public readonly record struct TranslationDecision(
    TranslationOutcomeEnum Outcome,
    PublicStageRef? Stage)
{
    /// <summary>Atalho de leitura: a jornada muda de etapa?</summary>
    public bool Moves => Outcome == TranslationOutcomeEnum.Advance;
}
