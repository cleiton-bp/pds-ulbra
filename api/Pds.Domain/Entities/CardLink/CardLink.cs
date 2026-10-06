using Pds.Domain.Enums;

namespace Pds.Domain.Entities;

/// <summary>
/// Um vinculo entre dois cards do mesmo projeto: duplicado de, bloqueia ou
/// relacionado a.
///
/// <para><b>Um por par de cards</b>, em qualquer direcao: trocar o tipo e desfazer e
/// vincular de novo. O banco garante a mesma direcao; a oposta, o servico.</para>
///
/// <para><b>Interno.</b> Nenhuma rota publica le esta tabela: o que o vinculo muda la
/// fora — a etapa e o encerramento do duplicado — e gravado no proprio relato.</para>
/// </summary>
public class CardLink : PdsBaseEntity
{
    /// <summary>O projeto dos dois cards. Repetido aqui para o filtro de acesso nao precisar de juncao.</summary>
    public long ProjectId { get; set; }
    public Project Project { get; set; } = null!;

    /// <summary>O card de origem: o duplicado, o que bloqueia, ou quem vinculou o relacionado.</summary>
    public long FromReportId { get; set; }
    public Report FromReport { get; set; } = null!;

    /// <summary>O card de destino: o original, o bloqueado, ou o relacionado.</summary>
    public long ToReportId { get; set; }
    public Report ToReport { get; set; } = null!;

    public CardLinkTypeEnum Type { get; set; }
}
