namespace Pds.ApiBase.Attributes;

/// <summary>O que fazer com os filhos quando o pai e excluido logicamente.</summary>
public enum RemoveType
{
    /// <summary>Exclui os filhos junto. Apagar o projeto apaga as chaves dele.</summary>
    Cascade,

    /// <summary>Barra a exclusao do pai enquanto existir filho ativo.</summary>
    Restrict,
}

/// <summary>
/// Marca o campo que aponta para os filhos de uma entidade, dizendo o que fazer
/// com eles quando o pai e excluido logicamente.
///
/// <code>
/// [SoftDeleteDependent(RemoveType.Cascade)]
/// public List&lt;ProjectKey&gt; Keys { get; set; } = [];
/// </code>
///
/// <para>Existe porque o banco nao resolve: <c>ON DELETE CASCADE</c> so dispara num
/// DELETE de verdade, e a nossa exclusao e um UPDATE em <c>deleted_at</c>. Sem
/// isto, excluir um projeto deixaria as chaves dele ativas e apontando para um
/// projeto que ninguem mais enxerga.</para>
///
/// <para>Quem aplica o efeito e o <c>BaseRepository.SoftDeleteAsync</c>. No Entity
/// Framework, um campo desses se chama <i>propriedade de navegacao</i> — campo de
/// uma classe pelo qual se chega as entidades relacionadas.</para>
/// </summary>
[AttributeUsage(AttributeTargets.Property, Inherited = true, AllowMultiple = false)]
public sealed class SoftDeleteDependentAttribute : Attribute
{
    public RemoveType RemoveType { get; }

    public SoftDeleteDependentAttribute(RemoveType removeType)
    {
        RemoveType = removeType;
    }

    public bool IsCascade => RemoveType == RemoveType.Cascade;
    public bool IsRestrict => RemoveType == RemoveType.Restrict;
}
