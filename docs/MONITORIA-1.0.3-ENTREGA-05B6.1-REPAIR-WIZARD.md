# MonitorIA 1.0.3 — Entrega 05B.6.1

## Motivo

Durante a validação 24/7 → Microsoft Store, o código por local foi consumido,
mas a tela de reparo permaneceu com o loader porque reutilizava
`FirstRunWaiting`. Esse componente observa o **estágio global do onboarding**;
em uma organização já concluída o estágio permanece 5, portanto não havia
transição automática.

A busca executada manualmente depois também criou câmeras novas, porque as
câmeras antigas continuavam `paired` e com vínculos `agent_cameras.enabled=true`
no Agent desativado. O endpoint de descoberta só reutiliza câmeras
`unpaired/pairing` sem vínculo habilitado.

## Correção

A 05B.6.1 transforma o reparo em um assistente próprio, seguindo o mesmo padrão
visual e operacional do onboarding já validado:

1. **Conectar**
   - gera código por local;
   - mostra código e loader;
   - consulta especificamente a criação + primeiro heartbeat do Agent substituto;
   - avança automaticamente, sem refresh manual.

2. **Procurar**
   - usa as mesmas server actions de descoberta do onboarding;
   - usuário e senha continuam temporários;
   - exibe barra de progresso real (`queued`, `starting`, `scanning`, `testing`,
     `saving`, `done`);
   - avança automaticamente ao encontrar a quantidade esperada.

3. **Concluir**
   - informa quantas câmeras foram reassociadas;
   - oferece links para Câmeras e Instalação.

## UX

`Parear computador` deixa de ser uma aba principal.

O onboarding novo continua inalterado. Na página `Instalação`, organizações já
configuradas veem somente uma ação secundária:

**Trocar ou reparar computador**

Ela serve para:

- troca de PC;
- reinstalação que perdeu o pareamento;
- mudança MonitorIA 24/7 ↔ Microsoft Store.

## Preservação das câmeras

A migration `20260828195500_repair_pairing_preserves_cameras.sql` altera somente
o comportamento do **pareamento por local**:

- desativa o Agent anterior;
- desabilita os vínculos antigos em `agent_cameras`;
- preserva as linhas de `cameras`;
- muda temporariamente essas câmeras para `pairing/offline`;
- cria o novo Agent;
- move uma demonstração ativa para o novo Agent;
- a descoberta reencontra os aparelhos e reutiliza os IDs antigos.

Assim permanecem os mesmos:

- `camera.id`;
- nomes;
- perfis;
- zonas;
- plano/configuração;
- histórico de acontecimentos;
- evidências e inteligência já associadas à câmera.

Credenciais/IP/RTSP continuam exclusivamente locais.

## Importante para o ambiente RC atual

O teste anterior à 05B.6.1 já criou duas câmeras duplicadas (`Lateral2` e
`Alto2`). Não testar esta migration sobre esse estado antes de limpar os
duplicados de teste e decidir quais registros originais devem permanecer.

A limpeza deve ser feita separadamente, com conferência de referências e
autorização explícita.
