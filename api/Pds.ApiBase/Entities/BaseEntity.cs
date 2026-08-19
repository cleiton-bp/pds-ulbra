namespace Pds.ApiBase.Entities;

/// <summary>
/// Entidade base do sistema. Reune as quatro colunas que toda tabela repete
/// (id, created_at, updated_at, deleted_at) mais o identificador publico.
///
/// <para><b>Por que dois identificadores.</b> O <see cref="Id"/> e <c>long</c>
/// porque e ele que aparece em chave estrangeira e indice, e trocar o tipo depois
/// significa alterar toda tabela que referencia, com o sistema no ar. Mas um
/// inteiro sequencial exposto entrega duas coisas de graca: quantos registros
/// existem e quais os vizinhos. Por isso o que sai da aplicacao e o
/// <see cref="PublicId"/>, um GUID aleatorio.</para>
///
/// <para>O GUID e preenchido pelo contexto no momento de gravar, nao por quem
/// cria a entidade — se depender de lembrar, um dia alguem esquece e nasce um
/// registro sem identificador publico.</para>
/// </summary>
public abstract class BaseEntity : IBaseEntity
{
    /// <summary>Chave primaria interna. Nunca aparece em URL, resposta ou log.</summary>
    public long Id { get; set; }

    /// <summary>Identificador publico (GUID aleatorio). E o que aparece em URL e API.</summary>
    public Guid PublicId { get; set; }

    /// <summary>Criacao do registro, em UTC.</summary>
    public DateTime CreatedAt { get; set; }

    /// <summary>Ultima alteracao, em UTC.</summary>
    public DateTime UpdatedAt { get; set; }

    /// <summary>Exclusao logica: nulo enquanto o registro vale.</summary>
    public DateTime? DeletedAt { get; set; }
}
