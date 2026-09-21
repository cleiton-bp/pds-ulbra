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
}
