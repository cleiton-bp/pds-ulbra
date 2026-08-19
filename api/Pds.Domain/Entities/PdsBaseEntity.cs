using Pds.ApiBase.Entities;

namespace Pds.Domain.Entities;

/// <summary>
/// Entidade base do dominio. O contexto usa este tipo para saber onde aplicar o
/// filtro global de exclusao logica, a auditoria de datas e a geracao do
/// identificador publico.
/// </summary>
public abstract class PdsBaseEntity : BaseEntity
{
}
