namespace Pds.Domain.ViewModels;

/// <summary>
/// Um estado de dentro e para onde ele aponta.
/// </summary>
/// <param name="StatePublicId">Identificador publico do estado interno.</param>
/// <param name="StateName">O nome que o time deu, para a tela nao precisar buscar de novo.</param>
/// <param name="StateIsActive">Falso no estado aposentado, que continua aqui enquanto tiver mapeamento.</param>
/// <param name="StagePublicId">A etapa publica, ou <b>nulo</b> quando o estado nao esta mapeado.</param>
/// <param name="StageLabel">O rotulo da etapa, ou nulo pelo mesmo motivo.</param>
public record StatusMappingEntryViewModel(
    Guid StatePublicId,
    string StateName,
    bool StateIsActive,
    Guid? StagePublicId,
    string? StageLabel);

/// <summary>
/// O mapa que vale agora.
///
/// <para><b>Traz todo estado, mapeado ou nao</b>, pelo mesmo motivo que a escolha
/// de entrada traz os tres tipos: a tela precisa mostrar a pergunta inteira, e nao
/// so as respostas dadas. Estado sem etapa e o caso que importa ver — e nele que o
/// relato para de andar do lado de fora.</para>
/// </summary>
/// <param name="Version">A versao que vale agora. Zero enquanto nada foi ligado.</param>
/// <param name="Entries">Um por estado do projeto, na ordem da fila.</param>
/// <param name="UnmappedCount">Quantos estados ainda nao apontam para lugar nenhum.</param>
public record ProjectStatusMappingViewModel(
    int Version,
    IReadOnlyList<StatusMappingEntryViewModel> Entries,
    int UnmappedCount);
