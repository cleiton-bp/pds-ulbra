using Pds.ApiBase.Interfaces;
using Pds.Domain.Entities;

namespace Pds.Domain.Interfaces.RepositoryInterfaces;

/// <summary>
/// Os encerramentos de um relato.
///
/// <para><b>Nao ha interface comum com os comentarios</b>, pelo mesmo motivo que
/// as duas de comentario nao tem base entre si: uma consulta generica "o que foi
/// escrito neste relato" e justamente o que as tabelas separadas existem para
/// tornar impossivel de escrever por distracao.</para>
/// </summary>
public interface IReportClosureRepository : IBaseRepository<ReportClosure>
{
    /// <summary>
    /// O fechamento que ainda vale: o mais recente que ninguem reabriu.
    ///
    /// <para><b>Nulo quer dizer relato aberto</b>, e isso inclui o relato que foi
    /// encerrado e reaberto depois — a linha antiga continua guardada, mas ela nao
    /// e mais o fim de nada.</para>
    ///
    /// <para>Sem sessao, porque quem pergunta e a pagina de acompanhamento. Quem
    /// chegou ate ela ja provou que pode ver este relato, pelo token do link.</para>
    /// </summary>
    Task<ReportClosure?> FindCurrentWithoutSessionAsync(long reportId, CancellationToken cancellationToken = default);

    /// <summary>
    /// O mesmo fechamento, para quem chega <b>com sessao</b>: o painel, que precisa
    /// saber se o relato ja acabou antes de oferecer encerrar de novo.
    ///
    /// <para><b>Sao dois metodos e nao um com bandeira.</b> A bandeira convidaria a
    /// chamada publica a passar "com sessao" por engano num caminho onde a conta
    /// atual e zero — e ali o resultado seria sempre nulo, silenciosamente.</para>
    ///
    /// <para>Traz o autor junto: o painel mostra quem encerrou, e a camada publica
    /// nao — por isso o <c>Include</c> mora so nesta.</para>
    /// </summary>
    /// <summary>
    /// O mesmo fechamento, mas <b>so depois de ele passar a valer la fora</b>.
    ///
    /// <para><b>E metodo proprio, e nao um parametro no outro.</b> Os dois
    /// respondem perguntas diferentes: um diz se o relato esta encerrado, o outro
    /// diz se quem o escreveu ja pode saber disso. Um sinalizador convidaria a
    /// passar o valor errado por descuido — e o descuido aqui mostra a alguem de
    /// fora um encerramento que o time ainda pode desfazer.</para>
    ///
    /// <para>Com espera zero, que e o padrao, os dois devolvem a mesma linha.</para>
    /// </summary>
    Task<ReportClosure?> FindPublicWithoutSessionAsync(long reportId, DateTime asOf, CancellationToken cancellationToken = default);

    Task<ReportClosure?> FindCurrentAsync(long reportId, CancellationToken cancellationToken = default);
}
