namespace Pds.Domain.Dtos;

/// <summary>
/// Um comentario interno novo. O relato e o projeto vem da rota.
/// </summary>
public class CreateInternalCommentDto
{
    /// <summary>O texto. Fica entre o time, e nao sai desta tabela.</summary>
    public string? Body { get; set; }
}

/// <summary>
/// Um comentario para quem relatou.
///
/// <para>E um tipo proprio, e nao o mesmo com um campo de visibilidade: um campo
/// seria o sinalizador que as duas tabelas existem para evitar. Quem escreve o
/// corpo da requisicao escolhe a <b>rota</b>, e nao um valor dentro dela.</para>
/// </summary>
public class CreatePublicCommentDto
{
    /// <summary>O texto que quem relatou vai ler.</summary>
    public string? Body { get; set; }
}
