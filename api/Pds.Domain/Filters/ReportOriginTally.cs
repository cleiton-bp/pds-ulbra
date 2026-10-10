namespace Pds.Domain.Filters;

/// <summary>
/// Os relatos de um projeto contados por endereco de origem — o que a tela de
/// Dominios mostra como "quem mandou relatos".
/// </summary>
/// <param name="Origin">O endereco como foi gravado no relato, em minusculo.</param>
/// <param name="Total">Quantos relatos vieram de la, os arquivados inclusive.</param>
/// <param name="NotKept">
/// Deles, quantos o time ainda nao decidiu manter. Se o endereco estiver bloqueado,
/// sao estes os marcados.
/// </param>
/// <param name="LastAt">Quando chegou o ultimo, em UTC.</param>
public record ReportOriginTally(string Origin, int Total, int NotKept, DateTime LastAt);

/// <summary>
/// Os relatos retidos de um projeto contados por endereco — o que "Aguardando
/// liberacao" mostra.
/// </summary>
/// <param name="Origin">O endereco como foi gravado, em minusculo; nulo para o relato que nao disse de onde veio.</param>
/// <param name="Total">Quantos relatos dele estao retidos.</param>
/// <param name="LastAt">Quando chegou o mais novo, em UTC.</param>
public record HeldOriginTally(string? Origin, int Total, DateTime LastAt);

/// <summary>
/// O que apagar de vez um lote de cards levou junto, para quem chamou terminar o
/// servico fora da transacao.
/// </summary>
/// <param name="Reports">Quantos cards sairam, as subtarefas inclusive.</param>
/// <param name="ObjectKeys">
/// Os arquivos dos anexos que sairam, no armazenamento. A linha ja nao existe; o
/// arquivo e apagado depois, por quem chamou — o armazenamento nao entra na transacao
/// do banco.
/// </param>
public record ReportPurge(int Reports, IReadOnlyList<string> ObjectKeys);
