namespace Pds.Domain.ViewModels;

/// <summary>
/// O relato recem-criado, como a ferramenta o mostra a quem acabou de escrever.
///
/// <para>Sai daqui o minimo: o que a pessoa precisa para voltar. Nada do lado de
/// dentro atravessa — nem o identificador do projeto, nem o da conta.</para>
/// </summary>
/// <param name="TrackingCode">O protocolo, para anotar e repetir.</param>
/// <param name="AccessToken">
/// O que abre o acompanhamento. <b>Devolvido uma unica vez</b>: o banco fica so com
/// o hash, e nenhuma rota consegue revela-lo de novo.
/// </param>
/// <param name="CreatedAt">Quando o relato entrou, em UTC.</param>
public record CreatedReportViewModel(
    string TrackingCode,
    string AccessToken,
    DateTime CreatedAt);
