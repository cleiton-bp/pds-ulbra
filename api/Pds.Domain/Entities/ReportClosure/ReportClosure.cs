using Pds.Domain.Enums;

namespace Pds.Domain.Entities;

/// <summary>
/// O fim de um relato, com o motivo, e a resposta de quem o escreveu.
///
/// <para><b>Nao e comentario.</b> Encerramento nao e conversa: acontece uma vez
/// por fechamento, carrega um desfecho, e tem uma resposta esperada do outro lado.
/// Guarda-lo em <see cref="ReportPublicComment"/> daria um texto no meio de outros
/// textos, sem desfecho, sem data propria de encerramento e sem onde pendurar a
/// confirmacao — e a metrica teria de adivinhar qual comentario era o fim.</para>
///
/// <para><b>Uma linha por fechamento, e nao uma por relato.</b> Relato reaberto e
/// fechado de novo ganha linha nova, e as duas ficam. E essa sequencia que conta a
/// historia que o produto existe para contar: o time disse que acabou, a pessoa
/// disse que nao, e o time disse de novo.</para>
///
/// <para><b>Metade das colunas ainda nao tem leitor</b> — confirmacao, nota,
/// reabertura. Nascem junto com a tabela pelo mesmo motivo que
/// <see cref="ProjectPublicStage.AwaitsReporter"/> nasceu: descrevem a vida de uma
/// linha so, e separa-las custaria uma segunda migracao numa tabela criada
/// agora.</para>
/// </summary>
public class ReportClosure : PdsBaseEntity
{
    /// <summary>
    /// Teto do motivo. Menor que o do comentario de proposito: este texto e a
    /// ultima coisa que a pessoa de fora le sobre o proprio problema, e o que nao
    /// cabe aqui nao e motivo, e relatorio.
    /// </summary>
    public const int MaxReasonLength = 2000;

    /// <summary>Teto do comentario de reabertura. Ele diz por que voltou, e nao reconta o caso.</summary>
    public const int MaxReopenCommentLength = 1000;

    /// <summary>Menor nota que a escala aceita.</summary>
    public const int MinSatisfaction = 1;

    /// <summary>Maior nota que a escala aceita.</summary>
    public const int MaxSatisfaction = 5;

    /// <summary>Relato encerrado.</summary>
    public long ReportId { get; set; }
    public Report Report { get; set; } = null!;

    /// <summary>
    /// Qual dos quatro finais foi este. Guardado aqui, e nao lido da etapa publica
    /// na hora de mostrar: a jornada e configuracao, e pode ser reescrita ou
    /// apagada depois — o desfecho deste relato, nao.
    /// </summary>
    public PublicOutcomeEnum Outcome { get; set; }

    /// <summary>
    /// Por que acabou, escrito por quem encerrou. <b>Obrigatorio</b>, e nao
    /// incentivado: sem ele o produto reproduz exatamente o que existe para
    /// resolver — a pessoa fica sabendo que acabou, e nao o que aconteceu.
    /// </summary>
    public string Reason { get; set; } = string.Empty;

    /// <summary>
    /// Quem do time encerrou.
    ///
    /// <para><b>Nulo quer dizer que foi o sistema</b>, no fim do prazo do pedido de
    /// informacao. E a unica maneira de distinguir "ninguem respondeu e o prazo
    /// venceu" de "alguem decidiu encerrar" depois, olhando so a linha.</para>
    /// </summary>
    public long? ClosedByUserId { get; set; }
    public User? ClosedByUser { get; set; }

    /// <summary>
    /// Quando encerrou, em UTC. Separado de <c>CreatedAt</c> porque um encerramento
    /// agendado e gravado quando a fila o consome, e o momento do fato e outro.
    /// </summary>
    public DateTime ClosedAt { get; set; }

    /// <summary>
    /// Quando este fechamento passa a valer <b>para quem relatou</b>.
    ///
    /// <para><b>E coluna propria, e nao uma conta feita na hora de ler.</b> Sem
    /// ela, o encerramento saia na pagina publica no instante da gravacao — mesmo
    /// com espera configurada, e mesmo com a jornada ainda parada. A janela de
    /// desfazer cobria o passo e deixava escapar justamente o texto que a pessoa
    /// mais le.</para>
    ///
    /// <para><b>Gravada uma vez, como os prazos do pedido de informacao.</b>
    /// Calcula-la no momento da leitura, a partir da espera configurada, faria
    /// mexer na configuracao reescrever o passado de um fechamento que ja
    /// aconteceu.</para>
    ///
    /// <para>Igual a <see cref="ClosedAt"/> quando nao ha espera, que e o padrao.
    /// O painel nunca olha para ela: por dentro o relato esta encerrado desde
    /// <see cref="ClosedAt"/>, e e isso que quem move precisa ver.</para>
    /// </summary>
    public DateTime PublicAt { get; set; }

    /// <summary>
    /// Quando quem relatou confirmou que resolveu. Nulo enquanto ele nao respondeu.
    /// <b>Ainda nao tem leitor</b>: a confirmacao e o passo seguinte.
    /// </summary>
    public DateTime? ConfirmedAt { get; set; }

    /// <summary>
    /// A nota de 1 a 5 sobre o tratamento, dada na confirmacao. Nula quando nao
    /// houve resposta — e nula tambem quando houve recusa, que e coisa diferente e
    /// mora em <see cref="SatisfactionDeclined"/>.
    /// </summary>
    public int? Satisfaction { get; set; }

    /// <summary>
    /// A pessoa clicou em "prefiro nao responder".
    ///
    /// <para><b>Fora da escala, e nao o zero dela.</b> Dentro, a recusa viraria a
    /// nota mais baixa para quem le depressa, e a media contaria como insatisfacao
    /// o que foi so recusa em opinar. Sao tres estados — respondeu, recusou, nao
    /// respondeu —, e e a separacao que faz a metrica nao mentir.</para>
    /// </summary>
    public bool SatisfactionDeclined { get; set; }

    /// <summary>
    /// Quando quem relatou reabriu. Preenchido, esta linha deixou de ser o fim do
    /// relato — e um fechamento novo vem depois dela, em linha propria.
    /// </summary>
    public DateTime? ReopenedAt { get; set; }

    /// <summary>
    /// Por que reabriu, quando o projeto pede o comentario. Existe para quem for
    /// pegar o trabalho de novo saber o que faltou, e nao para justificar o pedido.
    /// </summary>
    public string? ReopenComment { get; set; }
}
