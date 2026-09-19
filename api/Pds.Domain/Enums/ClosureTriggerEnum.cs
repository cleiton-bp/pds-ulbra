namespace Pds.Domain.Enums;

/// <summary>
/// Por qual gesto o painel oferece o encerramento.
///
/// <para><b>Sao dois porque os quadros nao terminam do mesmo jeito.</b> Ha time
/// cuja ultima coluna e "Concluido", e ai cair nela e o proprio encerramento; e ha
/// time cuja ultima coluna e "Aguardando deploy" ou "Arquivado", e ali chegar nao
/// quer dizer que o assunto acabou para quem esta de fora.</para>
///
/// <para><b>Nao e a mesma pergunta que "o relato acabou".</b> Encerrar continua
/// sendo decisao do time, e o time pode encerrar de qualquer lugar da fila. Esta
/// escolha diz apenas <b>por onde o painel pergunta</b> — e, no caso da coluna,
/// qual movimento passa a exigir motivo.</para>
/// </summary>
public enum ClosureTriggerEnum
{
    /// <summary>
    /// Cair na ultima coluna ativa encerra, e aquele movimento passa a exigir
    /// desfecho e motivo. E o padrao de fabrica.
    ///
    /// <para><b>Ativa, e nao a de maior posicao.</b> Aposentar a ultima coluna move
    /// o fim da fila para a anterior; ler a posicao crua deixaria o encerramento
    /// preso a uma coluna que ninguem usa mais.</para>
    /// </summary>
    LastColumn,

    /// <summary>
    /// Nenhum movimento encerra: quem encerra e um botao proprio, de onde o relato
    /// estiver. Para o time cuja ultima coluna nao quer dizer "acabou".
    /// </summary>
    Button,
}
