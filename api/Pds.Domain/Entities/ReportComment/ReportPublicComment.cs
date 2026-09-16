namespace Pds.Domain.Entities;

/// <summary>
/// O que o time escolhe dizer a quem relatou.
///
/// <para><b>Ele ainda nao tem leitor.</b> A camada que o relator le vem depois —
/// por enquanto ele e publico no nome, e a tela diz isso com todas as letras em
/// vez de sugerir que a pessoa ja esta vendo. Prometer leitura que nao existe
/// seria pior do que nao ter o campo.</para>
///
/// <para><b>Tabela separada do comentario interno</b>, e nao um campo de
/// visibilidade na mesma. Ver <see cref="ReportInternalComment"/>: com
/// sinalizador, vazar e esquecer um filtro; com tabelas separadas, vazar exige
/// escrever uma consulta que nao existe.</para>
/// </summary>
public class ReportPublicComment : PdsBaseEntity
{
    /// <summary>
    /// Teto do texto. Separado do teto do interno de proposito — este sai para
    /// fora, e pode ganhar regra propria sem arrastar o outro junto.
    /// </summary>
    public const int MaxBodyLength = 5000;

    /// <summary>Relato comentado.</summary>
    public long ReportId { get; set; }
    public Report Report { get; set; } = null!;

    /// <summary>
    /// Quem escreveu, do lado de dentro. Guardado ainda que a camada publica nao
    /// va mostrar o nome: quem respondeu e pergunta interna, e some no dia em que
    /// a pessoa sai da equipe se nao for gravado agora.
    /// </summary>
    public long UserId { get; set; }
    public User User { get; set; } = null!;

    /// <summary>O texto que vai ser lido por quem relatou.</summary>
    public string Body { get; set; } = string.Empty;
}
