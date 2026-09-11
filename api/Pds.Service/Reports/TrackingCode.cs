using System.Security.Cryptography;

namespace Pds.Service.Reports;

/// <summary>
/// Gera o protocolo que a pessoa le, repete ao telefone e digita para acompanhar.
///
/// <para><b>O alfabeto tem 32 simbolos, e as ausencias sao o ponto.</b> Nao existe
/// <c>0</c>, <c>O</c>, <c>1</c> nem <c>I</c>: eles se confundem na tela, na
/// impressao e principalmente lidos em voz alta, que e como um protocolo circula
/// de verdade. Perder quatro simbolos custa entropia; ganhar "zero ou ó?" custa um
/// chamado de suporte.</para>
///
/// <para><b>Tres blocos de quatro</b>, separados por hifen. O agrupamento existe
/// para a pessoa conseguir conferir o que digitou sem perder o lugar, e para ela
/// ditar o codigo em pedacos.</para>
/// </summary>
public static class TrackingCode
{
    /// <summary>32 simbolos: os digitos de 2 a 9 e as letras sem I e sem O.</summary>
    private const string Alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

    private const int BlockCount = 3;
    private const int BlockLength = 4;

    /// <summary>Quantos simbolos o codigo tem, sem contar os hifens.</summary>
    public const int SymbolCount = BlockCount * BlockLength;

    /// <summary>
    /// Sorteia um protocolo novo. Nao consulta o banco: a conferencia de colisao e
    /// de quem grava, porque so ali existe transacao.
    ///
    /// <para>Sao 32^12, cerca de 1,15 quintilhao de combinacoes — colisao e
    /// improvavel, e e por isso que ela e tratada com uma nova tentativa em vez de
    /// um contador sequencial, que entregaria quantos relatos o sistema ja
    /// recebeu.</para>
    /// </summary>
    public static string Generate()
    {
        // 32 divide 256 sem sobra, entao o resto da divisao nao favorece nenhum
        // simbolo. Com um alfabeto de tamanho diferente, esta linha precisaria
        // descartar os bytes da faixa incompleta.
        var bytes = RandomNumberGenerator.GetBytes(SymbolCount);
        var blocks = new string[BlockCount];

        for (var block = 0; block < BlockCount; block++)
        {
            var symbols = new char[BlockLength];

            for (var position = 0; position < BlockLength; position++)
                symbols[position] = Alphabet[bytes[(block * BlockLength) + position] % Alphabet.Length];

            blocks[block] = new string(symbols);
        }

        return string.Join('-', blocks);
    }
}
