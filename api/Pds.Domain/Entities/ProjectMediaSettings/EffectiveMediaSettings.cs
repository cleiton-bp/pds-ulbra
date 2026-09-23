using Pds.Domain.Enums;

namespace Pds.Domain.Entities;

/// <summary>Os limites de um tipo, ja resolvidos entre o gravado e o padrao.</summary>
public record EffectiveMediaKind(
    MediaKindEnum Kind,
    bool IsEnabled,
    int MaxCount,
    long MaxBytes,
    int? MaxDurationSeconds);

/// <summary>
/// Como este projeto se comporta, tenha ele configuracao gravada ou nao.
///
/// <para><b>Existe para haver uma resposta so.</b> A tela do painel e a rota que
/// assina o envio precisam da mesma leitura — e se cada uma resolvesse o padrao por
/// conta propria, um dia a tela mostraria um limite e o servidor cobraria
/// outro.</para>
///
/// <para><b>Tipo que nao esta gravado sai com o padrao, e nao some.</b> Um tipo
/// novo do produto passa a existir para todo projeto no dia em que entra, sem
/// precisar que alguem abra a tela e salve.</para>
/// </summary>
public record EffectiveMediaSettings(
    bool IsEnabled,
    bool AllowsScreenCapture,
    bool AllowsOnInfoRequest,
    int MaxFilesPerReport,
    IReadOnlyList<EffectiveMediaKind> Kinds)
{
    /// <summary>Os limites de um tipo, ou nulo se o produto nao conhece esse tipo.</summary>
    public EffectiveMediaKind? For(MediaKindEnum kind)
        => Kinds.FirstOrDefault(atual => atual.Kind == kind);
}
