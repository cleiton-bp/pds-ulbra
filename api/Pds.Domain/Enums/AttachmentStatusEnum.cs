namespace Pds.Domain.Enums;

/// <summary>
/// Em que ponto do envio este anexo esta.
///
/// <para><b>Existe porque o arquivo chega antes de a gente saber dele.</b> Ele vai
/// do navegador direto para o armazenamento, sem passar pela API — entao entre
/// assinar a permissao e o arquivo estar de fato la ha um intervalo em que a linha
/// existe e o arquivo talvez nao.</para>
///
/// <para>No banco vira texto em snake_case (pending, confirmed).</para>
/// </summary>
public enum AttachmentStatusEnum
{
    /// <summary>
    /// A permissao foi assinada, e ninguem confirmou que o arquivo chegou.
    ///
    /// <para><b>E o estado normal de quem desistiu, e nao um erro.</b> Gente anexa e
    /// fecha a aba o tempo todo. O que fica assim e permissao nao usada: nao aparece
    /// e nao conta no limite, e o arquivo, se chegou, fica na pasta de envio, que o
    /// armazenamento esvazia sozinho — e e por isso que este estado precisa existir,
    /// para haver como saber o que nunca chegou a ser anexo.</para>
    /// </summary>
    Pending,

    /// <summary>
    /// A nossa API leu os primeiros bytes, conferiu que sao do tipo declarado, e
    /// prendeu o anexo ao relato.
    ///
    /// <para><b>So aqui o anexo comeca a existir para o produto.</b> Antes disto ele
    /// nao aparece no painel nem no acompanhamento, e nao conta no limite do
    /// envio.</para>
    /// </summary>
    Confirmed,
}
