namespace Pds.Workers;

/// <summary>
/// Os nomes da fila de e-mail, escritos uma vez — quem publica e quem consome
/// precisam concordar, e um erro de digitacao entre os dois nao da erro em lugar
/// nenhum: a mensagem sai e nunca chega.
///
/// <para><b>Sem troca atrasada.</b> O e-mail sai assim que alguem consome; a fila
/// existe para tirar o envio de dentro da requisicao, e nao para esperar.</para>
/// </summary>
public static class EmailQueueNames
{
    /// <summary>A fila dos pedidos de e-mail, ligada a troca padrao pelo proprio nome.</summary>
    public const string Queue = "pds.emails";
}
