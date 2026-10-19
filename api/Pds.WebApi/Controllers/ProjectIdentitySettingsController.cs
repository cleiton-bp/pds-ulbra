using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Pds.Domain.Dtos;
using Pds.Domain.Enums;
using Pds.Domain.Interfaces.ServiceInterfaces;
using Pds.Domain.ViewModels;
using Pds.Shared.Models;
using Pds.WebApi.Authorization;

namespace Pds.WebApi.Controllers;

/// <summary>
/// Como quem abre um relato é identificado neste projeto, e quem pode vê-lo.
///
/// **São três formas, e elas são excludentes.** No modo `Protocol` ninguém é
/// identificado, e quem escreveu volta pelo link. Em `PersonalCode` o sistema
/// sorteia um código que a pessoa guarda. Em `InheritedIdentity` a identidade vem
/// assinada pelo sistema do cliente — um JWT ES256 dedicado, o crachá — e a API a
/// confere com a chave pública dele, sem nunca chamar o sistema do cliente: nós
/// guardamos só a pública.
///
/// **É esta escolha que decide o que a visibilidade pode ser.** Sem identidade não
/// existe "o meu relato" — logo não existe lista pessoal, e não existe a opção "só
/// os meus" para o projeto escolher. Por isso os dois campos vivem na mesma rota e
/// são gravados juntos: `PublicIdentified` só é aceito onde o modo identifica, e a
/// regra é conferida no par, nunca no campo sozinho.
///
/// **Gravar `PublicAnonymous` ou `PublicIdentified` ainda não publica nada.**
/// Nenhuma rota pública lê a visibilidade hoje. A lista pública nasce atrás da fila
/// de moderação, e o relato só aparece nela depois de liberado — a ordem é de
/// segurança, porque o risco do projeto público não é o nome de quem relatou, e sim
/// o documento colado no meio de um parágrafo.
///
/// **Projeto sem configuração salva não é projeto sem configuração.** Ele usa o
/// padrão, e é isso que esta rota devolve — por isso ela nunca responde 404 para um
/// projeto que existe. Mesmo desenho da configuração da ferramenta e do ciclo.
/// </summary>
[Authorize]
[RequireAccount]
[RequireProjectRole(ProjectRoleEnum.Member)]
[Route("projects/{publicId:guid}/identity-settings")]
[Produces("application/json")]
[Tags(SwaggerTags.IdentitySettings)]
public class ProjectIdentitySettingsController : BaseController
{
    private readonly IProjectIdentitySettingsService _identitySettingsService;

    public ProjectIdentitySettingsController(IProjectIdentitySettingsService identitySettingsService)
    {
        _identitySettingsService = identitySettingsService;
    }

    /// <summary>O modo de identificação e a visibilidade deste projeto.</summary>
    /// <remarks>
    /// Quem nunca abriu a tela recebe os **padrões** — `Protocol` e `Private` —, e não uma
    /// resposta vazia: o projeto dele já se comporta desse jeito, e dizer "não
    /// encontrado" sobre algo que está funcionando seria mentira.
    ///
    /// **Vem também o que o modo herdado precisa.** `IdentityPublicKey` é a chave
    /// pública do sistema do cliente — ECDSA P-256, SPKI em base64 numa linha —, ou
    /// nula enquanto ninguém colou uma; `IdentityTokenMaxMinutes` é por quantos
    /// minutos, no máximo, um crachá pode valer (1 a 60; 15 de fábrica); e
    /// `IdentityRequired` diz se o relato sem crachá é recusado (falso de fábrica: ele
    /// entra como protocolo, sem identidade). A chave volta inteira mesmo fora do modo
    /// herdado — ela fica guardada ao trocar de modo, e é pública, nunca segredo.
    ///
    /// **O sal nunca sai.** O sal com que o `sub` do crachá vira o hash da pessoa
    /// nasce com a primeira chave e não muda, e nenhuma resposta o devolve.
    /// </remarks>
    /// <param name="publicId">Identificador público do projeto.</param>
    /// <param name="cancellationToken"></param>
    /// <response code="200">O modo, a visibilidade, se pergunta o nome, a chave pública do sistema do cliente, a validade máxima do crachá e se ele é exigido — salvos ou padrão. Nunca o sal.</response>
    /// <response code="404">Projeto não existe, ou a pessoa não está no projeto.</response>
    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<IdentitySettingsViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Get(Guid publicId, CancellationToken cancellationToken)
    {
        try
        {
            var settings = await _identitySettingsService.GetAsync(publicId, cancellationToken);
            return Success(settings);
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Substitui o modo de identificação e a visibilidade.</summary>
    /// <remarks>
    /// **Trocar de modo não reescreve o passado.** O relato que entrou sob outro
    /// modo continua como entrou, e continua abrindo pelo link — o modo decide o que
    /// acontece daqui para frente. Sem essa garantia, mudar a configuração tornaria
    /// ilegível o que já existia, e quem tinha o link perderia o relato por uma
    /// decisão que não foi dele.
    ///
    /// **Modo, visibilidade e a pergunta do nome são obrigatórios, e não assumem o
    /// padrão quando faltam.** Assumir faria uma requisição incompleta trocar o modo do
    /// projeto sem ninguém ter escolhido — e um projeto que identificava passaria a não
    /// identificar, em silêncio. Com a visibilidade, o silêncio seria pior: um projeto
    /// público voltaria a privado, ou o contrário, sem ninguém ter pedido.
    ///
    /// **`PublicIdentified` com `Protocol` é recusado**, e nos dois sentidos: tanto
    /// escolher o nível num projeto sem identidade quanto voltar ao protocolo com o
    /// nível já gravado. Sem identidade não há o que mostrar, e o nível seria o
    /// anônimo com outro nome. Os dois modos que identificam servem, e a recusa diz a
    /// saída: "Publico identificado exige um projeto que identifique quem relata.
    /// Escolha o codigo pessoal ou a identidade do seu sistema, ou publique como
    /// anonimo."
    ///
    /// **O modo herdado pede a chave pública do sistema do cliente.** `IdentityPublicKey`
    /// aceita o SPKI em base64 numa linha ou o PEM colado, e guarda a forma limpa. Em
    /// `InheritedIdentity`, sem ela a API não conferiria crachá nenhum, e a gravação é
    /// recusada: "Informe a chave publica do seu sistema." Sempre que vier, em qualquer
    /// modo, ela precisa ser ECDSA P-256 — senão, "A chave publica precisa ser ECDSA
    /// P-256, no formato SPKI em base64 ou PEM." — e caber em 512 depois de limpa: "A
    /// chave publica e grande demais."
    ///
    /// **A chave fica guardada ao trocar de modo.** Fora de `InheritedIdentity` ela não
    /// é descartada: quem volta ao modo herdado não cola tudo de novo. A gravação
    /// continua sendo da configuração inteira, então a chave que vier no corpo é a que
    /// fica — e o painel a manda de volta em toda gravação. O sal da pessoa nasce com a
    /// primeira chave gravada, nunca muda, e nunca aparece na resposta.
    ///
    /// **`IdentityTokenMaxMinutes` fica entre 1 e 60**, e fora disso é recusado: "A
    /// validade do token precisa ficar entre 1 e 60 minutos." Ausente, vale 15.
    /// `IdentityRequired` ausente vale falso: o relato sem crachá entra como protocolo,
    /// sem identidade; ligado, é recusado e a pessoa é mandada entrar na conta.
    /// </remarks>
    /// <param name="publicId">Identificador público do projeto.</param>
    /// <param name="dto">O modo e a visibilidade escolhidos.</param>
    /// <param name="cancellationToken"></param>
    /// <response code="200">Configuração salva.</response>
    /// <response code="400">Campo ausente, desconhecido, ou a combinação que a regra não permite; a chave do sistema do cliente que falta no modo herdado, que não é ECDSA P-256 ou que é grande demais; a validade do crachá fora de 1 a 60.</response>
    /// <response code="403">A pessoa está no projeto, mas só administradores mudam isto.</response>
    /// <response code="404">Projeto não existe, ou a pessoa não está no projeto.</response>
    [RequireProjectRole(ProjectRoleEnum.Administrator)]
    [HttpPut]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(ApiResponse<IdentitySettingsViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Replace(Guid publicId, [FromBody] IdentitySettingsDto dto, CancellationToken cancellationToken)
    {
        try
        {
            var settings = await _identitySettingsService.ReplaceAsync(publicId, dto, cancellationToken);
            return Success(settings, "Identidade e visibilidade salvas.");
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }
}
