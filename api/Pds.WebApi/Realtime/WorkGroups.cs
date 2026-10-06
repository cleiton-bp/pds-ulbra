namespace Pds.WebApi.Realtime;

/// <summary>
/// O grupo do hub e de um projeto <b>e</b> de uma pessoa, e nao so do projeto: quem manda
/// o aviso le o time de agora e escreve so para os grupos dessas pessoas. Quem saiu do
/// time deixa de receber no aviso seguinte, sem depender de a conexao dele cair.
/// </summary>
public static class WorkGroups
{
    public static string Of(Guid projectPublicId, Guid userPublicId) => $"p:{projectPublicId:N}:u:{userPublicId:N}";
}
