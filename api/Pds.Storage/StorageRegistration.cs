using Microsoft.Extensions.DependencyInjection;
using Pds.Domain.Constants;
using Pds.Domain.Interfaces.ServiceInterfaces;

namespace Pds.Storage;

/// <summary>
/// Liga o armazenamento, <b>se</b> houver armazenamento.
///
/// <para><b>A ausencia dele e um caminho previsto, e nao uma falha.</b> Sem as
/// variaveis a aplicacao sobe inteira, o armazenamento responde que nao esta
/// disponivel, e a configuracao de midia do projeto recusa ligar anexo — dizendo
/// por que. Mesma escolha do <c>AddPdsWorkers</c> com a fila.</para>
///
/// <para><b>Configuracao pela metade e outra coisa, e ai derruba.</b> Nao
/// configurar e uma decisao; configurar o endereco e esquecer a chave e um engano,
/// e um engano que ficaria escondido como "midia indisponivel" ate alguem passar
/// uma tarde procurando. O que falta e erro na subida.</para>
/// </summary>
public static class StorageRegistration
{
    public static IServiceCollection AddPdsStorage(this IServiceCollection services)
    {
        var options = ReadOptions();

        if (options is null)
        {
            services.AddSingleton<IMediaStorage, UnavailableMediaStorage>();
            return services;
        }

        services.AddSingleton(options);
        services.AddSingleton<IMediaStorage, S3MediaStorage>();

        return services;
    }

    /// <summary>
    /// Le as quatro variaveis essenciais. Devolve nulo so quando <b>nenhuma</b>
    /// delas existe; faltando alguma, lanca dizendo qual.
    /// </summary>
    private static MediaStorageOptions? ReadOptions()
    {
        var lidas = new Dictionary<string, string?>
        {
            ["MEDIA_STORAGE_ENDPOINT"] = EnvironmentConstants.GetMediaStorageEndpoint(),
            ["MEDIA_STORAGE_ACCESS_KEY"] = EnvironmentConstants.GetMediaStorageAccessKey(),
            ["MEDIA_STORAGE_SECRET_KEY"] = EnvironmentConstants.GetMediaStorageSecretKey(),
            ["MEDIA_STORAGE_BUCKET"] = EnvironmentConstants.GetMediaStorageBucket(),
        };

        if (lidas.Values.All(string.IsNullOrWhiteSpace))
            return null;

        var faltando = lidas.Where(par => string.IsNullOrWhiteSpace(par.Value))
            .Select(par => par.Key)
            .ToArray();

        if (faltando.Length > 0)
            throw new InvalidOperationException(
                $"Armazenamento de midia configurado pela metade: falta {string.Join(", ", faltando)}.");

        return new MediaStorageOptions(
            Endpoint: lidas["MEDIA_STORAGE_ENDPOINT"]!,
            AccessKey: lidas["MEDIA_STORAGE_ACCESS_KEY"]!,
            SecretKey: lidas["MEDIA_STORAGE_SECRET_KEY"]!,
            Bucket: lidas["MEDIA_STORAGE_BUCKET"]!,
            Region: EnvironmentConstants.GetMediaStorageRegion(),
            ForcePathStyle: EnvironmentConstants.GetMediaStorageForcePathStyle(),
            UploadValidity: TimeSpan.FromMinutes(EnvironmentConstants.GetMediaStorageUploadUrlMinutes()),
            ReadValidity: TimeSpan.FromMinutes(EnvironmentConstants.GetMediaStorageReadUrlMinutes()),
            PlaybackValidity: TimeSpan.FromMinutes(EnvironmentConstants.GetMediaStoragePlaybackUrlMinutes()));
    }
}
