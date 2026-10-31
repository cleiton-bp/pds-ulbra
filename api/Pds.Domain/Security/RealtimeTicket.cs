namespace Pds.Domain.Security;

/// <summary>
/// O bilhete da conexao em tempo real.
///
/// <para><b>O token da sessao nunca vai na URL.</b> O navegador nao manda cabecalho
/// numa conexao WebSocket, e a biblioteca de tempo real poe o token no endereco
/// (<c>?access_token=</c>) — onde fica gravado em log de proxy e de servidor. Em vez
/// do token de horas, a conexao leva um bilhete de um minuto, pedido por uma rota REST
/// comum (<c>POST /realtime/ticket</c>) com a sessao de sempre.</para>
///
/// <para><b>O bilhete so abre a conexao.</b> Tem destinatario proprio, e e aceito so
/// pelo esquema de autenticacao do hub: nenhuma rota REST o aceita, e o hub nao aceita
/// o token da sessao. Vencido o minuto, a conexao aberta continua enquanto valer a sessao
/// que pediu o bilhete: ele leva ate quando ela vale (<see cref="SessionExpiresClaim"/>),
/// e a conexao fecha em ate meio minuto depois de a sessao vencer ou de a pessoa sair. O
/// time do projeto continua conferido a cada aviso.</para>
/// </summary>
public static class RealtimeTicket
{
    /// <summary>O esquema de autenticacao que le o bilhete — e so o hub o usa.</summary>
    public const string Scheme = "RealtimeTicket";

    /// <summary>Onde fica o hub. O bilhete so e lido do endereco neste caminho.</summary>
    public const string HubPath = "/realtime/hub";

    /// <summary>Quanto o bilhete vale: o bastante para abrir a conexao.</summary>
    public static readonly TimeSpan Lifetime = TimeSpan.FromMinutes(1);

    /// <summary>
    /// Ate quando vale a sessao que pediu o bilhete, em segundos (como o <c>exp</c>): e ate
    /// quando a conexao aberta com ele pode durar.
    /// </summary>
    public const string SessionExpiresClaim = "sexp";

    /// <summary>
    /// Quando a sessao que pediu o bilhete foi emitida, em segundos (o <c>iat</c> dela). E
    /// esse, e nao o do bilhete, que se compara com o "sair", pela mesma regra das rotas
    /// REST: o bilhete costuma nascer no mesmo segundo em que a pessoa sai, e ai a conta
    /// do bilhete nunca dava "antes".
    /// </summary>
    public const string SessionIssuedClaim = "siat";
}
