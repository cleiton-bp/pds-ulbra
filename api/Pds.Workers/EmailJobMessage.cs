using Pds.Domain.Interfaces.ServiceInterfaces;

namespace Pds.Workers;

/// <summary>
/// O que viaja na fila de e-mail: que e-mail montar, e sobre o que. Nada mais.
///
/// <para><b>Nem o texto, nem o endereco, nem o link.</b> Quem consome rele o estado
/// atual e monta na hora: assim mensagem repetida nao manda duas vezes, convite
/// cancelado depois de entrar na fila nao sai, e o link do convite nunca fica
/// guardado na fila.</para>
/// </summary>
/// <param name="Kind">Que e-mail.</param>
/// <param name="PublicId">Sobre o que — o convite, por exemplo.</param>
public record EmailJobMessage(EmailJobKind Kind, Guid PublicId);
