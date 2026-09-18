namespace Pds.Translation;

/// <summary>
/// Uma etapa publica, reduzida ao que a decisao precisa saber dela.
///
/// <para><b>Nao e a entidade.</b> A entidade carrega rotulo, frase, desfecho, data
/// de criacao e a navegacao para o projeto — nada disso muda uma decisao, e trazer
/// junto arrastaria o banco para dentro do motor. Aqui entram tres coisas: quem ela
/// e, onde ela esta na jornada, e se a jornada pode voltar para ela.</para>
/// </summary>
/// <param name="Id">Identificador interno da etapa. O motor so o compara; nunca o interpreta.</param>
/// <param name="Position">A ordem na jornada. E por ela que se sabe o que e avancar e o que e voltar.</param>
/// <param name="AllowsReturn">A jornada pode voltar para esta etapa.</param>
public readonly record struct PublicStageRef(long Id, int Position, bool AllowsReturn);
