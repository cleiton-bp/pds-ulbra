using Pds.Domain.Dtos;
using Pds.Domain.ViewModels;

namespace Pds.Domain.Interfaces.ServiceInterfaces;

/// <summary>As regras do ciclo de um projeto: ler e trocar.</summary>
public interface IProjectCycleSettingsService
{
    /// <summary>
    /// Como o ciclo se comporta neste projeto. <b>Nunca devolve vazio</b>: sem
    /// linha salva, vale o padrao de fabrica.
    /// </summary>
    Task<CycleSettingsViewModel> GetAsync(Guid projectPublicId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Troca a configuracao inteira, criando a linha se ela ainda nao existir.
    ///
    /// <para><b>Substitui, e nao mescla.</b> Mesclar faria duas abas abertas
    /// gravarem metades diferentes da mesma configuracao sem ninguem notar.</para>
    /// </summary>
    Task<CycleSettingsViewModel> ReplaceAsync(Guid projectPublicId, CycleSettingsDto dto, CancellationToken cancellationToken = default);
}
