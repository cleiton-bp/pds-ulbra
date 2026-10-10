using Pds.Domain.Dtos;
using Pds.Domain.ViewModels;

namespace Pds.Domain.Interfaces.ServiceInterfaces;

public interface IProjectWidgetSettingsService
{
    /// <summary>
    /// A configuracao de um projeto da conta, para a tela que a edita.
    ///
    /// <para>Projeto sem linha responde com os padroes, e nao com 404: quem nunca
    /// abriu esta tela tem uma ferramenta funcionando, e dizer "nao encontrado"
    /// sobre algo que esta no ar seria mentira.</para>
    /// </summary>
    Task<WidgetSettingsViewModel> GetAsync(Guid projectPublicId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Substitui a configuracao inteira. Cria a linha na primeira vez.
    ///
    /// <para>Substitui, e nao altera campo a campo: <c>AccentColor</c> nulo e um
    /// valor, e num corpo parcial ele nao se distinguiria de campo ausente.</para>
    /// </summary>
    Task<WidgetSettingsViewModel> ReplaceAsync(Guid projectPublicId, WidgetSettingsDto dto, CancellationToken cancellationToken = default);

    /// <summary>
    /// A configuracao que o proprio quadro le, **sem sessao**, apresentando a chave
    /// publica do projeto.
    ///
    /// <para>Projeto arquivado volta com <c>IsEnabled</c> falso, qualquer que seja
    /// o valor gravado: ele recusa relato novo com 403, e abrir um formulario que
    /// nao tem como enviar e pior do que nao abrir nenhum.</para>
    ///
    /// <para><b>O endereco e recusa, e nao campo da resposta.</b> Pagina de um
    /// endereco bloqueado no projeto recebe 403 — e nao a configuracao com
    /// <c>IsEnabled</c> falso, que seria mentira: a ferramenta esta ligada, so nao ali.
    /// O endereco fora da lista de autorizados abre: o relato dele e recebido e fica
    /// retido ate o time decidir.</para>
    /// </summary>
    Task<WidgetSettingsViewModel> GetByPublicKeyAsync(string? key, string? origin, CancellationToken cancellationToken = default);

    /// <summary>
    /// So o que o botao parado no site do cliente precisa, <b>sem sessao</b>: a
    /// aparencia e se a ferramenta esta ligada. As mesmas recusas de
    /// <see cref="GetByPublicKeyAsync"/>, na mesma ordem — chave que nao vale, 401;
    /// endereco bloqueado, 403 —, e projeto arquivado volta desligado.
    ///
    /// <para>Le uma tabela so, e nao as quatro do formulario: o carregador chama esta
    /// em toda visita, e a configuracao inteira so no clique.</para>
    /// </summary>
    Task<WidgetLauncherViewModel> GetLauncherByPublicKeyAsync(string? key, string? origin, CancellationToken cancellationToken = default);
}
