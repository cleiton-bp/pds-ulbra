namespace Pds.Domain.Entities;

/// <summary>
/// Uma resposta de quem relatou, com a pergunta como ela estava no envio.
///
/// <para><b>A pergunta vem copiada, e nao apontada.</b> O time muda as perguntas do
/// tipo quando quiser, e o relato de ontem precisa continuar dizendo o que foi
/// perguntado ontem — a resposta "no celular" so faz sentido ao lado da pergunta que
/// a pediu.</para>
///
/// <para>A caixa livre entra como uma resposta sem pergunta (<see cref="Question"/>
/// nulo), no fim.</para>
/// </summary>
/// <param name="Question">A pergunta, como estava no envio; nula na caixa livre.</param>
/// <param name="Answer">O que a pessoa escreveu. Nunca em branco: a pergunta pulada nao entra.</param>
public sealed record ReportAnswer(string? Question, string Answer);
