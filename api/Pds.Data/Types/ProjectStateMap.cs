using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Pds.Data.Configurations;
using Pds.Domain.Entities;

namespace Pds.Data.Types;

public class ProjectStateMap : BaseEntityConfiguration<ProjectState>
{
    protected override void ConfigureEntity(EntityTypeBuilder<ProjectState> builder)
    {
        builder.ToTable("project_states", table =>
        {
            table.HasComment(
                "A fila de trabalho de cada projeto, com os nomes que o proprio cliente deu. Existe porque estados fixos, definidos por nos, obrigariam todo time a descrever o processo dele com as nossas palavras.");
        });

        builder.Property(state => state.ProjectId)
            .HasColumnName("project_id")
            .IsRequired()
            .HasComment("Projeto dono do estado. A fila de trabalho e de cada sistema, nao da conta.");

        builder.Property(state => state.Name)
            .HasColumnName("name")
            .HasMaxLength(ProjectState.MaxNameLength)
            .IsRequired()
            .HasComment("Nome dado pelo time, como Analise ou Corrigindo. Renomear nao reescreve o passado: o evento guarda o nome que valia na epoca.");

        builder.Property(state => state.Position)
            .HasColumnName("position")
            .IsRequired()
            .HasComment("Ordem na tela, escolhida pelo cliente. Fila de trabalho tem sequencia, entao nao serve a ordem alfabetica.");

        builder.Property(state => state.DeactivatedAt)
            .HasColumnName("deactivated_at")
            .HasComment("Nulo enquanto o estado aceita relato novo; preenchido para aposenta-lo sem apagar, porque relato antigo continua apontando para ele.");

        // A propriedade calculada nao vira coluna: ela e a leitura de deactivated_at,
        // e guardar as duas deixaria o sim/nao discordar da data.
        builder.Ignore(state => state.IsActive);

        // O mesmo nome nao entra duas vezes no projeto. O filtro deixa de fora as
        // linhas apagadas, como no endereco autorizado.
        //
        // O indice compara byte a byte, entao ele pega "Analise" repetido e nao
        // "analise" com a caixa trocada — a conferencia que ignora caixa mora no
        // servico. Aqui ele e a rede embaixo, para duas gravacoes ao mesmo tempo
        // nao criarem a mesma coluna duas vezes.
        builder.HasIndex(state => new { state.ProjectId, state.Name })
            .IsUnique()
            .HasFilter("deleted_at IS NULL");

        // A listagem comeca pelo projeto e le a fila inteira. O indice unico acima
        // tem o mesmo comeco, mas e parcial — este atende a consulta sem depender
        // de o planejador casar o filtro.
        builder.HasIndex(state => state.ProjectId);
    }
}
