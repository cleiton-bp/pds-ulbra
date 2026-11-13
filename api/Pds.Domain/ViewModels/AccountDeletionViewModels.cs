namespace Pds.Domain.ViewModels;

/// <summary>
/// O que o dialogo de exclusao mostra antes da confirmacao: o que vai sumir, contado no
/// banco, e o prazo. A pessoa decide sabendo o tamanho do que apaga.
/// </summary>
/// <param name="Projects">Projetos da conta, que saem do ar no pedido e somem no fim do prazo.</param>
/// <param name="Reports">Relatos e cards desses projetos, que somem junto.</param>
/// <param name="TeamMembers">Pessoas de fora da conta que trabalham nesses projetos e perdem o acesso no pedido.</param>
/// <param name="OtherProjects">Projetos de outras contas em que a pessoa esta no time: ela sai deles no fim do prazo.</param>
/// <param name="GraceHours">Horas para desistir, entrando de novo no painel.</param>
public record AccountDeletionPreviewViewModel(
    int Projects,
    int Reports,
    int TeamMembers,
    int OtherProjects,
    int GraceHours);

/// <summary>A exclusao pedida: o momento em que ela vira definitiva.</summary>
/// <param name="PurgeAt">Quando a conta e apagada de vez, em UTC. Entrar no painel antes disso cancela.</param>
public record AccountDeletionRequestedViewModel(DateTime PurgeAt);
