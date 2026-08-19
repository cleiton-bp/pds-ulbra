namespace Pds.ApiBase.Entities;

/// <summary>
/// Contrato base de toda entidade de dominio.
///
/// Sao dois identificadores de proposito diferente: o <see cref="Id"/> e a chave
/// interna, usada em chave estrangeira e indice, e o <see cref="PublicId"/> e o
/// unico que pode sair da aplicacao. Ver <see cref="BaseEntity"/> para o porque.
/// </summary>
public interface IBaseEntity
{
    /// <summary>Chave primaria interna. Nunca aparece em URL, resposta ou log.</summary>
    long Id { get; set; }

    /// <summary>Identificador publico (GUID aleatorio). E o que aparece em URL e API.</summary>
    Guid PublicId { get; set; }

    /// <summary>Criacao do registro, em UTC.</summary>
    DateTime CreatedAt { get; set; }

    /// <summary>Ultima alteracao, em UTC.</summary>
    DateTime UpdatedAt { get; set; }

    /// <summary>Exclusao logica: nulo enquanto o registro vale.</summary>
    DateTime? DeletedAt { get; set; }
}
