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
/// Os projetos que a pessoa da sessão enxerga: todos os da conta própria, como
/// dona, e os de outras contas em que entrou pelo time, com o papel de cada um.
///
/// Toda rota usa o identificador público na URL: o id interno não aparece em rota
/// nem em resposta. Projeto em que a pessoa não está responde 404, e não 403 —
/// dizer "existe, mas não é seu" já é contar que existe. O 403 fica para quem
/// está no projeto e não tem o papel.
/// </summary>
[Authorize]
[RequireAccount]
[Route("projects")]
[Produces("application/json")]
[Tags(SwaggerTags.Projects)]
public class ProjectsController : BaseController
{
    private readonly IProjectService _projectService;

    public ProjectsController(IProjectService projectService)
    {
        _projectService = projectService;
    }

    /// <summary>Cria o projeto, com a chave pública e o modelo escolhido.</summary>
    /// <remarks>
    /// Numa única gravação — ou entra tudo, ou não entra nada — o projeto nasce com:
    ///
    /// - a **chave pública**, que vai no script do site;
    /// - as **colunas** e o **andamento público** do modelo, já ligados (a versão 1
    ///   do mapa); a última coluna é a que encerra o relato, pela regra de fábrica
    ///   do ciclo;
    /// - os **tipos de relato** do modelo, cada um com a coluna em que entra;
    /// - as prioridades de fábrica (Baixa, Média, Alta, Urgente), em todo modelo.
    ///
    /// `Template` é opcional; sem ele vale `SimpleBoard`, o projeto de sempre:
    ///
    /// - `SimpleBoard`: A fazer → Recebido, Fazendo → Em desenvolvimento, Feito →
    ///   Concluído; tipos Defeito, Melhoria e Dúvida, entrando na primeira coluna;
    /// - `Support`: Novo → Recebido, Em atendimento → Em atendimento (pode voltar),
    ///   Aguardando quem relatou → Esperando você (esperando quem relatou),
    ///   Resolvido → Resolvido; tipos Problema, Dúvida e Pedido, entrando em Novo;
    /// - `Kanban`: Backlog → Recebido, A fazer → Em análise, Fazendo → Em
    ///   desenvolvimento, Em revisão → Em teste pela equipe, Feito → Concluído; os
    ///   tipos de fábrica, entrando no Backlog;
    /// - `Scrum`: A fazer → Recebido, Fazendo → Em desenvolvimento, Em revisão → Em
    ///   teste pela equipe, Feito → Concluído; os tipos de fábrica; sprints ligadas,
    ///   de duas semanas, com pontos no card.
    ///
    /// O modelo só vale na criação: depois, cada coisa se muda na própria tela. A
    /// escolha fica no evento `project_created`, sem o nome do projeto.
    ///
    /// **A chave secreta não nasce aqui.** Ela é gerada sob pedido, em
    /// `POST /projects/{publicId}/keys/secret`, e o valor aparece só
    /// naquela resposta.
    ///
    /// O projeto nasce sempre na **conta própria** de quem cria, e quem cria é dono
    /// dele. Estar no time de projetos de outra conta não deixa criar projeto lá.
    ///
    /// O nome é único dentro da conta, sem diferenciar maiúscula.
    /// </remarks>
    /// <response code="200">Projeto criado, com a chave pública.</response>
    /// <response code="400">Nome não informado, ou modelo desconhecido.</response>
    /// <response code="409">Já existe projeto com este nome na conta.</response>
    [HttpPost]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(ApiResponse<ProjectCreatedViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Create([FromBody] CreateProjectDto dto, CancellationToken cancellationToken)
    {
        try
        {
            var created = await _projectService.CreateAsync(dto, cancellationToken);
            return Success(created, "Projeto criado.");
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Lista os projetos que a pessoa enxerga.</summary>
    /// <remarks>
    /// Todos os da conta própria e os de outras contas em que ela entrou pelo time,
    /// do mais recente para o mais antigo, incluindo os arquivados. Cada um vem com
    /// a conta dona (`Account`), o papel da pessoa nele (`Role`) e se ela é a dona
    /// da conta (`IsAccountOwner`) — é o que o painel usa para agrupar e para
    /// esconder a configuração de quem é só membro. E com o movimento:
    /// `LastReportReceivedAt` (o último relato que chegou pela ferramenta; nulo
    /// enquanto o site não mandou nenhum) e `LastActivityAt` (a última mudança em
    /// qualquer card). O campo `Total` traz a contagem.
    /// </remarks>
    /// <response code="200">Projetos que a pessoa enxerga.</response>
    [HttpGet]
    [ProducesResponseType(typeof(ApiResponse<IReadOnlyList<ProjectViewModel>>), StatusCodes.Status200OK)]
    public async Task<IActionResult> List(CancellationToken cancellationToken)
    {
        try
        {
            var projects = await _projectService.ListAsync(cancellationToken);
            return Success(projects, total: projects.Count);
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Detalhe de um projeto.</summary>
    /// <param name="publicId">Identificador público do projeto.</param>
    /// <param name="cancellationToken"></param>
    /// <response code="200">Projeto encontrado.</response>
    /// <response code="404">Não existe, ou a pessoa não está nele.</response>
    [RequireProjectRole(ProjectRoleEnum.Member)]
    [HttpGet("{publicId:guid}")]
    [ProducesResponseType(typeof(ApiResponse<ProjectViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Get(Guid publicId, CancellationToken cancellationToken)
    {
        try
        {
            return Success(await _projectService.GetAsync(publicId, cancellationToken));
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }

    /// <summary>Renomeia e/ou arquiva o projeto.</summary>
    /// <remarks>
    /// O que não vier no corpo fica como está — é um PATCH, não uma substituição.
    ///
    /// Arquivar não apaga nada: o projeto continua visível e consultável, só para de
    /// aceitar coisa nova.
    /// </remarks>
    /// <param name="publicId">Identificador público do projeto.</param>
    /// <param name="dto">Campos a alterar. Ambos opcionais.</param>
    /// <param name="cancellationToken"></param>
    /// <response code="200">Projeto atualizado.</response>
    /// <response code="400">Nome informado em branco.</response>
    /// <response code="403">A pessoa está no projeto, mas só administradores mudam isto.</response>
    /// <response code="404">Não existe, ou a pessoa não está nele.</response>
    /// <response code="409">Já existe projeto com este nome na conta.</response>
    [RequireProjectRole(ProjectRoleEnum.Administrator)]
    [HttpPatch("{publicId:guid}")]
    [Consumes("application/json")]
    [ProducesResponseType(typeof(ApiResponse<ProjectViewModel>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status404NotFound)]
    [ProducesResponseType(typeof(ApiResponse<object>), StatusCodes.Status409Conflict)]
    public async Task<IActionResult> Update(Guid publicId, [FromBody] UpdateProjectDto dto, CancellationToken cancellationToken)
    {
        try
        {
            var project = await _projectService.UpdateAsync(publicId, dto, cancellationToken);
            return Success(project, "Projeto atualizado.");
        }
        catch (Exception exception)
        {
            return HandleError(exception);
        }
    }
}
