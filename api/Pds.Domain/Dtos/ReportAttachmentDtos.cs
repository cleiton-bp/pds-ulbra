using Pds.Domain.Enums;

namespace Pds.Domain.Dtos;

/// <summary>
/// O pedido de permissao para gravar um arquivo.
///
/// <para><b>O protocolo e o token vem junto, e nao sao formalidade.</b> Sao eles que
/// dizem de quem e o relato — assinar permissao para quem nao tem relato nenhum
/// seria assinar para qualquer um, e essa e a unica rota publica do sistema que
/// gera custo em dinheiro.</para>
/// </summary>
public class RequestAttachmentUploadDto
{
    /// <summary>O protocolo do relato.</summary>
    /// <example>7K2M-9QXP-4TRV</example>
    public string? TrackingCode { get; set; }

    /// <summary>O token que saiu junto do protocolo, na criacao.</summary>
    public string? Token { get; set; }

    /// <summary>Imagem ou video.</summary>
    /// <example>Image</example>
    public MediaKindEnum? Kind { get; set; }

    /// <summary>O tipo do arquivo, que vai entrar na assinatura.</summary>
    /// <example>image/png</example>
    public string? ContentType { get; set; }

    /// <summary>
    /// Tamanho que o navegador diz ter o arquivo.
    ///
    /// <para><b>Serve para recusar cedo, e nao para gravar.</b> O que fica gravado e
    /// o que o armazenamento contar na confirmacao — este numero vem de fora.</para>
    /// </summary>
    /// <example>524288</example>
    public long? SizeBytes { get; set; }

    /// <summary>Nome do arquivo na maquina de quem relata. Guardado para o time, nunca mostrado fora.</summary>
    /// <example>erro-no-pagamento.png</example>
    public string? FileName { get; set; }

    /// <summary>Duracao, so para o que tem duracao.</summary>
    /// <example>42</example>
    public int? DurationSeconds { get; set; }

    /// <summary>
    /// Ha miniatura para enviar junto.
    ///
    /// <para>Ela e feita no proprio navegador antes do envio, e por isso precisa de
    /// permissao propria — vai para outro endereco, e e outro arquivo.</para>
    /// </summary>
    /// <example>true</example>
    public bool? WithThumbnail { get; set; }

    /// <summary>
    /// O arquivo vai junto da <b>resposta</b> que a pessoa acabou de mandar, e nao da
    /// criacao do relato.
    ///
    /// <para><b>Nao diz qual resposta, e e de proposito.</b> O servidor prende o
    /// arquivo a resposta mais recente de quem relatou, se ela for dos ultimos
    /// minutos. Aceitar um identificador vindo de fora obrigaria a conferir de quem
    /// ele e — e cada conferencia a mais e uma chance de esquecer uma.</para>
    /// </summary>
    /// <example>false</example>
    public bool? ForReply { get; set; }
}

/// <summary>
/// O aviso de que o arquivo chegou ao armazenamento.
///
/// <para><b>Sem ele o anexo nao existe para o produto.</b> E aqui que a nossa API
/// le os primeiros bytes, confere que sao do tipo declarado, e prende o anexo ao
/// relato — a assinatura do envio garante o rotulo, nunca o conteudo.</para>
/// </summary>
public class ConfirmAttachmentDto
{
    /// <summary>O protocolo do relato.</summary>
    /// <example>7K2M-9QXP-4TRV</example>
    public string? TrackingCode { get; set; }

    /// <summary>O token que saiu junto do protocolo, na criacao.</summary>
    public string? Token { get; set; }

    /// <summary>O identificador que veio junto da permissao.</summary>
    public Guid? AttachmentPublicId { get; set; }
}
