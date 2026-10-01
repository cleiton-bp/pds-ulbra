using System.Net;
using Amazon.Runtime;
using Amazon.S3;
using Amazon.S3.Model;
using Pds.Domain.Interfaces.ServiceInterfaces;

namespace Pds.Storage;

/// <summary>
/// O armazenamento, falado pela API do S3.
///
/// <para><b>Nao ha nome de provedor nesta classe, e isso e o ponto.</b> A API do S3
/// e falada por varios armazenamentos diferentes, e todos pedem os mesmos quatro
/// dados. Trocar de casa e trocar variavel de ambiente; nenhuma linha daqui muda,
/// e nenhuma camada acima fica sabendo.</para>
///
/// <para><b>O arquivo nunca passa por aqui.</b> Esta classe assina permissoes; quem
/// carrega os bytes e o navegador, falando direto com o armazenamento.</para>
///
/// <para><b>Dois clientes, porque ha dois caminhos ate o armazenamento.</b> A API
/// fala com ele por um endereco — com a API num container, o nome do servico na
/// rede interna — e o navegador, por outro. A assinatura cobre o host, entao ela
/// precisa sair com o endereco que o navegador usa: assinada com o interno, o
/// navegador nem resolveria o nome. Assinar nao faz chamada nenhuma, e por isso o
/// segundo cliente so assina.</para>
/// </summary>
public class S3MediaStorage : IMediaStorage, IDisposable
{
    private readonly IAmazonS3 _client;
    private readonly IAmazonS3 _signer;
    private readonly string _bucket;
    private readonly string _esquema;
    private readonly TimeSpan _validadeEnvio;
    private readonly TimeSpan _validadeLeitura;
    private readonly TimeSpan _validadeReproducao;

    public S3MediaStorage(MediaStorageOptions options)
    {
        _bucket = options.Bucket;
        _validadeEnvio = options.UploadValidity;
        _validadeLeitura = options.ReadValidity;
        _validadeReproducao = options.PlaybackValidity;

        // O esquema que vale e o do endereco assinado: e ele que o navegador usa.
        _esquema = Uri.TryCreate(options.PublicEndpoint, UriKind.Absolute, out var endereco)
            ? endereco.Scheme
            : Uri.UriSchemeHttps;

        var credenciais = new BasicAWSCredentials(options.AccessKey, options.SecretKey);

        _client = new AmazonS3Client(credenciais, Config(options.Endpoint, options));
        _signer = options.PublicEndpoint == options.Endpoint
            ? _client
            : new AmazonS3Client(credenciais, Config(options.PublicEndpoint, options));
    }

    private static AmazonS3Config Config(string endpoint, MediaStorageOptions options) => new()
    {
        ServiceURL = endpoint,

        // Enderecar o balde no caminho em vez do host. O padrao do SDK e o
        // contrario, e ele depende de DNS curinga apontando para o servico —
        // que nem todo armazenamento tem, e nenhum precisa.
        ForcePathStyle = options.ForcePathStyle,

        // Sem isto o SDK tenta deduzir a regiao pelo endereco e falha quando
        // ele nao e da Amazon. A regiao entra no calculo da assinatura, entao
        // ela precisa ser dita, nao adivinhada.
        AuthenticationRegion = options.Region,
    };

    public bool IsAvailable => true;

    /// <summary>
    /// Assina um <b>formulario</b>, e nao um endereco solto.
    ///
    /// <para>E a diferenca que faz o teto de tamanho existir. Um endereco assinado
    /// para gravar diz o que gravar e onde, mas <b>nao diz de que tamanho</b> —
    /// quem o obtivesse gravaria um arquivo de qualquer tamanho por ele. O
    /// formulario carrega as regras assinadas junto, e o armazenamento recusa o que
    /// nao couber, antes de gravar.</para>
    /// </summary>
    public async Task<MediaUploadTicket> CreateUploadTicketAsync(
        string objectKey,
        string contentType,
        long maxBytes,
        CancellationToken cancellationToken = default)
    {
        var vencimento = DateTime.UtcNow.Add(_validadeEnvio);

        var pedido = new CreatePresignedPostRequest
        {
            BucketName = _bucket,
            Key = objectKey,
            Expires = vencimento,
        };

        // O tipo vai como campo e como condicao. Como campo, acompanha o arquivo;
        // como condicao, entra na assinatura — sem a segunda, o campo seria so uma
        // sugestao que o navegador reescreve.
        pedido.Fields["Content-Type"] = contentType;
        pedido.Conditions.Add(new ExactMatchCondition("Content-Type", contentType));

        // O teto, que e a razao de este metodo assinar formulario.
        //
        // Comeca em 1 byte, e nao em 0: arquivo vazio nao e print de nada, e
        // deixa-lo passar so encheria o balde de objeto que ninguem consegue abrir.
        pedido.Conditions.Add(new ContentLengthRangeCondition(1, maxBytes));

        var resposta = await _signer.CreatePresignedPostAsync(pedido);

        return new MediaUploadTicket(
            Url: ComEsquemaDoEndereco(resposta.Url),
            Fields: resposta.Fields,
            MaxBytes: maxBytes,
            ExpiresAt: vencimento);
    }

    public async Task<SignedReadUrl> CreateReadUrlAsync(
        string objectKey,
        bool forPlayback = false,
        CancellationToken cancellationToken = default)
    {
        var vencimento = DateTime.UtcNow.Add(forPlayback ? _validadeReproducao : _validadeLeitura);

        var url = await _signer.GetPreSignedURLAsync(new GetPreSignedUrlRequest
        {
            BucketName = _bucket,
            Key = objectKey,
            Verb = HttpVerb.GET,
            Expires = vencimento,
        });

        return new SignedReadUrl(ComEsquemaDoEndereco(url), vencimento);
    }

    public async Task<MediaObjectInfo?> InspectAsync(
        string objectKey,
        int leadingBytes,
        CancellationToken cancellationToken = default)
    {
        // O arquivo trocado entre as duas leituras faz a segunda recusar. Honesto,
        // ninguem troca; quem troca de proposito, sem parar, fica sem conferencia — e
        // sem conferencia o anexo nao entra.
        for (var tentativa = 0; tentativa < 3; tentativa++)
        {
            try
            {
                return await LerAsync(objectKey, leadingBytes, cancellationToken);
            }
            catch (AmazonS3Exception erro) when (erro.StatusCode == HttpStatusCode.NotFound)
            {
                // Nao ha nada naquele endereco, e isso nao e falha: e o caso comum de
                // quem pediu a permissao e desistiu antes de enviar.
                return null;
            }
            catch (AmazonS3Exception erro) when (erro.StatusCode == HttpStatusCode.PreconditionFailed)
            {
            }
        }

        return null;
    }

    /// <summary>
    /// Tamanho, <c>ETag</c> e os primeiros bytes, todos do mesmo conteudo.
    ///
    /// <para><b>Duas chamadas, e nao uma.</b> O tamanho vem dos metadados, que e onde
    /// ele e barato; os bytes vem de uma leitura por faixa, que traz so o comeco. Uma
    /// leitura sozinha traria o tamanho no cabecalho da faixa, mas obrigaria a
    /// interpretar "bytes 0-11/5242880" a mao — e essa string e formatada pelo outro
    /// lado, que varia de provedor para provedor.</para>
    ///
    /// <para><b>A faixa so e lida se o conteudo ainda for o dos metadados</b>
    /// (<c>If-Match</c>). Sem isso, um reenvio entre as duas chamadas juntaria o
    /// tamanho de um arquivo com o comeco de outro.</para>
    /// </summary>
    private async Task<MediaObjectInfo> LerAsync(
        string objectKey,
        int leadingBytes,
        CancellationToken cancellationToken)
    {
        var metadados = await _client.GetObjectMetadataAsync(
            new GetObjectMetadataRequest { BucketName = _bucket, Key = objectKey },
            cancellationToken);

        using var faixa = await _client.GetObjectAsync(
            new GetObjectRequest
            {
                BucketName = _bucket,
                Key = objectKey,
                ByteRange = new ByteRange(0, leadingBytes - 1),
                EtagToMatch = metadados.ETag,
            },
            cancellationToken);

        using var memoria = new MemoryStream();
        await faixa.ResponseStream.CopyToAsync(memoria, cancellationToken);

        return new MediaObjectInfo(
            metadados.ContentLength,
            metadados.Headers.ContentType ?? string.Empty,
            memoria.ToArray(),
            metadados.ETag);
    }

    public async Task<bool> CopyAsync(
        string sourceKey,
        string destinationKey,
        string etag,
        CancellationToken cancellationToken = default)
    {
        try
        {
            // Copia dentro do armazenamento: os bytes nao passam por aqui. O tipo
            // gravado no envio — o que a permissao assinou — vai junto.
            await _client.CopyObjectAsync(
                new CopyObjectRequest
                {
                    SourceBucket = _bucket,
                    SourceKey = sourceKey,
                    DestinationBucket = _bucket,
                    DestinationKey = destinationKey,
                    ETagToMatch = etag,
                },
                cancellationToken);

            return true;
        }
        catch (AmazonS3Exception erro) when (erro.StatusCode is HttpStatusCode.PreconditionFailed
                                                 or HttpStatusCode.NotFound)
        {
            return false;
        }
    }

    public async Task DeleteAsync(string objectKey, CancellationToken cancellationToken = default)
        => await _client.DeleteObjectAsync(
            new DeleteObjectRequest { BucketName = _bucket, Key = objectKey },
            cancellationToken);

    /// <summary>
    /// Devolve a URL assinada com o esquema do endereco configurado.
    ///
    /// <para><b>O SDK assina sempre em HTTPS</b>, mesmo com o endereco configurado
    /// em HTTP, e nao ha ajuste que mude isso: <c>UseHttp</c> vale para as chamadas
    /// de verdade, que saem certas, e nao para a assinatura. Sem esta correcao o
    /// erro so apareceria no navegador de quem relata, na hora do envio.</para>
    ///
    /// <para><b>Trocar o esquema nao quebra a assinatura</b>, e isso nao e sorte: a
    /// assinatura cobre metodo, host, caminho, parametros e cabecalhos — o esquema
    /// nao entra no calculo. Por isso so ele muda aqui, e host e porta ficam
    /// exatamente como foram assinados.</para>
    ///
    /// <para>A porta padrao precisa sumir junto: <c>https://casa/x</c> assina o
    /// cabecalho <c>Host</c> como <c>casa</c>, e virar <c>http://casa:443/x</c>
    /// mandaria <c>casa:443</c>, que e outro host.</para>
    /// </summary>
    private Uri ComEsquemaDoEndereco(string url)
    {
        var assinada = new Uri(url);

        if (assinada.Scheme == _esquema)
            return assinada;

        var construtor = new UriBuilder(assinada) { Scheme = _esquema };

        if (assinada.IsDefaultPort)
            construtor.Port = -1;

        return construtor.Uri;
    }

    public void Dispose()
    {
        _client.Dispose();

        if (!ReferenceEquals(_signer, _client))
            _signer.Dispose();

        GC.SuppressFinalize(this);
    }
}
