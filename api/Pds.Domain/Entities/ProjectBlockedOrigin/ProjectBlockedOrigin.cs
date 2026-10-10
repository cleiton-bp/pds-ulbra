namespace Pds.Domain.Entities;

/// <summary>
/// Endereco que o projeto bloqueou: a ferramenta nao abre la e o relato que vem de
/// la e recusado — na hora, e mesmo com a lista de autorizados vazia.
///
/// <para><b>Por que e uma lista a parte, e nao uma linha "negada" na de
/// autorizados.</b> As duas respondem perguntas diferentes. A de autorizados e o
/// "so estes", para quem quer fechar a porta de antemao; esta e a reacao a um
/// endereco que apareceu e nao e do cliente — quem copiou a chave publica para outro
/// site. Juntar as duas obrigaria quem so quer barrar um intruso a declarar todos os
/// proprios enderecos antes, e quem esquecesse um deles tiraria a ferramenta do ar
/// no proprio site.</para>
///
/// <para><b>O bloqueio vence a autorizacao.</b> Um endereco nas duas listas e
/// recusado — e as telas nao deixam isso acontecer: bloquear tira o endereco da
/// lista de autorizados, e autorizar tira da de bloqueados.</para>
///
/// <para>Os relatos que ja chegaram de um endereco bloqueado ficam marcados (ver
/// <see cref="Report.BlockedOriginKeptAt"/>), e o time decide o que fazer com eles.
/// Nada e apagado sozinho: o endereco pode ter sido bloqueado por engano.</para>
/// </summary>
public class ProjectBlockedOrigin : PdsBaseEntity
{
    /// <summary>
    /// Teto de bloqueados por projeto. A lista inteira e lida a cada abertura da
    /// ferramenta e a cada relato, e cem enderecos estranhos ja e sinal de que o
    /// caminho e fechar com a lista de autorizados, e nao bloquear um por um.
    /// </summary>
    public const int MaxPerProject = 100;

    /// <summary>Projeto que bloqueia este endereco.</summary>
    public long ProjectId { get; set; }
    public Project Project { get; set; } = null!;

    /// <summary>
    /// O dominio bloqueado, normalizado como o da lista de autorizados: minusculo,
    /// sem esquema, sem barra final e sem caminho, com a porta quando informada.
    /// </summary>
    public string Domain { get; set; } = string.Empty;

    /// <summary>
    /// Quando verdadeiro, vale tambem para o que estiver abaixo do dominio. Fica
    /// desligado por padrao: quem bloqueia o endereco que viu na lista quer barrar
    /// aquele, e barrar os vizinhos sem pedir pode tirar do ar um site do proprio
    /// cliente.
    /// </summary>
    public bool IncludesSubdomains { get; set; }

    /// <summary>
    /// Quem bloqueou. Anulavel porque a pessoa pode sair da conta um dia, e o
    /// bloqueio continua valendo sem ela.
    /// </summary>
    public long? BlockedByUserId { get; set; }
    public User? BlockedByUser { get; set; }
}
