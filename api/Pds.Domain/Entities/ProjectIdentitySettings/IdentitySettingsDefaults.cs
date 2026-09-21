using Pds.Domain.Enums;

namespace Pds.Domain.Entities;

/// <summary>
/// O que vale quando ninguem configurou nada.
///
/// <para><b>Projeto novo tem de andar sem ninguem abrir esta tela.</b> E o criterio
/// que atravessa a etapa inteira: a configuracao existe para quem quer outra coisa,
/// e nao para quem precisa comecar.</para>
///
/// <para><b>Moram em codigo, e nao como valor padrao de coluna.</b> Assim existem
/// num lugar so — com o padrao no banco, mudar de ideia deixaria as linhas antigas
/// com o valor velho e as novas com o novo, e nenhuma delas saberia disso.</para>
/// </summary>
public static class IdentitySettingsDefaults
{
    /// <summary>
    /// Protocolo: o comportamento de hoje, e o unico modo que nao exige nada do
    /// cliente.
    ///
    /// <para><b>O padrao aqui e o mais fechado, e nao o mais util.</b> Comecar
    /// identificando seria comecar coletando dado pessoal de quem nunca foi
    /// perguntado — e a escolha de coletar precisa ser um ato de quem configura, e
    /// nao o que acontece por omissao.</para>
    /// </summary>
    public const ReporterIdentityModeEnum Mode = ReporterIdentityModeEnum.Protocol;

    /// <summary>
    /// Privado: so quem relatou e o time.
    ///
    /// <para><b>O padrao mais fechado dos tres</b>, e e o unico defensavel: um
    /// projeto novo que ja nascesse publicando texto livre publicaria o primeiro
    /// relato antes de alguem descobrir que a tela existe.</para>
    /// </summary>
    public const ReportVisibilityEnum Visibility = ReportVisibilityEnum.Private;

    /// <summary>
    /// Nao pergunta o nome.
    ///
    /// <para>Coletar dado pessoal por omissao seria o produto decidindo no lugar de
    /// quem configura — e de quem relata, que nem chegou a ser perguntada.</para>
    /// </summary>
    public const bool AsksForName = false;
}
