using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Pds.Data.Context;
using Pds.Domain.Security;
using Pds.Service.Services;
using Pds.WebApi.Authorization;

namespace Pds.WebApi.Realtime;

/// <summary>
/// A conexao em tempo real da tela de Trabalho.
///
/// <para><b>So escuta.</b> O painel entra num projeto (<see cref="Watch"/>) e passa a
/// receber os avisos dele — <c>CardChanged</c>, <c>ProjectChanged</c>, <c>AccessLost</c>.
/// Toda mudanca continua indo pela REST: o hub nao grava nada.</para>
///
/// <para><b>Abre com o bilhete, e nao com a sessao</b> (<see cref="RealtimeTicket"/>).
/// O acesso ao projeto e conferido ao entrar, com a mesma leitura do middleware de
/// acesso — e de novo a cada aviso, por quem manda (<see cref="HubWorkNotifier"/>).</para>
/// </summary>
[Authorize(AuthenticationSchemes = RealtimeTicket.Scheme)]
public class WorkHub : Hub
{
    private const string GrupoAtual = "grupo";

    private readonly DataContext _dataContext;
    private readonly RealtimeConnections _conexoes;

    public WorkHub(DataContext dataContext, RealtimeConnections conexoes)
    {
        _dataContext = dataContext;
        _conexoes = conexoes;
    }

    /// <summary>
    /// Guarda a conexao com o que e preciso para fecha-la quando a sessao acabar
    /// (<see cref="RealtimeSessionSweeper"/>). Bilhete sem esses dados (emitido antes desta
    /// regra), ou de sessao ja vencida, fecha na hora: o painel pede outro, e o pedido diz se
    /// a sessao ainda vale.
    /// </summary>
    public override async Task OnConnectedAsync()
    {
        var usuario = Context.User;
        if (!Guid.TryParse(usuario?.FindFirst(TokenService.UserClaim)?.Value, out var pessoa)
            || !long.TryParse(usuario?.FindFirst(RealtimeTicket.SessionIssuedClaim)?.Value, out var sessaoEmitida)
            || !long.TryParse(usuario?.FindFirst(RealtimeTicket.SessionExpiresClaim)?.Value, out var sessaoVence)
            || RealtimeConnections.Expired(sessaoVence, DateTimeOffset.UtcNow.ToUnixTimeSeconds()))
        {
            Context.Abort();
            return;
        }

        _conexoes.Add(new RealtimeConnections.Open(Context, pessoa, sessaoEmitida, sessaoVence));
        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        _conexoes.Remove(Context.ConnectionId);
        await base.OnDisconnectedAsync(exception);
    }

    /// <summary>
    /// Passa a receber os avisos do projeto. Devolve falso quando a pessoa nao esta
    /// nele — e ai nao recebe nada. Uma conexao acompanha um projeto por vez: a tela
    /// de Trabalho e de um projeto so.
    /// </summary>
    public async Task<bool> Watch(Guid projectPublicId)
    {
        await Unwatch();

        if (!Guid.TryParse(Context.User?.FindFirst(TokenService.UserClaim)?.Value, out var pessoa))
            return false;

        var acesso = await AccountMiddleware.LoadAccessAsync(_dataContext, pessoa, Context.ConnectionAborted);

        if (acesso is null || acesso.Projects.All(projeto => projeto.ProjectPublicId != projectPublicId))
            return false;

        // A mesma regra da varredura, na entrada: sem isto, um bilhete emitido no mesmo
        // segundo do "sair" reabria a conexao e voltava a receber ate a proxima volta.
        if (SessionEnded(acesso.SessionsRevokedAt))
        {
            Context.Abort();
            return false;
        }

        var grupo = WorkGroups.Of(projectPublicId, pessoa);
        await Groups.AddToGroupAsync(Context.ConnectionId, grupo, Context.ConnectionAborted);
        Context.Items[GrupoAtual] = grupo;
        return true;
    }

    /// <summary>Se a sessao que pediu o bilhete venceu, ou se a pessoa saiu depois de ela ser emitida.</summary>
    private bool SessionEnded(DateTime? saiuEm)
    {
        var usuario = Context.User;
        if (!long.TryParse(usuario?.FindFirst(RealtimeTicket.SessionIssuedClaim)?.Value, out var sessaoEmitida)
            || !long.TryParse(usuario?.FindFirst(RealtimeTicket.SessionExpiresClaim)?.Value, out var sessaoVence))
            return true;

        return RealtimeConnections.Expired(sessaoVence, DateTimeOffset.UtcNow.ToUnixTimeSeconds())
               || RealtimeConnections.Revoked(sessaoEmitida, saiuEm);
    }

    /// <summary>Deixa de receber os avisos do projeto que estava acompanhando.</summary>
    public async Task Unwatch()
    {
        if (Context.Items.TryGetValue(GrupoAtual, out var valor) && valor is string grupo)
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, grupo);
            Context.Items.Remove(GrupoAtual);
        }
    }
}
