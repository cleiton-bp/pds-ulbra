namespace Pds.Domain.Enums;

/// <summary>
/// Como a escala de 1 a 5 aparece para quem relatou.
///
/// <para><b>Muda o desenho, e nao o dado.</b> Os dois guardam o mesmo inteiro: e
/// escolha de tela, para o cliente falar a lingua do proprio usuario. Guardar
/// escalas diferentes por projeto tornaria a media do estudo incomparavel.</para>
/// </summary>
public enum SatisfactionStyleEnum
{
    /// <summary>Cinco estrelas. E o padrao, e o que a maioria reconhece sem ler nada.</summary>
    Stars,

    /// <summary>Os numeros de 1 a 5. Para quem prefere a escala explicita.</summary>
    Number,
}
