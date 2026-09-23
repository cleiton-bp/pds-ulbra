namespace Pds.Storage;

/// <summary>
/// O que este projeto precisa saber para falar com o armazenamento.
///
/// <para><b>Nada aqui nomeia um provedor.</b> Sao os quatro dados que qualquer
/// armazenamento compativel com a API do S3 pede, e e por isso que trocar de casa
/// e trocar valor, e nao codigo.</para>
///
/// <para>Mora neste projeto, e nao no dominio, porque e detalhe de quem implementa:
/// quem usa <c>IMediaStorage</c> nunca viu um endpoint na vida.</para>
/// </summary>
/// <param name="Endpoint">Endereco do servico.</param>
/// <param name="AccessKey">Chave de acesso.</param>
/// <param name="SecretKey">Chave secreta.</param>
/// <param name="Bucket">Balde onde a midia e gravada.</param>
/// <param name="Region">Regiao declarada na assinatura.</param>
/// <param name="ForcePathStyle">Enderecar o balde no caminho, e nao no host.</param>
/// <param name="UploadValidity">Quanto tempo vale a permissao de envio.</param>
/// <param name="ReadValidity">Quanto tempo vale a permissao de leitura.</param>
/// <param name="PlaybackValidity">Quanto tempo vale a leitura de algo que toca.</param>
public record MediaStorageOptions(
    string Endpoint,
    string AccessKey,
    string SecretKey,
    string Bucket,
    string Region,
    bool ForcePathStyle,
    TimeSpan UploadValidity,
    TimeSpan ReadValidity,
    TimeSpan PlaybackValidity);
