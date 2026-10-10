using Pds.Domain.Enums;

namespace Pds.Domain.Dtos;

/// <summary>
/// Um tipo de relato novo. Entra no fim da lista; a posicao se ajusta depois.
///
/// <para><b>Os campos anulaveis nao querem dizer "opcional"</b>, como na configuracao
/// da ferramenta: anulavel e o que deixa o servico ver a falta e recusar, em vez de
/// gravar um <c>false</c> que ninguem escolheu. As excecoes estao escritas em cada
/// campo.</para>
/// </summary>
public class CreateProjectReportTypeDto
{
    /// <summary>Como o time chama este tipo. Ate 40 caracteres, unico no projeto.</summary>
    /// <example>Elogio</example>
    public string? Name { get; set; }

    /// <summary>A cor, da paleta fixa. Obrigatoria.</summary>
    /// <example>Pink</example>
    public CardColorEnum? Color { get; set; }

    /// <summary>O desenho, da lista fixa. Obrigatorio.</summary>
    /// <example>Praise</example>
    public ReportTypeIconEnum? Icon { get; set; }

    /// <summary>
    /// As perguntas curtas que o formulario faz, na ordem: de 0 a 4, cada uma ate 120
    /// caracteres, sem repetir. Ausente e nenhuma. A pergunta em branco e descartada.
    /// </summary>
    public List<string?>? Questions { get; set; }

    /// <summary>A caixa livre aparece? Obrigatorio. Sem perguntas, tem de ser verdadeiro.</summary>
    /// <example>true</example>
    public bool? ShowsTextBox { get; set; }

    /// <summary>
    /// O texto cinza dentro da caixa livre, ate 160 caracteres. Obrigatorio quando a
    /// caixa aparece; com ela escondida, e guardado para quando ela voltar.
    /// </summary>
    /// <example>O que funcionou bem para você?</example>
    public string? TextBoxPrompt { get; set; }

    /// <summary>
    /// A coluna em que o relato deste tipo entra — um estado <b>ativo</b> do projeto —,
    /// ou nulo para o padrao: a primeira coluna ativa da fila.
    /// </summary>
    public Guid? InitialStatePublicId { get; set; }
}

/// <summary>
/// O tipo inteiro, gravado de uma vez: nome, cor, desenho, perguntas, caixa e coluna.
///
/// <para><b>Substitui, e nao altera campo a campo</b>, pelo mesmo motivo da
/// configuracao da ferramenta: <see cref="InitialStatePublicId"/> nulo e um valor
/// (a primeira coluna ativa), e num corpo parcial ele seria indistinguivel de "nao
/// mexa na coluna".</para>
/// </summary>
public class UpdateProjectReportTypeDto
{
    /// <summary>
    /// O nome passa a valer de agora em diante: os relatos que ja tem o tipo mostram o
    /// nome novo. O evento da entrada guarda o nome que valia quando o relato chegou.
    /// </summary>
    /// <example>Problema</example>
    public string? Name { get; set; }

    /// <summary>A cor, da paleta fixa. Obrigatoria.</summary>
    /// <example>Red</example>
    public CardColorEnum? Color { get; set; }

    /// <summary>O desenho, da lista fixa. Obrigatorio.</summary>
    /// <example>Bug</example>
    public ReportTypeIconEnum? Icon { get; set; }

    /// <summary>
    /// As perguntas, na ordem: de 0 a 4, cada uma ate 120 caracteres, sem repetir.
    /// Mudar as perguntas nao reescreve os relatos que ja chegaram: cada um guarda as
    /// perguntas como estavam no envio.
    /// </summary>
    public List<string?>? Questions { get; set; }

    /// <summary>A caixa livre aparece? Obrigatorio. Sem perguntas, tem de ser verdadeiro.</summary>
    /// <example>false</example>
    public bool? ShowsTextBox { get; set; }

    /// <summary>
    /// O texto cinza dentro da caixa livre, ate 160 caracteres. Obrigatorio quando a
    /// caixa aparece.
    /// </summary>
    public string? TextBoxPrompt { get; set; }

    /// <summary>
    /// A coluna em que o relato deste tipo entra, ou nulo para a primeira coluna
    /// ativa. Trocar nao mexe nos relatos que ja entraram.
    /// </summary>
    public Guid? InitialStatePublicId { get; set; }
}

/// <summary>A ordem dos tipos, na tela e na ferramenta.</summary>
public class ReorderProjectReportTypesDto
{
    /// <summary>
    /// Os identificadores publicos de <b>todos</b> os tipos do projeto, uma vez cada,
    /// inclusive os desativados.
    /// </summary>
    public List<Guid>? Order { get; set; }
}
