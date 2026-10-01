using Pds.Domain.Entities;
using Pds.Domain.Enums;
using Pds.Domain.Interfaces.RepositoryInterfaces;

namespace Pds.Service.Security;

/// <summary>
/// A porta de um relato pelo codigo pessoal: chave publica, codigo e protocolo.
///
/// <para><b>So le.</b> O codigo prova que o relato e de quem o digitou; o link e que
/// da poder sobre ele. Abrir o relato e ver os arquivos dele passam por aqui;
/// confirmar, reabrir e responder continuam na porta do token
/// (<see cref="TrackedReportGate"/>).</para>
///
/// <para><b>Uma porta so para as leituras</b>, pelo mesmo motivo da do token: repetir
/// a conferencia a mao em cada rota seria esperar que ninguem, nunca, esqueca um
/// pedaco — e o pedaco esquecido aqui abre o relato de outra pessoa.</para>
///
/// <para><b>Uma recusa so para tudo que da errado</b>: codigo em branco, codigo que
/// nao existe, protocolo que nao existe, protocolo de outra pessoa, e projeto que nao
/// usa o codigo. Responder diferente contaria a quem sonda o que ele acertou — e o
/// protocolo e curto e falado de proposito.</para>
/// </summary>
public static class ReporterCodeGate
{
    /// <summary>
    /// O relato daquele codigo, ou a recusa. A chave publica invalida e a excecao:
    /// recebe a mesma resposta de todas as rotas publicas que a pedem.
    /// </summary>
    public static async Task<Report> RequireAsync(
        IUnitOfWork unitOfWork,
        string? key,
        string? code,
        string? trackingCode,
        CancellationToken cancellationToken)
    {
        var chave = (key ?? string.Empty).Trim();

        var projectKey = chave.Length > 0
            ? await unitOfWork.ProjectKeys.FindActivePublicAsync(chave, cancellationToken)
            : null;

        if (projectKey is null)
            throw new UnauthorizedAccessException("Chave publica invalida.");

        var project = projectKey.Project;
        var digitado = (code ?? string.Empty).Trim().ToUpperInvariant();
        var protocolo = (trackingCode ?? string.Empty).Trim().ToUpperInvariant();

        if (digitado.Length == 0 || protocolo.Length == 0)
            throw new KeyNotFoundException(TrackedReportGate.Refusal);

        var identidade = await unitOfWork.ProjectIdentitySettings
            .FindByProjectWithoutSessionAsync(project.Id, cancellationToken);

        if ((identidade?.Mode ?? IdentitySettingsDefaults.Mode) != ReporterIdentityModeEnum.PersonalCode)
            throw new KeyNotFoundException(TrackedReportGate.Refusal);

        var codigo = await unitOfWork.ReporterCodes
            .FindByCodeWithoutSessionAsync(project.Id, digitado, cancellationToken);

        if (codigo is null)
            throw new KeyNotFoundException(TrackedReportGate.Refusal);

        var report = await unitOfWork.Reports
            .FindByTrackingCodeWithoutSessionAsync(protocolo, cancellationToken);

        // O relato precisa ser **deste codigo**. Sem esta linha, qualquer codigo
        // valido abriria qualquer protocolo do projeto.
        if (report is null || report.ReporterCodeId != codigo.Id)
            throw new KeyNotFoundException(TrackedReportGate.Refusal);

        return report;
    }
}
