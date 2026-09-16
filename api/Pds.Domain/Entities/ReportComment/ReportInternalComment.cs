namespace Pds.Domain.Entities;

/// <summary>
/// O que o time escreve entre si sobre um relato.
///
/// <para><b>E o dado mais perigoso da aplicacao.</b> E onde se fala livremente —
/// suspeita, culpa, prazo que nao vai ser cumprido. Se um dia vazar para a camada
/// publica, e o pior incidente possivel para este produto: a pessoa que relatou
/// leria o que o time diz dela.</para>
///
/// <para><b>Por isso sao duas tabelas, e nao uma com campo de visibilidade.</b>
/// Com um sinalizador, basta esquecer um filtro numa consulta para vazar, e o
/// esquecimento nao da erro em lugar nenhum — a resposta sai com uma linha a
/// mais. Com tabelas separadas, vazar exige escrever uma consulta que nao existe
/// e que ninguem teria motivo para escrever.</para>
///
/// <para><b>O texto nao sai daqui.</b> Nem para o payload do evento: o evento
/// registra que alguem comentou, e nao o que foi dito. Evento so cresce e nunca e
/// apagado — copiar o texto para la criaria uma segunda copia do dado mais
/// perigoso, numa tabela que nao se consegue limpar.</para>
/// </summary>
public class ReportInternalComment : PdsBaseEntity
{
    /// <summary>
    /// Teto do texto. Mora aqui, e nao no mapeamento, porque quem grava e quem
    /// valida precisam do mesmo numero.
    ///
    /// <para>E separado do teto do comentario publico de proposito, ainda que os
    /// dois numeros sejam iguais hoje: o publico sai para fora e pode ganhar regra
    /// propria, e uma constante compartilhada faria a mudanca de um mexer no
    /// outro sem ninguem pedir.</para>
    /// </summary>
    public const int MaxBodyLength = 5000;

    /// <summary>Relato comentado.</summary>
    public long ReportId { get; set; }
    public Report Report { get; set; } = null!;

    /// <summary>
    /// Quem escreveu. <b>Obrigatorio</b>: comentario interno sem autor nao serve
    /// para decidir nada depois — "alguem achou que era do cache" nao ajuda
    /// ninguem tres meses adiante.
    /// </summary>
    public long UserId { get; set; }
    public User User { get; set; } = null!;

    /// <summary>O texto, como o time escreveu.</summary>
    public string Body { get; set; } = string.Empty;
}
