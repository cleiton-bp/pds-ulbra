namespace Pds.Domain.Entities;

/// <summary>
/// O que o time escolhe dizer a quem relatou.
///
/// <para><b>Agora ele tem leitor, e tem autor dos dois lados.</b> A pagina de
/// acompanhamento mostra esta lista, e quem relatou escreve nela — e e por isso
/// que <see cref="UserId"/> passou a ser anulavel. A tabela deixou de ser "o que o
/// time diz" e virou a conversa.</para>
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
    ///
    /// <para><b>Nulo quer dizer que quem escreveu foi quem relatou.</b> E o que faz
    /// desta tabela a conversa dos dois lados, e nao so o recado de um deles — e e
    /// o que "a conversa acontece pelo proprio relato" significa na pratica. Quem
    /// esta de fora nao tem usuario aqui, e inventar um seria criar identidade para
    /// alguem que nunca se cadastrou.</para>
    ///
    /// <para><b>Uma tabela, e nao duas.</b> Separar a resposta do relator obrigaria
    /// toda tela a costurar duas listas para mostrar um dialogo em ordem — e a
    /// ordem e o que faz um dialogo ser lido como dialogo. A separacao que importa
    /// neste sistema e outra: a que existe entre publico e interno, e essa
    /// continua sendo duas tabelas.</para>
    /// </summary>
    public long? UserId { get; set; }
    public User? User { get; set; }

    /// <summary>O texto que vai ser lido por quem relatou.</summary>
    public string Body { get; set; } = string.Empty;
}
