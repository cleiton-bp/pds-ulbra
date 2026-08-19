using Microsoft.Extensions.DependencyInjection;

namespace Pds.ApiBase.Extensions;

/// <summary>Ponto de registro do que for generico do ApiBase.</summary>
public static class ServiceCollectionExtensions
{
    /// <summary>
    /// Hoje nao ha nada generico para registrar: o Unit of Work concreto depende do
    /// DbContext da aplicacao e e registrado em Pds.Shared. O metodo existe para
    /// manter o ponto de extensao no lugar de espalhar registro por camada.
    /// </summary>
    public static IServiceCollection AddApiBase(this IServiceCollection services) => services;
}
