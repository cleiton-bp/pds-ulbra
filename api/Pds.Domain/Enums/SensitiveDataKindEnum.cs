namespace Pds.Domain.Enums;

/// <summary>
/// O que a varredura reconheceu dentro do texto de um relato.
///
/// <para><b>Nenhum destes bloqueia nada.</b> A varredura sinaliza na fila de
/// moderacao e para por ai: falso positivo nao pode decidir, e quem decide e
/// sempre uma pessoa que leu. Um detector que recusasse sozinho transformaria
/// cada engano dele num relato perdido — e o relato perdido e de quem escreveu,
/// que nem fica sabendo.</para>
///
/// <para><b>A lista e do que aparece em texto livre de verdade</b>, e nao de tudo
/// que e dado pessoal. Nome, endereco e data de nascimento tambem sao — e nao
/// estao aqui porque nao ha como reconhece-los sem chutar, e um detector que
/// chuta ensina o time a ignorar o aviso.</para>
/// </summary>
public enum SensitiveDataKindEnum
{
    /// <summary>CPF, com os digitos verificadores conferidos.</summary>
    Cpf,

    /// <summary>CNPJ, com os digitos verificadores conferidos.</summary>
    Cnpj,

    /// <summary>
    /// Numero de cartao, conferido pelo algoritmo de Luhn.
    ///
    /// <para>Luhn nao prova que o cartao existe — prova que o numero foi montado
    /// como um. E o suficiente: e o que separa um cartao de um numero de pedido
    /// de dezesseis digitos.</para>
    /// </summary>
    CreditCard,

    /// <summary>Endereco de e-mail.</summary>
    Email,

    /// <summary>Telefone, no formato brasileiro.</summary>
    Phone,

    /// <summary>
    /// Algo com cara de credencial: chave de API, token de sessao, JWT.
    ///
    /// <para>E o achado mais grave da lista, e o unico que pode ser <b>nosso</b>:
    /// quem cola um erro de integracao costuma colar o cabecalho junto.</para>
    /// </summary>
    Token,
}
