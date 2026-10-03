namespace Pds.Domain.Enums;

/// <summary>
/// De onde o card veio.
///
/// <para><b>Todo card mora em <c>reports</c>.</b> O relato e o card que chegou de
/// fora, pela ferramenta; o card do time nasce no painel. Os dois andam pelos
/// mesmos estados, recebem o mesmo comentario interno e contam a mesma historia —
/// separar em duas tabelas faria cada coisa do quadro existir duas vezes.</para>
/// </summary>
public enum CardKindEnum
{
    /// <summary>Veio de fora, pela ferramenta: tem protocolo, link e quem relatou.</summary>
    Report,

    /// <summary>
    /// Criado pelo time no painel. <b>Nunca tem lado de fora</b>: sem protocolo,
    /// sem link, sem etapa publica, sem moderacao — e o banco recusa a linha que
    /// tente ter.
    /// </summary>
    Team,
}
