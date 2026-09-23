using Pds.Domain.Interfaces.ServiceInterfaces;

namespace Pds.Storage;

/// <summary>
/// O armazenamento de quem nao configurou armazenamento nenhum.
///
/// <para><b>Existe para a aplicacao subir inteira sem ele.</b> Anexo e uma regra
/// que o projeto liga se quiser; exigir o armazenamento na subida faria quem nunca
/// quis midia deixar de funcionar por causa dela.</para>
///
/// <para><b>E ele nao finge que assinou.</b> <see cref="IsAvailable"/> falso e lido
/// pela configuracao de midia do projeto, que <b>recusa</b> ligar anexo — entao,
/// na pratica, ninguem chega a chamar os metodos. Se chegar, a excecao e melhor do
/// que o silencio: uma URL que nao leva a lugar nenhum viraria um envio que falha
/// depois de a pessoa ja ter escolhido o arquivo.</para>
/// </summary>
public class UnavailableMediaStorage : IMediaStorage
{
    public bool IsAvailable => false;

    public Task<MediaUploadTicket> CreateUploadTicketAsync(
        string objectKey,
        string contentType,
        long maxBytes,
        CancellationToken cancellationToken = default)
        => throw new InvalidOperationException(Motivo);

    public Task<SignedReadUrl> CreateReadUrlAsync(
        string objectKey,
        bool forPlayback = false,
        CancellationToken cancellationToken = default)
        => throw new InvalidOperationException(Motivo);

    public Task<MediaObjectInfo?> InspectAsync(
        string objectKey,
        int leadingBytes,
        CancellationToken cancellationToken = default)
        => throw new InvalidOperationException(Motivo);

    public Task DeleteAsync(string objectKey, CancellationToken cancellationToken = default)
        => throw new InvalidOperationException(Motivo);

    private const string Motivo = "Nao ha armazenamento configurado para guardar midia.";
}
