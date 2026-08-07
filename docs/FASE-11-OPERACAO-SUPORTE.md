# Fase 11 — operação, suporte e continuidade entre câmeras

## O que entra em produção

- ciclo operacional em `/api/cron/operations`, executado a cada cinco minutos;
- alertas deduplicados para Agent/câmera offline, fila, análise, clipes, custo, Storage, expurgo, Pix, divergência, trial, versão e Assistente;
- resolução automática quando a condição deixa de existir;
- painel autenticado de alertas, reconhecimento e resolução;
- diagnóstico JSON sem RTSP, IP, tokens, imagens, vídeos ou payloads bancários;
- central de ajuda, guias por fabricante, WhatsApp e página pública de status;
- hipóteses temporárias de passagem entre câmeras sem chamadas adicionais de IA;
- retenção máxima de 24 horas para as hipóteses entre câmeras.

## Aplicação

1. Execute `supabase/migrations/20260808110000_phase11_operations_cross_camera.sql` no SQL Editor.
2. Publique os arquivos do frontend.
3. Defina `AGENT_RECOMMENDED_VERSION` na Vercel com a versão vigente do Agent.
4. O `CRON_SECRET` existente protege o novo endpoint, como os demais crons.

Não há novo provedor pago nem chamada de visão nesta fase. Alertas e trajetos são calculados no PostgreSQL sobre telemetria e descritores já existentes.

## Diagnóstico seguro

O arquivo exportado contém apenas nomes/IDs operacionais, versões, plataformas, estados, horários, contagens e códigos de erro. O suporte nunca deve solicitar senha RTSP. Credenciais permanecem cifradas no Agent local e não fazem parte do diagnóstico.

## Inventário de segredos

Inventário de nomes, sem registrar valores:

- `SUPABASE_SERVICE_ROLE_KEY`;
- `MONITORIA_AGENT_SECRET`;
- `CRON_SECRET`;
- `OPENAI_API_KEY` e `GROQ_API_KEY`;
- `BANCO_INTER_API_KEY` e credenciais da ponte Pix;
- `MCP_ALLOWED_OAUTH_CLIENT_IDS` e tokens OAuth;
- tokens temporários de publicação/validação.

Os valores devem existir somente nos cofres dos provedores e ambientes autorizados. Rotação exige revogar o valor anterior depois de validar o novo.

## Política de backup e desastre

- Banco: usar os backups gerenciados do projeto Supabase e manter a retenção compatível com o plano contratado.
- Código: Git é a fonte de verdade; releases do Agent ficam em GitHub Releases.
- Segredos: manter inventário de nomes e responsáveis, nunca exportar valores para o repositório.
- Mídia: objetos temporários continuam sujeitos à política de retenção; backup não deve prolongar artificialmente dados já expirados.
- RPO operacional: o menor intervalo oferecido pelo backup contratado.
- RTO inicial: restaurar banco, configurar segredos, publicar aplicação, validar cron e reativar Agents nessa ordem.

### Runbook de restauração

1. Declarar o incidente e congelar mudanças de schema.
2. Selecionar um ponto anterior confirmado no painel do Supabase.
3. Restaurar em projeto isolado, nunca sobre produção durante o teste.
4. Aplicar as migrations posteriores ao ponto restaurado.
5. Validar autenticação, RLS, organizações, câmeras, eventos, cobranças e expurgo.
6. Trocar URLs/segredos somente após aprovação do responsável.
7. Registrar horário, ponto restaurado, RPO/RTO observado e resultado.
8. Excluir o ambiente temporário respeitando a política de retenção.

Uma restauração real altera infraestrutura e dados. Por segurança, ela não é executada por esta entrega de código nem pelo MCP de leitura; deve ser registrada no procedimento autorizado do projeto.

## Limites da continuidade entre câmeras

O mecanismo compara janela temporal, cor/vestuário visível ou tipo/cor do veículo. Ele não usa rosto, embeddings faciais, identidade civil ou placa confirmada. Cada resultado inclui a hipótese de que sujeitos diferentes possuam aparência semelhante. A página e o Assistente devem sempre usar linguagem probabilística.

