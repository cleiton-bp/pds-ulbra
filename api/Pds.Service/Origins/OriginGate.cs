using Pds.Domain.Constants;
using Pds.Domain.Exceptions;
using Pds.Domain.Interfaces.RepositoryInterfaces;

namespace Pds.Service.Origins;

/// <summary>
/// A porta de endereco das rotas publicas da ferramenta: a configuracao do quadro, a
/// aparencia do botao, a de anexos e a entrada do relato.
///
/// <para><b>Uma porta so</b>, e nao a mesma conferencia copiada em cada servico:
/// quando o bloqueio entrou, cada copia teria de aprender a regra nova — e a que
/// ficasse para tras deixaria o endereco bloqueado abrir o quadro por um caminho e
/// ser recusado no envio por outro.</para>
///
/// <para><b>Duas perguntas, e respostas diferentes.</b> O endereco <b>bloqueado</b> e
/// recusado em todas as rotas, na hora. O que esta <b>fora da lista de autorizados</b>
/// nao e recusado: o botao aparece, o quadro abre e o relato e recebido — mas
/// <b>retido</b> (<see cref="IsHeldAsync"/>), fora do Trabalho ate o time permitir ou
/// bloquear o endereco. Recusar ali faria o endereco novo nunca chegar a ser visto, e
/// o time nunca ficaria sabendo que a ferramenta foi colada num site que ele nao
/// conhece.</para>
///
/// <para><b>Sem cache, de proposito.</b> As listas sao lidas do banco a cada pedido,
/// e e isso que faz o bloqueio e a autorizacao valerem na hora. Sao consultas
/// pequenas, por indice do projeto.</para>
/// </summary>
public static class OriginGate
{
    /// <summary>
    /// A recusa do endereco bloqueado. A mesma em todas as rotas: quem foi barrado
    /// nao precisa saber por qual delas.
    /// </summary>
    public const string BlockedRefusal = "Este endereco foi bloqueado neste projeto.";

    /// <summary>
    /// Os enderecos do proprio painel: o <c>PANEL_URL</c> e as origens do CORS. O relato
    /// que vem dali e o time testando a ferramenta (o relato de teste da Instalacao), e
    /// nunca fica retido. Lidos uma vez: mudam so com a API reiniciando.
    /// </summary>
    private static readonly Lazy<IReadOnlySet<string>> PanelOrigins = new(() =>
    {
        var enderecos = EnvironmentConstants.GetCorsAllowedOrigins()
            .Append(EnvironmentConstants.GetPanelUrl()?.ToString() ?? string.Empty)
            .Select(OriginDomain.ForComparison)
            .Where(endereco => endereco.Length > 0);

        return new HashSet<string>(enderecos, StringComparer.Ordinal);
    });

    /// <summary>
    /// Recusa com 403 o endereco bloqueado. Sem endereco declarado nao ha o que
    /// comparar, e nem se vai ao banco.
    /// </summary>
    /// <param name="unitOfWork">As leituras sao as sem sessao: quem chama e publico.</param>
    /// <param name="projectId">O projeto dono da chave publica.</param>
    /// <param name="origin">O endereco da pagina.</param>
    /// <param name="cancellationToken">Cancelamento da requisicao.</param>
    public static async Task EnsureNotBlockedAsync(
        IUnitOfWork unitOfWork,
        long projectId,
        string? origin,
        CancellationToken cancellationToken)
    {
        if (!OriginAllowList.Declares(origin))
            return;

        var blocked = await unitOfWork.ProjectBlockedOrigins.ListByProjectWithoutSessionAsync(projectId, cancellationToken);

        if (OriginBlockList.Blocks(blocked, origin))
            throw new ForbiddenException(BlockedRefusal);
    }

    /// <summary>
    /// O relato deste endereco fica retido? Sim quando a pagina nao disse de onde veio,
    /// ou quando nenhuma linha da lista de autorizados vale para o endereco — inclusive
    /// com a lista vazia. O endereco do proprio painel nunca e retido. Chamar depois de
    /// <see cref="EnsureNotBlockedAsync"/>: o bloqueado nem chega aqui.
    /// </summary>
    public static async Task<bool> IsHeldAsync(
        IUnitOfWork unitOfWork,
        long projectId,
        string? origin,
        CancellationToken cancellationToken)
    {
        var endereco = OriginDomain.ForComparison(origin);

        if (endereco.Length == 0)
            return true;

        if (PanelOrigins.Value.Contains(endereco))
            return false;

        var origins = await unitOfWork.ProjectOrigins.ListByProjectWithoutSessionAsync(projectId, cancellationToken);

        return !OriginAllowList.Covers(origins, endereco);
    }
}
