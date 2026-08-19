namespace Pds.Shared.Models;

/// <summary>
/// Envelope padrao das respostas.
///
/// Toda resposta tem a mesma forma, com sucesso ou sem: o painel le
/// <c>Success</c> e <c>Message</c> num lugar so, em vez de descobrir o formato do
/// erro a cada rota.
/// </summary>
/// <typeparam name="T">O que a rota devolve em <c>Data</c>.</typeparam>
/// <param name="Success">A operacao deu certo. Sempre presente.</param>
/// <param name="Message">Texto para quem esta usando o sistema. Nulo quando nao ha o que dizer.</param>
/// <param name="Data">O retorno da rota. Nulo quando a operacao falha.</param>
/// <param name="Total">Total de itens. So aparece em listagem.</param>
public record ApiResponse<T>(
    bool Success,
    string? Message,
    T? Data,
    int? Total = null);
