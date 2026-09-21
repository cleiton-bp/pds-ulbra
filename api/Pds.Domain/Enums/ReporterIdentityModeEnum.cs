namespace Pds.Domain.Enums;

/// <summary>
/// Como quem abre um relato e reconhecido neste projeto.
///
/// <para><b>Sao tres, e sao excludentes.</b> Nao e um modo com um interruptor ao
/// lado: cada valor responde de um jeito diferente a pergunta "quem e voce", e
/// combinar dois seria perguntar duas vezes. Quem ja tem identidade herdada nao
/// precisa de codigo para guardar, e quem tem codigo ja parou de ser anonimo.</para>
///
/// <para><b>E esta escolha que decide o que a visibilidade pode ser.</b> Sem
/// identidade nao existe "o meu relato" — logo nao existe lista pessoal, e nao
/// existe a opcao "so os meus". A regra atravessa a etapa inteira.</para>
///
/// <para>No banco vira texto em snake_case (protocol, personal_code,
/// inherited_identity).</para>
/// </summary>
public enum ReporterIdentityModeEnum
{
    /// <summary>
    /// Ninguem e identificado. O relato e tratado como se qualquer pessoa o
    /// tivesse enviado, e quem o escreveu volta pelo <b>link</b>.
    ///
    /// <para><b>E o padrao, e o unico que nao exige nada do cliente.</b> Para
    /// colar um script numa pagina e ver relato chegando, nao ha o que
    /// configurar.</para>
    ///
    /// <para>Nao ha lista pessoal aqui, e nao e limitacao a corrigir: sem saber
    /// quem e, nao ha como dizer quais relatos sao dela. O link de cada um
    /// continua sendo a unica prova de que o relato e dela.</para>
    /// </summary>
    Protocol,

    /// <summary>
    /// O sistema sorteia um codigo — <c>H7QK-3M2X-P9WD</c> — e a pessoa guarda.
    ///
    /// <para><b>Resolve o caso que faltava</b>: quem nao tem login no site do
    /// cliente, mas quer ver tudo que ja relatou, e nao um relato de cada vez pelo
    /// link. Navegador novo: ela digita o codigo e reencontra os relatos.</para>
    ///
    /// <para><b>Quem gera e o sistema.</b> Codigo escolhido por quem usa seria
    /// senha fraca sem usuario, e adivinhar o de outra pessoa cairia exatamente no
    /// risco de se passar por alguem.</para>
    ///
    /// <para>O codigo <b>soma</b> ao link, e nao o substitui: perde-lo custa a
    /// lista, e cada relato continua alcancavel pelo proprio link.</para>
    /// </summary>
    PersonalCode,

    /// <summary>
    /// A identidade vem do sistema do cliente, <b>assinada por ele</b>.
    ///
    /// <para><b>Adiado para o fim do projeto, e nada o le ainda.</b> Escolher este
    /// modo grava a escolha e nao muda comportamento nenhum — a tela do painel diz
    /// isso, e nao deixa escolher enquanto for assim.</para>
    ///
    /// <para><b>A assinatura sera assimetrica</b>, e nao com a chave secreta que o
    /// projeto ja tem: o banco guarda so o <c>SHA-256</c> dela, entao conferir um
    /// <c>HMAC</c> exigiria ter o mesmo segredo que o cliente usou, e nos nao
    /// temos. O cliente guarda a chave privada e nos da so a publica — assim um
    /// vazamento do nosso banco nao permite forjar identidade nenhuma, nem por
    /// nos.</para>
    ///
    /// <para><b>A assinatura nao e detalhe de implementacao: e o modo inteiro.</b>
    /// Aceitar um identificador vindo direto do navegador deixaria qualquer pessoa
    /// trocar o numero e ler o relato de outra — e essa e a pior falha possivel
    /// neste produto.</para>
    ///
    /// <para>Quem assina e o servidor do cliente, que ja sabe quem esta logado e ja
    /// tem a chave. <b>Nada parte daqui para o sistema dele</b>: nos so conferimos
    /// o que chega.</para>
    /// </summary>
    InheritedIdentity,
}
