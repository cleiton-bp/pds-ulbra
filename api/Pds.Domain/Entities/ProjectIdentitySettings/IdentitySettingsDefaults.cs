using Pds.Domain.Enums;

namespace Pds.Domain.Entities;

/// <summary>
/// O que vale quando ninguem configurou nada.
///
/// <para><b>Projeto novo tem de andar sem ninguem abrir esta tela.</b> E o criterio
/// de toda configuracao do projeto: ela existe para quem quer outra coisa,
/// e nao para quem precisa comecar.</para>
///
/// <para><b>Moram em codigo, e nao como valor padrao de coluna.</b> Assim existem
/// num lugar so — com o padrao no banco, mudar de ideia deixaria as linhas antigas
/// com o valor velho e as novas com o novo, e nenhuma delas saberia disso.</para>
/// </summary>
public static class IdentitySettingsDefaults
{
    /// <summary>
    /// Codigo pessoal: a pessoa ganha um codigo sorteado e reencontra os relatos dela
    /// em "os meus relatos", sem o cliente precisar de nada alem do script colado.
    ///
    /// <para><b>Nao coleta dado pessoal.</b> O codigo e sorteado aqui, e nao diz quem a
    /// pessoa e: e o modo mais util que continua sem identificar ninguem. Coletar, como
    /// pedir o nome ou herdar a identidade do sistema do cliente, segue sendo um ato de
    /// quem configura, e nao o que acontece por omissao.</para>
    /// </summary>
    public const ReporterIdentityModeEnum Mode = ReporterIdentityModeEnum.PersonalCode;

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
    /// <summary>Sem chave: o modo herdado so passa a valer quando o cliente cola a dele.</summary>
    public const string? IdentityPublicKey = null;
    /// <summary>Quinze minutos: o bastante para abrir o formulario e escrever, e curto demais para servir de login.</summary>
    public const int IdentityTokenMaxMinutes = 15;
    /// <summary>Sem token, o relato entra como protocolo: relato perdido e pior que relato sem lista.</summary>
    public const bool IdentityRequired = false;
    /// <summary>
    /// A assinatura simples: uma linha em qualquer linguagem, sem biblioteca. Quem ja usa
    /// JWT escolhe o JWT.
    /// </summary>
    public const IdentityFormatEnum IdentityFormat = IdentityFormatEnum.Hmac;
}
