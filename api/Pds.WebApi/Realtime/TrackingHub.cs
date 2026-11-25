using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Pds.Domain.Dtos;
using Pds.Domain.Interfaces.ServiceInterfaces;
using Pds.Domain.ViewModels;

namespace Pds.WebApi.Realtime;

/// <summary>
/// O acompanhamento ao vivo de um relato, para quem relatou: a pagina de acompanhamento e
/// "Os seus relatos" do formulario recebem o relato atualizado quando o time mexe nele.
///
/// <para><b>Uma inscricao, e depois so recebe.</b> O unico comando e <see cref="Watch"/>, com a
/// mesma credencial que abriu o relato. Conferida, a conexao entra no grupo do relato e passa
/// a receber <see cref="LiveTracking.Method"/>; nada mais e aceito. O navegador nao busca nada
/// enquanto acompanha.</para>
///
/// <para><b>Sem sessao, e por isso fechado.</b> Uma inscricao por conexao, e a conexao que erra
/// a credencial <see cref="MaxRecusas"/> vezes cai. A recusa e uma so, sem dizer o que falhou,
/// como nas rotas de abrir. O limite de conexoes por endereco fica na rota do hub
/// (<see cref="RealtimeRegistration"/>).</para>
/// </summary>
[AllowAnonymous]
public class TrackingHub : Hub
{
    /// <summary>Quantas credenciais erradas uma conexao pode mandar antes de cair.</summary>
    public const int MaxRecusas = 3;

    private const string Inscrita = "relato";
    private const string Recusas = "recusas";

    private readonly IReportService _relatos;
    private readonly LiveTracking _acompanhamento;

    public TrackingHub(IReportService relatos, LiveTracking acompanhamento)
    {
        _relatos = relatos;
        _acompanhamento = acompanhamento;
    }

    /// <summary>
    /// Passa a acompanhar o relato e devolve como ele esta agora, para a tela comecar igual ao
    /// que vai receber. Nulo na recusa, ou se esta conexao ja acompanha um relato.
    /// </summary>
    public async Task<PublicReportViewModel?> Watch(WatchReportTrackingDto dto)
    {
        if (Context.Items.ContainsKey(Inscrita))
            return null;

        var recusas = Context.Items.TryGetValue(Recusas, out var valor) && valor is int quantas ? quantas : 0;
        if (recusas >= MaxRecusas)
        {
            Context.Abort();
            return null;
        }

        LiveTrackingAccess acesso;
        try
        {
            acesso = await _relatos.AuthorizeLiveTrackingAsync(dto ?? new WatchReportTrackingDto(), Context.ConnectionAborted);
        }
        catch (OperationCanceledException) when (Context.ConnectionAborted.IsCancellationRequested)
        {
            // A tela fechou no meio da inscricao: nao ha a quem responder, e nao e recusa.
            return null;
        }
        catch (Exception falha) when (falha is not OperationCanceledException)
        {
            // A mesma recusa para tudo: credencial errada, relato que nao existe ou projeto
            // fora do ar. Dizer qual seria responder a quem sonda.
            Context.Items[Recusas] = recusas + 1;
            return null;
        }

        try
        {
            await Groups.AddToGroupAsync(
                Context.ConnectionId, LiveTracking.GroupOf(acesso.ReportPublicId, acesso.CanAct), Context.ConnectionAborted);
        }
        catch (OperationCanceledException) when (Context.ConnectionAborted.IsCancellationRequested)
        {
            return null;
        }

        Context.Items[Inscrita] = acesso.ReportPublicId;
        _acompanhamento.Add(Context.ConnectionId, acesso);

        return acesso.Report;
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        _acompanhamento.Remove(Context.ConnectionId);
        await base.OnDisconnectedAsync(exception);
    }
}
