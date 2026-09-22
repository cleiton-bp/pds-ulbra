namespace Pds.Domain.Entities;

/// <summary>
/// O codigo que quem relata guarda para reencontrar os proprios relatos.
///
/// <para><b>Resolve o caso que faltava</b>: a pessoa sem login no site do cliente
/// que quer ver tudo que ja relatou, e nao um relato de cada vez pelo link.</para>
///
/// <para><b>E tabela, e nao coluna no relato.</b> O codigo e de uma pessoa e vale
/// para varios relatos — como coluna repetida, "unico dentro do projeto" nao teria
/// como ser dito ao banco, porque a mesma pessoa repete o valor de proposito. Aqui
/// a unicidade e uma linha, e o relato aponta para ela.</para>
///
/// <para><b>Nao ha nada de pessoa aqui, e e o ponto.</b> Sem nome, sem contato, sem
/// dispositivo: e um identificador sorteado e nada mais. O que o liga a alguem e a
/// propria pessoa ter guardado o papel.</para>
/// </summary>
public class ReporterCode : PdsBaseEntity
{
    /// <summary>
    /// Quantos relatos a lista pessoal devolve de uma vez.
    ///
    /// <para><b>Ha teto porque a rota e publica e nao pede credencial nenhuma.</b>
    /// Sem ele, um codigo usado em centenas de relatos devolveria centenas — num
    /// quadro de 360 por 520, e numa rota que ainda nao tem limite de tentativas.
    /// O custo da resposta nao pode crescer com o uso de quem a pede.</para>
    ///
    /// <para><b>E teto, e nao pagina.</b> Paginar aqui daria a quem sonda um jeito
    /// de medir o tamanho da lista alheia; o teto responde sempre igual. Quem
    /// passar dele ve o aviso de que ha mais, e chega no que falta pelo link de
    /// cada relato — que e a credencial que sempre valeu.</para>
    /// </summary>
    public const int MaxListedReports = 50;

    /// <summary>Projeto onde este codigo vale. Ele nao atravessa projetos.</summary>
    public long ProjectId { get; set; }
    public Project Project { get; set; } = null!;

    /// <summary>
    /// O codigo em si, no mesmo formato do protocolo — <c>H7QK-3M2X-P9WD</c>.
    ///
    /// <para><b>Sorteado inteiro pelo sistema.</b> Se a pessoa escolhesse, seria
    /// senha fraca sem usuario, e adivinhar o de outra cairia exatamente no risco de
    /// se passar por alguem que este modo existe para evitar.</para>
    ///
    /// <para><b>Codigo apresentado de fora nunca e consultado para dizer se
    /// existe.</b> Sugerir outro so quando o primeiro esta ocupado e dizer que esta
    /// ocupado, e qualquer diferenca entre livre e ocupado vira enumeracao — por
    /// isso a rota publica devolve lista vazia para o desconhecido, e nao uma
    /// recusa.</para>
    ///
    /// <para><b>Na geracao a consulta existe, e nao conta nada a ninguem.</b> O
    /// candidato e sorteado por nos, e <c>ExistsAsync</c> confere a colisao antes de
    /// gravar — mesmo desenho do protocolo. Quem esta do lado de fora nunca escolhe
    /// o valor consultado, entao a resposta nao fala do codigo de pessoa
    /// nenhuma.</para>
    ///
    /// <para>Essa conferencia inclui <b>o apagado logicamente</b>, ao contrario da
    /// busca por codigo apresentado: reaproveitar um codigo que ja foi de alguem
    /// faria a lista de uma pessoa aparecer para outra, e o papel com o codigo
    /// antigo continua na mao de alguem.</para>
    /// </summary>
    public string Code { get; set; } = string.Empty;

    /// <summary>Os relatos ligados a este codigo.</summary>
    public ICollection<Report> Reports { get; set; } = [];
}
