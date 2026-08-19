using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Pds.Domain.Constants;
using Pds.Domain.Security;

namespace Pds.Data.Context;

/// <summary>
/// Usada apenas em tempo de projeto, pelo <c>dotnet ef</c>. Carrega o
/// <c>.env.local</c> e monta o contexto com uma conta vazia — migracao nao executa
/// consulta de negocio, entao nao ha o que isolar.
/// </summary>
public class DataContextFactory : IDesignTimeDbContextFactory<DataContext>
{
    public DataContext CreateDbContext(string[] args)
    {
        // Procura o .env.local nos lugares de onde o comando costuma ser chamado:
        // a raiz da solucao, a pasta do Data ou a da WebApi.
        var currentDirectory = Directory.GetCurrentDirectory();
        string[] candidates =
        [
            Path.Combine(currentDirectory, "Environment", ".env.local"),
            Path.Combine(currentDirectory, "Pds.WebApi", "Environment", ".env.local"),
            Path.Combine(currentDirectory, "..", "Pds.WebApi", "Environment", ".env.local"),
        ];

        var envPath = candidates.FirstOrDefault(File.Exists);
        if (envPath is not null)
            DotNetEnv.Env.Load(envPath);

        var optionsBuilder = new DbContextOptionsBuilder<DataContext>();
        optionsBuilder.UseNpgsql(
            EnvironmentConstants.GetDatabaseConnectionString(),
            options => options.MigrationsHistoryTable("__EFMigrationsHistory", "public"));

        return new DataContext(optionsBuilder.Options, new AccountContext());
    }
}
