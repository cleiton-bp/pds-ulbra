/**
 * Envelope de toda resposta da API, com sucesso ou sem.
 * `PascalCase` espelha o contrato C# (`Pds.Shared/Models/ApiResponse.cs`).
 */
export interface ApiResponse<T> {
  Success: boolean
  Message: string | null
  Data: T | null
  /** So em listagem. */
  Total?: number | null
}
