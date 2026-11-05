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
/// <param name="IdentityFormat">Como o sistema do cliente assina o cracha: HMAC ou JWT.</param>
/// <param name="IsHmacAvailable">
/// A instalacao tem a chave mestra do HMAC (<c>IDENTITY_HMAC_KEY</c>). Nao e do projeto: sem
/// ela, a tela oferece so o JWT e diz por que.
/// </param>
public record IdentitySettingsViewModel(
    ReporterIdentityModeEnum Mode,
    ReportVisibilityEnum Visibility,
    bool AsksForName,
    string? IdentityPublicKey,
    int IdentityTokenMaxMinutes,
    bool IdentityRequired,
    IdentityFormatEnum IdentityFormat,
    bool IsHmacAvailable);

/// <summary>
/// A chave secreta do HMAC deste projeto, para o administrador colar no servidor do
/// sistema dele. **Sai so por pedido, numa rota propria**, e nunca na leitura da
/// configuracao: a leitura vai para todo membro, e a chave so para quem administra.
/// </summary>
/// <param name="Secret">A chave, como o servidor do cliente a usa (texto, em UTF-8).</param>
public record IdentitySecretViewModel(string Secret);

/// <summary>
/// Uma chave secreta do HMAC que ja nao vale: **so o comeco dela**, para o administrador
/// reconhecer qual chave um servidor ainda usa, e quando ela foi trocada.
/// </summary>
/// <param name="Prefix">O comeco da chave (<c>rfs_</c> e oito caracteres). Nulo sem a chave mestra, que e de onde ela sai.</param>
/// <param name="ReplacedAt">Quando ela foi trocada pela seguinte.</param>
public record IdentitySecretHistoryItemViewModel(string? Prefix, DateTime ReplacedAt);
