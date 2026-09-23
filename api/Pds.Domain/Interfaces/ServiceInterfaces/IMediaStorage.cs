namespace Pds.Domain.Interfaces.ServiceInterfaces;

/// <summary>
/// A permissao de gravar <b>um</b> arquivo, com as regras dentro dela.
///
/// <para><b>Nao e so um endereco.</b> As regras — que arquivo, de que tipo, de que
/// tamanho — viajam assinadas junto, e por isso o navegador nao consegue muda-las:
/// mexer em qualquer campo invalida a assinatura, e o armazenamento recusa antes
/// de gravar.</para>
/// </summary>
/// <param name="Url">Para onde o formulario e enviado.</param>
/// <param name="Fields">Campos que acompanham o arquivo, incluindo a assinatura.</param>
/// <param name="MaxBytes">Teto de tamanho que o armazenamento vai cobrar.</param>
/// <param name="ExpiresAt">Quando esta permissao deixa de valer.</param>
public record MediaUploadTicket(
    Uri Url,
    IReadOnlyDictionary<string, string> Fields,
    long MaxBytes,
    DateTime ExpiresAt);

/// <summary>
/// Uma permissao de leitura, e quando ela deixa de valer.
///
/// <para><b>O vencimento viaja junto</b> para quem mostra a midia saber quando pedir
/// outra — em vez de descobrir pela imagem quebrada. Link vencido tratado na tela,
/// e nao deixado quebrar em silencio.</para>
/// </summary>
/// <param name="Url">O endereco assinado.</param>
/// <param name="ExpiresAt">Quando ele deixa de servir, em UTC.</param>
public record SignedReadUrl(Uri Url, DateTime ExpiresAt);

/// <summary>
/// O que o armazenamento sabe sobre um arquivo que ja esta la.
///
/// <para><b>Os primeiros bytes vem junto, e sao poucos de proposito.</b> Doze bytes
/// bastam para reconhecer os formatos que aceitamos, e baixar o arquivo inteiro
/// para olhar o comeco dele custaria a banda de todos os envios do sistema.</para>
/// </summary>
/// <param name="SizeBytes">Tamanho real, como o armazenamento o conta.</param>
/// <param name="ContentType">Tipo declarado, gravado no objeto.</param>
/// <param name="Leading">Os primeiros bytes do arquivo.</param>
public record MediaObjectInfo(long SizeBytes, string ContentType, byte[] Leading);

/// <summary>
/// Onde a midia de um relato fica guardada.
///
/// <para><b>Mora no dominio como interface, e a implementacao mora longe.</b> O
/// servico que trata do relato nao pode conhecer provedor de armazenamento: no dia
/// em que o arquivo mudar de casa, o que decide regra nao pode mudar junto.</para>
///
/// <para><b>O arquivo nunca passa por aqui.</b> Nenhum metodo recebe ou devolve
/// bytes, e isso e de proposito: quem carrega o arquivo e o navegador, falando
/// direto com o armazenamento. O que esta interface faz e <b>assinar</b> uma
/// permissao de curta duracao. Passar o arquivo pela API significaria carregar
/// megabytes na memoria do servidor duas vezes, sem ganhar nada.</para>
///
/// <para><b>Tudo que nao e o arquivo passa pela API, e isso e a regra.</b> Pedir a
/// permissao, decidir se aquela pessoa pode, aplicar os limites do projeto, contar
/// tentativa e gravar que o anexo existe — cada um desses passos e uma chamada
/// nossa. O unico trecho que nao atravessa a API e o fluxo de bytes, e ele viaja
/// sob regras que a API assinou.</para>
///
/// <para><b>Ela nao sabe quem pode ver o que.</b> Assinar e o ultimo passo, nunca o
/// primeiro: quem chama ja conferiu que aquela pessoa alcanca aquele relato. Uma
/// assinatura e uma autorizacao em forma de texto, e gerar antes de conferir seria
/// entregar a chave e perguntar depois.</para>
///
/// <para><b>Quanto tempo a permissao vale nao e escolha de quem chama.</b> Vem da
/// configuracao do ambiente, e nao de um parametro: prazo e decisao de seguranca, e
/// deixa-lo na mao de cada chamador seria esperar que ninguem, nunca, passe um
/// numero grande demais por engano.</para>
/// </summary>
public interface IMediaStorage
{
    /// <summary>
    /// Ha armazenamento configurado.
    ///
    /// <para>Falso e o estado de quem nunca configurou nada, e nao um erro. Quem le
    /// isto e a configuracao de midia do projeto, para <b>recusar</b> ligar anexo
    /// que nao teria onde cair — oferecer o botao e falhar no envio seria pior do
    /// que nao oferecer. Mesma forma do agendador sem fila.</para>
    /// </summary>
    bool IsAvailable { get; }

    /// <summary>
    /// Assina uma permissao para o navegador <b>gravar</b> um arquivo.
    ///
    /// <para><b>O teto de tamanho vai dentro da assinatura</b>, e e o armazenamento
    /// que o cobra. Nao ha como conferir tamanho de outro jeito: no widget nao vale,
    /// porque ele roda no navegador de quem relata e qualquer um o inspeciona; no
    /// servidor tambem nao, porque o arquivo nunca passa por la — quando desse para
    /// medir, ele ja estaria gravado. Sem esta trava, quem obtivesse uma permissao
    /// gravaria um arquivo de qualquer tamanho, e a conta seria nossa.</para>
    ///
    /// <para>O <paramref name="contentType"/> tambem entra: sem ele, uma permissao
    /// pedida para uma imagem serviria para gravar qualquer coisa ali.</para>
    /// </summary>
    /// <param name="objectKey">Nome do arquivo no armazenamento.</param>
    /// <param name="contentType">Tipo exato que sera aceito.</param>
    /// <param name="maxBytes">Teto de tamanho, vindo do limite do projeto.</param>
    /// <param name="cancellationToken">Cancelamento da requisicao em curso.</param>
    Task<MediaUploadTicket> CreateUploadTicketAsync(
        string objectKey,
        string contentType,
        long maxBytes,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Assina uma permissao para <b>ler</b> um arquivo.
    ///
    /// <para><b>Gerada sob demanda, toda vez.</b> Nao se guarda o endereco assinado
    /// em lugar nenhum: guardado, ele vira um link permanente com outro nome, e a
    /// validade curta deixa de significar qualquer coisa.</para>
    ///
    /// <para><b>Para tocar, vale mais.</b> Um video e lido em pedacos enquanto toca,
    /// e cada pedaco confere a assinatura de novo — com a validade da imagem, pausar
    /// e voltar depois quebraria a reproducao no meio. Quem decide se e para tocar e
    /// quem chama, porque o armazenamento nao sabe o que e um video.</para>
    /// </summary>
    /// <param name="objectKey">Nome do arquivo no armazenamento.</param>
    /// <param name="forPlayback">A leitura e de algo que toca, e precisa de mais tempo.</param>
    /// <param name="cancellationToken">Cancelamento da requisicao em curso.</param>
    Task<SignedReadUrl> CreateReadUrlAsync(
        string objectKey,
        bool forPlayback = false,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// O que ha naquele endereco, ou <b>nulo</b> se nao ha nada.
    ///
    /// <para><b>E a unica operacao desta interface que olha para dentro do arquivo</b>,
    /// e ela existe por um motivo so: a assinatura garante o rotulo, e nao o
    /// conteudo. Nada impede quem enviou de pos bytes de qualquer coisa num objeto
    /// marcado como imagem — o rotulo e assinado, os bytes nao.</para>
    ///
    /// <para><b>O tamanho que importa e o que vem daqui</b>, e nao o que o navegador
    /// disse. O numero que vem de fora serve para recusar cedo; o que fica gravado
    /// precisa ser o real, porque e ele que a cobranca um dia vai somar.</para>
    ///
    /// <para>Nulo e o caso comum de quem desistiu no meio: a permissao foi assinada
    /// e o arquivo nunca chegou.</para>
    /// </summary>
    /// <param name="objectKey">Nome do arquivo no armazenamento.</param>
    /// <param name="leadingBytes">Quantos bytes do comeco trazer.</param>
    /// <param name="cancellationToken">Cancelamento da requisicao em curso.</param>
    Task<MediaObjectInfo?> InspectAsync(
        string objectKey,
        int leadingBytes,
        CancellationToken cancellationToken = default);

    /// <summary>
    /// Apaga o arquivo de verdade.
    ///
    /// <para><b>Aqui a exclusao e fisica, e no resto do produto e logica.</b> Conta
    /// de armazenamento cobra pelo que esta la, e nao pelo que a aplicacao resolveu
    /// ignorar numa consulta.</para>
    ///
    /// <para><b>Nada chama isto ainda, e e decisao.</b> Ficou definido que nada e
    /// apagado por prazo durante o desenvolvimento: no comeco so uma pessoa usa, e
    /// apagar midia no meio de um relato aberto seria pior que o custo de guardar.
    /// O metodo existe porque e a terceira operacao que define um armazenamento —
    /// deixa-lo de fora faria a proxima pessoa achar que apagar mora noutro
    /// lugar.</para>
    ///
    /// <para>Apagar o que nao existe nao e erro: o pedido e sobre o estado final, e
    /// nao sobre o que havia antes.</para>
    /// </summary>
    Task DeleteAsync(string objectKey, CancellationToken cancellationToken = default);
}
