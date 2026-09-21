using Pds.Domain.Enums;

namespace Pds.Domain.Entities;

/// <summary>
/// Quem e quem neste projeto, e — mais adiante nesta etapa — quem pode ver o que.
///
/// <para><b>Uma linha por projeto, criada so quando alguem salva.</b> O mesmo molde
/// de <see cref="ProjectWidgetSettings"/> e <see cref="ProjectCycleSettings"/>: os
/// padroes vivem em codigo, e projeto sem linha aqui e projeto que nunca precisou
/// mudar nada — e le exatamente o mesmo comportamento de quem salvou os
/// padroes.</para>
///
/// <para><b>Identidade e visibilidade moram juntas de proposito.</b> Elas nao sao
/// dois assuntos vizinhos: o modo de identificacao <b>decide</b> o que a
/// visibilidade pode ser. Sem identidade nao existe "o meu relato", logo nao existe
/// "so os meus" para escolher. Separar em duas tabelas deixaria a tela oferecer uma
/// combinacao que a regra nao permite.</para>
/// </summary>
public class ProjectIdentitySettings : PdsBaseEntity
{
    /// <summary>Projeto dono da configuracao. Unico entre os nao apagados, e e o que faz o 1:1.</summary>
    public long ProjectId { get; set; }
    public Project Project { get; set; } = null!;

    /// <summary>
    /// Como quem abre um relato e reconhecido. Ver <see cref="ReporterIdentityModeEnum"/>.
    ///
    /// <para><b>Trocar de modo nao reescreve o passado.</b> O relato que entrou sem
    /// identidade continua sem identidade e continua abrindo pelo link; o modo
    /// decide o que acontece daqui para frente. Sem isso, mudar a configuracao
    /// tornaria ilegivel o que ja existia — e quem tinha o link perderia o
    /// relato por uma decisao que nao foi dele.</para>
    /// </summary>
    public ReporterIdentityModeEnum Mode { get; set; }

    /// <summary>
    /// Quem pode ver os relatos deste projeto. Ver <see cref="ReportVisibilityEnum"/>.
    ///
    /// <para><b>Mora aqui, e nao em tabela propria, porque depende do modo.</b>
    /// "Publico identificado" so faz sentido onde existe identidade — em duas
    /// tabelas, a regra teria de ser conferida lendo as duas, e a tela ofereceria
    /// uma combinacao que a regra nao permite.</para>
    ///
    /// <para><b>Gravar publico ainda nao publica nada.</b> Nenhuma rota publica le
    /// este campo hoje: a lista publica nasce junto da moderacao, e o relato so
    /// aparece nela depois de liberado. Sem essa ordem, o campo sozinho seria uma
    /// maneira de publicar texto livre sem ninguem ter olhado.</para>
    /// </summary>
    public ReportVisibilityEnum Visibility { get; set; }

    /// <summary>
    /// A ferramenta pergunta o nome de quem relata.
    /// </summary>
    /// <remarks>
    /// <para><b>Desligado de fabrica.</b> Coletar nome e coletar dado pessoal, e
    /// isso precisa ser um ato de quem configura — nao o que acontece por omissao.
    /// O produto nunca precisou do nome para funcionar.</para>
    ///
    /// <para><b>Perguntar nao e publicar.</b> Ligado, o campo aparece, e opcional, e
    /// o que a pessoa escrever fica <b>interno</b>: o time ve, o lado de fora nao.
    /// Para o nome sair la fora sao precisas mais duas coisas — o projeto em
    /// publico identificado, e a pessoa ter escolhido assinar aquele relato.</para>
    ///
    /// <para>Sem isto ligado, <see cref="ReportVisibilityEnum.PublicIdentified"/>
    /// existe e nao mostra nome nenhum: nao ha o que mostrar. Nao e contradicao, e
    /// e por isso que a tela diz as duas coisas juntas.</para>
    /// </remarks>
    public bool AsksForName { get; set; }
}
