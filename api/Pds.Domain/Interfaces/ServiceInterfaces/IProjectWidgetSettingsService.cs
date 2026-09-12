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
    /// </summary>
    Task<WidgetSettingsViewModel> GetByPublicKeyAsync(string? key, CancellationToken cancellationToken = default);
}
