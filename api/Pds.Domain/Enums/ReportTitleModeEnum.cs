namespace Pds.Domain.Enums;

/// <summary>
/// Como a ferramenta faz a pergunta do titulo — "Em poucas palavras, o que
/// aconteceu?". A resposta vira o titulo do card no painel.
///
/// No banco vira texto em snake_case (optional, required, hidden).
/// </summary>
public enum ReportTitleModeEnum
{
    /// <summary>Pergunta, e aceita sem resposta. E o padrao.</summary>
    Optional,

    /// <summary>Pergunta, e nao envia sem resposta — e a API recusa sem ela.</summary>
    Required,

    /// <summary>Nao pergunta. O card mostra o comeco do texto, como antes.</summary>
    Hidden,
}
