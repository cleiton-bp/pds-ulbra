namespace Pds.Domain.Dtos;

/// <summary>
/// Uma ligacao: de um estado de dentro para uma etapa de fora.
/// </summary>
public class StatusMappingEntryDto
{
    /// <summary>O estado de dentro, deste projeto.</summary>
    public Guid StatePublicId { get; set; }

    /// <summary>A etapa de fora, deste projeto.</summary>
    public Guid StagePublicId { get; set; }
}

/// <summary>
/// O mapa inteiro, de uma vez.
///
/// <para><b>Nao ha rota para ligar um estado sozinho</b>, e isso e de proposito:
/// cada gravacao cria uma versao, e uma versao e um retrato do conjunto. Ligar um
/// estado por chamada criaria uma versao por clique, e a linha do tempo de um
/// relato passaria a ser contada por um mapa que existiu por trinta segundos.</para>
/// </summary>
public class SaveStatusMappingDto
{
    /// <summary>
    /// As ligacoes que passam a valer. <b>Estado que nao aparece aqui fica sem
    /// mapeamento</b> — a ausencia e a resposta, e nao uma ligacao apontando para
    /// nada.
    ///
    /// <para>Lista vazia e um pedido valido: e o cliente desfazendo tudo.</para>
    /// </summary>
    public IReadOnlyList<StatusMappingEntryDto>? Entries { get; set; }
}
