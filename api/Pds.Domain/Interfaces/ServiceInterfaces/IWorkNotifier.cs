using Pds.Domain.Enums;

namespace Pds.Domain.Interfaces.ServiceInterfaces;

/// <summary>
/// Avisa, na hora, quem esta com a tela de Trabalho de um projeto aberta que algo
/// mudou ali.
///
/// <para><b>O aviso nao leva conteudo.</b> Vao so os identificadores — o projeto, o
/// card, a coluna em que ele esta agora —, e quem recebe rele pela rota de sempre, com
/// o filtro de acesso e a montagem do objeto que ja existem. Nenhum campo interno ganha
/// um segundo caminho ate a tela, e um aviso que chegasse a quem nao devia contaria, no
/// maximo, que algo mudou.</para>
///
/// <para><b>Chamado depois da gravacao, sempre.</b> Quem rele por causa do aviso
/// precisa encontrar a mudanca la; avisar antes do <c>commit</c> faria a outra tela
/// reler o estado de antes.</para>
///
/// <para><b>Falhar aqui nao derruba a acao.</b> O card ja mudou: sem o aviso, a outra
/// tela so ve a mudanca quando reler por conta propria. A implementacao registra a
/// falha no log e segue — por isso os metodos nao recebem o cancelamento da
/// requisicao: quem fechou a aba depois de gravar nao impede os outros de saberem.</para>
/// </summary>
public interface IWorkNotifier
{
    /// <summary>
    /// Um card mudou: criado, movido, editado, comentado, arquivado. O projeto sai do
    /// proprio card — quem chama nem sempre o tem a mao (quem relatou, a fila).
    /// </summary>
    Task CardChangedAsync(Guid reportPublicId);

    /// <summary>
    /// O que a tela de Trabalho usa do projeto mudou, e a tela rele tudo: criar,
    /// renomear, reordenar, aposentar ou reativar coluna ou prioridade; criar, renomear,
    /// recolorir ou apagar etiqueta; gravar o Ciclo; renomear etapa publica ou gravar o
    /// mapa delas (o card aberto mostra a etapa); alguem entrar no time ou sair dele (a
    /// escolha de responsavel). Aposentar o que ja esta aposentado, reativar o que ja
    /// esta ativo, criar a etiqueta que ja existe e gravar o mapa igual nao avisam.
    /// </summary>
    Task ProjectChangedAsync(Guid projectPublicId);

    /// <summary>A pessoa saiu do time do projeto: a tela dela deixa de valer.</summary>
    Task AccessLostAsync(Guid projectPublicId, Guid userPublicId);

    /// <summary>
    /// Chegou um aviso para a pessoa — so para ela: o sino rele e toca o som que ela
    /// escolheu para o tipo. Depois da gravacao, como os outros.
    /// </summary>
    Task NotificationArrivedAsync(Guid projectPublicId, Guid userPublicId, NotificationKindEnum kind);
}
