using Pds.Domain.Interfaces.RepositoryInterfaces;
using Pds.Domain.Interfaces.ServiceInterfaces;

namespace Pds.Service.Reports;

/// <summary>
/// Os arquivos dos anexos de cards apagados de vez, saindo do armazenamento depois do
/// banco. Um lugar so para as duas exclusoes de verdade: os cards de um endereco
/// bloqueado e os relatos retidos de um endereco que o time bloqueou.
/// </summary>
public static class StoredFiles
{
    /// <summary>
    /// Apaga os arquivos, um por um, engolindo a falha — a mesma regra do descarte de
    /// anexo: o banco ja decidiu, e a resposta precisa ser essa. O pior caso e um arquivo
    /// sobrando no balde sem nada apontando para ele. O arquivo que ainda e de outro
    /// anexo fica.
    /// </summary>
    public static async Task DeleteUnusedAsync(IUnitOfWork unitOfWork, IMediaStorage mediaStorage, IReadOnlyList<string> objectKeys)
    {
        if (objectKeys.Count == 0 || !mediaStorage.IsAvailable)
            return;

        foreach (var chave in objectKeys)
        {
            try
            {
                if (await unitOfWork.ReportAttachments.IsObjectKeyInUseWithoutSessionAsync(chave, CancellationToken.None))
                    continue;

                await mediaStorage.DeleteAsync(chave, CancellationToken.None);
            }
            catch
            {
                // Ver o resumo acima.
            }
        }
    }
}
