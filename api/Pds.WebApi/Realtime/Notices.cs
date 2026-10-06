namespace Pds.WebApi.Realtime;

/// <summary>
/// Um card do projeto mudou. So identificadores: quem recebe rele pela REST.
/// </summary>
/// <param name="ProjectPublicId">O projeto.</param>
/// <param name="ReportPublicId">O card.</param>
/// <param name="StatePublicId">A coluna em que ele esta agora — nula quando nao tem nenhuma.</param>
/// <param name="Archived">Se ele esta no arquivo agora (e, portanto, fora do quadro).</param>
/// <param name="Origin">A conexao que fez a mudanca, quando veio do painel: aquela aba ja
/// esta certa e ignora o proprio aviso. Nula quando veio de fora (quem relatou, a fila).</param>
public record CardChangedNotice(
    Guid ProjectPublicId,
    Guid ReportPublicId,
    Guid? StatePublicId,
    bool Archived,
    string? Origin);

/// <summary>A configuracao que a tela de Trabalho usa mudou: a tela rele tudo.</summary>
public record ProjectChangedNotice(Guid ProjectPublicId, string? Origin);

/// <summary>A pessoa saiu do time do projeto.</summary>
public record AccessLostNotice(Guid ProjectPublicId);
