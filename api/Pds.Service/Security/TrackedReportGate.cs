using Pds.Domain.Entities;
using Pds.Domain.Interfaces.RepositoryInterfaces;

namespace Pds.Service.Security;

/// <summary>
/// A porta das rotas publicas de um relato.
///
/// <para><b>E uma porta so, e isso e o desenho.</b> Abrir, confirmar, reabrir,
/// pedir permissao de anexo e confirmar o anexo entram todas por aqui — repetir o
/// confronto a mao em cada uma seria esperar que ninguem, nunca, esqueca um pedaco.
/// A que le nasceu primeiro, e as que escrevem precisam ser tao exigentes
/// quanto.</para>
///
/// <para><b>Uma recusa so para tudo que da errado</b>: protocolo em branco, token
/// em branco, protocolo que nao existe e token que nao e daquele relato. Quatro
/// mensagens diferentes contariam a quem sonda de qual delas ele esta perto.</para>
///
/// <para>Mora fora do servico de relato porque deixou de ser assunto dele: quem
/// cuida de anexo precisa da mesma porta, e nao precisa de mais nada do que aquele
/// servico faz.</para>
/// </summary>
public static class TrackedReportGate
{
    /// <summary>A unica recusa. Aparece igual em todos os caminhos que falham.</summary>
    public const string Refusal = "Este link nao abre nenhum relato. Confira se ele veio inteiro.";

    /// <summary>O relato por tras de um link de acompanhamento, ou a recusa.</summary>
    public static async Task<Report> RequireAsync(
        IUnitOfWork unitOfWork,
        string? trackingCode,
        string? token,
        CancellationToken cancellationToken)
    {
        var code = (trackingCode ?? string.Empty).Trim().ToUpperInvariant();
        var value = (token ?? string.Empty).Trim();

        if (code.Length == 0 || value.Length == 0)
            throw new KeyNotFoundException(Refusal);

        var report = await unitOfWork.Reports.FindByTrackingCodeWithoutSessionAsync(code, cancellationToken);

        if (report is null)
            throw new KeyNotFoundException(Refusal);

        // Tempo constante: um `==` comum para no primeiro caractere diferente, e a
        // diferenca de tempo entre parar no primeiro e parar no decimo permite
        // descobrir o token caractere a caractere — com o protocolo em maos, que e
        // adivinhavel.
        if (!ProjectKeyGenerator.Matches(value, report.AccessTokenHash))
            throw new KeyNotFoundException(Refusal);

        return report;
    }
}
