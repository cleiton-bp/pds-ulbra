using Pds.Domain.Enums;

namespace Pds.Domain.ViewModels;

/// <summary>
/// Como quem relata e identificado neste projeto.
///
/// <para><b>Nunca vem vazia.</b> Projeto que nunca abriu a tela recebe os padroes,
/// e a resposta e indistinguivel da de quem salvou aqueles mesmos valores — de
/// proposito: quem le nao precisa saber se existe linha no banco, precisa saber
/// como o projeto se comporta.</para>
/// </summary>
/// <param name="Mode">Protocolo, codigo pessoal ou identidade herdada.</param>
/// <param name="Visibility">Privado, publico anonimo ou publico identificado.</param>
/// <param name="AsksForName">A ferramenta pergunta o nome de quem relata. Perguntar nao e publicar.</param>
/// <param name="IdentityPublicKey">A chave publica do sistema do cliente (SPKI base64), ou nula. Publica: pode voltar inteira.</param>
/// <param name="IdentityTokenMaxMinutes">Teto de validade do token do sistema do cliente, em minutos.</param>
/// <param name="IdentityRequired">No modo herdado, o relato sem token e recusado (true) ou entra como protocolo (false).</param>
public record IdentitySettingsViewModel(
    ReporterIdentityModeEnum Mode,
    ReportVisibilityEnum Visibility,
    bool AsksForName,
    string? IdentityPublicKey,
    int IdentityTokenMaxMinutes,
    bool IdentityRequired);
