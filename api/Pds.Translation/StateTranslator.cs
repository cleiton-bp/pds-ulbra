namespace Pds.Translation;

/// <summary>
/// O motor de traducao: dado um estado interno, decide o que a jornada publica faz.
///
/// <para><b>E uma funcao pura, e e so isso.</b> Mesma entrada, mesma saida, sempre.
/// Nao le relogio, nao sorteia, nao guarda nada entre chamadas e nao alcanca banco
/// nem rede — o projeto em que ela mora nao referencia nada, entao isso nao depende
/// de ninguem lembrar. E o que permite exercitar todo caminho possivel em
/// milissegundos, inclusive os que dariam trabalho para reproduzir a mao.</para>
///
/// <para><b>Ela nao grava nada.</b> Devolve uma decisao, e quem chamou escreve o
/// evento e atualiza o cache. Se ela gravasse, precisaria de banco; precisando de
/// banco, cada teste viraria uma transacao; e a suite que sustenta o argumento
/// central do trabalho passaria a depender de um servidor de pe.</para>
/// </summary>
public static class StateTranslator
{
    /// <summary>
    /// Traduz um movimento interno em decisao publica.
    /// </summary>
    /// <param name="internalStateId">
    /// O estado interno para onde o relato acabou de ir.
    /// </param>
    /// <param name="mapping">
    /// O mapa que valia no momento: estado interno para etapa publica. <b>Uma
    /// versao especifica</b>, e nao "o mapa atual" — quem chama escolhe qual, e e
    /// assim que recontar o passado devolve o que aconteceu de verdade.
    /// </param>
    /// <param name="current">
    /// A etapa em que o relato esta hoje do lado de fora, ou nulo quando ele ainda
    /// nao apareceu em nenhuma — o caso de todo relato recem-chegado.
    /// </param>
    public static TranslationDecision Translate(
        long internalStateId,
        IReadOnlyDictionary<long, PublicStageRef> mapping,
        PublicStageRef? current)
    {
        ArgumentNullException.ThrowIfNull(mapping);

        // Estado fora do mapa: nao ha para onde ir, e inventar um destino seria
        // mentir para quem acompanha. Primeiro de proposito — nenhuma das regras
        // abaixo faz sentido sem um destino.
        if (!mapping.TryGetValue(internalStateId, out var destino))
            return new TranslationDecision(TranslationOutcomeEnum.Unmapped, null);

        // Relato que ainda nao apareceu do lado de fora entra na etapa mapeada, seja
        // ela qual for. Nao ha de onde voltar, entao a regra de regressao nao se
        // aplica — e exigir que a primeira etapa fosse a primeira da jornada
        // impediria o time de triar um relato antes de ele aparecer.
        if (current is null)
            return new TranslationDecision(TranslationOutcomeEnum.Advance, destino);

        var atual = current.Value;

        // Varios estados internos caem na mesma etapa, e esse e o caminho comum: o
        // time mexeu em algo que nao muda nada para quem esta de fora.
        if (atual.Id == destino.Id)
            return new TranslationDecision(TranslationOutcomeEnum.SameStage, destino);

        // Para tras so com permissao. A comparacao e por posicao, e nao por
        // identificador: e a ordem da jornada que diz o que e avancar.
        //
        // Posicao igual entre etapas diferentes nao e retrocesso — a posicao nao e
        // unica, e duas etapas lado a lado sao um empate, nao uma volta.
        if (destino.Position < atual.Position && !destino.AllowsReturn)
            return new TranslationDecision(TranslationOutcomeEnum.RegressionHeld, destino);

        return new TranslationDecision(TranslationOutcomeEnum.Advance, destino);
    }

    /// <summary>
    /// Traduz uma <b>reabertura</b>, que e outra pergunta.
    ///
    /// <para><b>Reabrir nao e regredir, e por isso nao passa pela regra da
    /// regressao.</b> Aquela regra existe para o vaivem interno do time nao sacudir
    /// a linha do tempo de quem espera — o relato que volta de "Testando" para
    /// "Corrigindo" nao e noticia para ninguem de fora. Aqui e o oposto: quem pediu
    /// o retorno foi a propria pessoa, dizendo que nao esta certo. Segurar a jornada
    /// nesse momento deixaria a pagina dela mostrando "Concluido" depois de ela
    /// mesma ter dito que nao concluiu.</para>
    ///
    /// <para><b>E funcao propria, e nao um parametro na outra.</b> Um sinalizador
    /// convidaria a passar "forca" num movimento comum, e a regra de regressao —
    /// que e decisao de produto — viraria opcional por descuido. Aqui ela
    /// simplesmente nao existe: nao ha o que desligar.</para>
    ///
    /// <para><b>A etapa atual ainda importa, mas por um motivo so.</b> Ela nao
    /// segura mais nada — segura apenas o evento vazio: se a coluna de destino cai
    /// na etapa em que o relato ja esta, nada mudou do lado de fora, e gravar uma
    /// mudanca seria encher a linha do tempo de uma linha que nao aconteceu.</para>
    /// </summary>
    /// <param name="internalStateId">A coluna para onde a reabertura joga o relato.</param>
    /// <param name="mapping">O mapa da versao que vale, como na traducao comum.</param>
    /// <param name="current">A etapa em que o relato esta agora, ou nula.</param>
    /// <returns>
    /// Nunca <see cref="TranslationOutcomeEnum.RegressionHeld"/> — nao ha o que
    /// segurar aqui. <see cref="TranslationOutcomeEnum.Unmapped"/> quando a coluna
    /// nao esta no mapa, <see cref="TranslationOutcomeEnum.SameStage"/> quando o
    /// destino e onde o relato ja esta, e
    /// <see cref="TranslationOutcomeEnum.Advance"/> no resto — <b>inclusive para
    /// tras</b>, que e o caso que da nome a funcao.
    /// </returns>
    public static TranslationDecision TranslateReopen(
        long internalStateId,
        IReadOnlyDictionary<long, PublicStageRef> mapping,
        PublicStageRef? current)
    {
        ArgumentNullException.ThrowIfNull(mapping);

        if (!mapping.TryGetValue(internalStateId, out var destino))
            return new TranslationDecision(TranslationOutcomeEnum.Unmapped, null);

        if (current is PublicStageRef atual && atual.Id == destino.Id)
            return new TranslationDecision(TranslationOutcomeEnum.SameStage, destino);

        return new TranslationDecision(TranslationOutcomeEnum.Advance, destino);
    }
}
