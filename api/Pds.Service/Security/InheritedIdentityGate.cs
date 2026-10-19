using Pds.Domain.Entities;
using Pds.Domain.Enums;
using Pds.Domain.Interfaces.RepositoryInterfaces;

namespace Pds.Service.Security;

/// <summary>
/// A porta de leitura de um relato pela identidade do sistema do cliente — o espelho
/// de <see cref="ReporterCodeGate"/> com o token no lugar do codigo.
///
/// <para><b>Uma recusa so, para todos os enganos.</b> Token em branco, token que nao
/// confere, projeto que nao usa o modo, pessoa que nunca relatou aqui, protocolo que
/// nao existe e protocolo de outra pessoa recebem a mesma resposta: dizer qual deles
/// falhou contaria algo sobre o projeto ou sobre outra pessoa.</para>
///
/// <para><b>Le, e nao age.</b> A identidade prova que o relato e da pessoa; o link e
/// que da poder sobre ele — a mesma regra do codigo pessoal.</para>
/// </summary>
public static class InheritedIdentityGate
{
    public static async Task<Report> RequireAsync(
        IUnitOfWork unitOfWork,
        string? key,
        string? identityToken,
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
        var protocolo = (trackingCode ?? string.Empty).Trim().ToUpperInvariant();

        if (string.IsNullOrWhiteSpace(identityToken) || protocolo.Length == 0)
            throw new KeyNotFoundException(TrackedReportGate.Refusal);

        var pessoa = await TryResolveAsync(unitOfWork, project.Id, chave, identityToken, cancellationToken);
        if (pessoa is null)
            throw new KeyNotFoundException(TrackedReportGate.Refusal);

        var report = await unitOfWork.Reports
            .FindByTrackingCodeWithoutSessionAsync(protocolo, cancellationToken);

        // O relato precisa ser **desta pessoa**. Sem esta linha, qualquer token
        // valido abriria qualquer protocolo do projeto.
        if (report is null || report.ReporterCodeId != pessoa.Id)
            throw new KeyNotFoundException(TrackedReportGate.Refusal);

        return report;
    }

    /// <summary>
    /// A linha da pessoa neste projeto, pelo token: nulo quando o projeto nao usa o
    /// modo, o token nao confere, ou a pessoa nunca relatou aqui. Nao cria nada — criar
    /// e so do envio do relato.
    /// </summary>
    public static async Task<ReporterCode?> TryResolveAsync(
        IUnitOfWork unitOfWork,
        long projectId,
        string key,
        string? identityToken,
        CancellationToken cancellationToken)
    {
        var identidade = await unitOfWork.ProjectIdentitySettings
            .FindByProjectWithoutSessionAsync(projectId, cancellationToken);

        if (identidade is null || identidade.Mode != ReporterIdentityModeEnum.InheritedIdentity)
            return null;

        var claims = await InheritedIdentity.VerifyAsync(identityToken, identidade, key, DateTime.UtcNow);
        if (claims is null)
            return null;

        return await unitOfWork.ReporterCodes.FindBySubjectHashWithoutSessionAsync(
            projectId, InheritedIdentity.SubjectHash(identidade, claims.Value.Subject), cancellationToken);
    }
}
