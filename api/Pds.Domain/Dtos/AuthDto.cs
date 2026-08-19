namespace Pds.Domain.Dtos;

/// <summary>
/// Entrada do login. O painel faz o Sign-In com o Google no navegador e manda para
/// ca apenas o token de identidade que recebeu; a API confere a assinatura desse
/// token com o Google antes de acreditar em qualquer coisa dentro dele.
/// </summary>
public class GoogleSignInDto
{
    /// <summary>
    /// O <c>id_token</c> devolvido pelo Google ao painel. E um JWT assinado pelo
    /// proprio Google, com tres partes separadas por ponto.
    /// </summary>
    /// <example>eyJhbGciOiJSUzI1NiIsImtpZCI6IjE2M2M0In0.eyJzdWIiOiIxMDk4NyJ9.SflKxwRJSM</example>
    public string? IdToken { get; set; }
}
