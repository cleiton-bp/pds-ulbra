namespace Pds.WebApi;

public class Program
{
    public static void Main(string[] args)
    {
        // Em desenvolvimento as variaveis vem do Environment/.env.local; em producao,
        // das variaveis reais do ambiente.
        //
        // NoClobber faz a variavel real ter precedencia sobre o arquivo. E o que
        // permite publicar a API com a configuracao do proprio ambiente sem precisar
        // remover o .env.local da imagem.
        var envPath = Path.Combine(Directory.GetCurrentDirectory(), "Environment", ".env.local");
        if (File.Exists(envPath))
            DotNetEnv.Env.NoClobber().Load(envPath);

        CreateHostBuilder(args).Build().Run();
    }

    public static IHostBuilder CreateHostBuilder(string[] args) =>
        Host.CreateDefaultBuilder(args)
            .ConfigureWebHostDefaults(webBuilder =>
            {
                // A convencao do ASP.NET Core seria "wwwroot". Aqui a pasta se chama
                // api-docs porque e exatamente o que ela guarda: o site de
                // documentacao da API. Quem abre o projeto acha sem precisar saber
                // da convencao.
                webBuilder.UseWebRoot("api-docs");
                webBuilder.UseStartup<Startup>();
            });
}
