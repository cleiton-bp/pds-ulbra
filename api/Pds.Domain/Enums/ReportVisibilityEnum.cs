namespace Pds.Domain.Enums;

/// <summary>
/// Quem pode ver os relatos deste projeto.
///
/// <para><b>Sao tres niveis, e o padrao e o mais fechado.</b> Privacidade por
/// omissao nao e preferencia: coletar texto livre de quem nunca foi perguntado e
/// publica-lo por padrao seria o contrario do que a LGPD pede.</para>
///
/// <para><b>A identidade decide o que a visibilidade pode ser.</b> Sem saber quem
/// e, nao existe "o meu relato" — e nao existe como o relator escolher aparecer.
/// Por isso <see cref="PublicIdentified"/> so e aceito em projeto que identifica.
/// A regra vale nos dois sentidos, e o servico confere o par, e nao o campo
/// sozinho.</para>
///
/// <para><b>Escolher publico ainda nao publica nada.</b> A lista publica nasce
/// atras da fila de moderacao, e nunca antes dela: o risco do modo publico nao e o
/// nome de quem relatou, e sim o documento colado no meio de um paragrafo. O nivel
/// fica gravado, e quem o le e a moderacao.</para>
///
/// <para>No banco vira texto em snake_case (private, public_anonymous,
/// public_identified).</para>
/// </summary>
public enum ReportVisibilityEnum
{
    /// <summary>
    /// So quem relatou e o time. <b>E o padrao.</b>
    ///
    /// <para>Nao ha lista publica, nao ha pagina que liste relato de terceiro, e o
    /// relato de uma pessoa nunca e alcancavel por outra — nem por lista, nem por
    /// link, nem pelo protocolo.</para>
    /// </summary>
    Private,

    /// <summary>
    /// Todos podem ler, e <b>a identidade de quem relatou nunca aparece</b>.
    ///
    /// <para>Funciona em qualquer modo de identificacao, inclusive no protocolo:
    /// aqui nao ha nada a esconder alem do texto, porque nada identifica o
    /// autor.</para>
    /// </summary>
    PublicAnonymous,

    /// <summary>
    /// Todos podem ler, e a identidade aparece <b>se o relator escolher</b>.
    ///
    /// <para><b>Exige um projeto que identifique.</b> No modo protocolo nao existe
    /// identidade para mostrar, entao este nivel nao seria "identificado": seria o
    /// anonimo com outro nome, e a tela estaria prometendo o que nao pode
    /// cumprir.</para>
    ///
    /// <para>Aparecer continua sendo escolha de quem relata, e nao do projeto — o
    /// nivel abre a possibilidade, e nao a decide.</para>
    /// </summary>
    PublicIdentified,
}
