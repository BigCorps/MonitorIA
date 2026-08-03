# Arquitetura dos perfis operacionais

## Fluxo

```text
event_people + appearance não biométrica
        ↓
person_memory_instances da INT-2
        ↓
sessões e capítulos da INT-3
        ↓
processos da INT-5
        ↓
observação operacional normalizada
        ↓
perfil aprovado ou candidato temporário
        ↓
decisão explicável
        ↓
revisão humana
```

## Score contextual

A correspondência combina, com pesos conservadores:

- aparência não biométrica: 55%;
- zonas habituais: 15%;
- ações e sessão: 10%;
- dia e faixa de turno: 10%;
- confiança da observação anterior: 10%.

Um score alto não prova identidade. Ele significa apenas que a aparição é compatível com um perfil operacional aprovado naquela câmera.

## Atualizações controladas

Observações novas não alteram o perfil diretamente. Elas geram uma `staff_profile_update_proposal`, que precisa ser aplicada por owner/admin. Cada aplicação cria uma versão imutável.

## Candidatos

Aparições classificadas como equipe e sem perfil suficiente podem formar um candidato temporário. O candidato só fica disponível para aprovação depois de atingir o mínimo configurado de observações e dias distintos. Expira automaticamente se não for revisado.
