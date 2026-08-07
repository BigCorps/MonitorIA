# Fase 10 — segurança, LGPD e memória operacional

## Escopo concluído

- Rate limit transacional no PostgreSQL para assistente, exportação, URLs assinadas e solicitações de privacidade.
- Endpoint público de saúde sem exposição de provedores, modelos ou presença de segredos.
- Headers globais de segurança e URLs de evidência assinadas por cinco minutos.
- Next.js atualizado para 16.3.0; `npm audit --omit=dev` retorna zero vulnerabilidades conhecidas.
- Canal autenticado para direitos do titular, com protocolo, RLS e audit log sem copiar o texto livre.
- Políticas públicas de retenção, subprocessadores, DPA, resposta a incidentes e aviso de área monitorada.
- Bloqueio em profundidade de leitura avançada de placas; reconhecimento facial e embeddings biométricos continuam fora do produto.
- Assistente conectado a sessões, rotinas, processos, perfis operacionais, estados visuais, fila e saúde das câmeras.

## Ordem de implantação

1. Executar `20260807210000_phase10_security_privacy_operational_memory.sql` no SQL Editor.
2. Executar `supabase/verify/phase10_security_privacy_operational_memory.sql` e confirmar os booleanos `true`.
3. Aplicar os arquivos do frontend e publicar no Vercel.
4. Depois do deploy, confirmar apenas `/api/health` e os logs automáticos. Não há etapa de calibração de prompt nesta fase.

## RLS e funções `security definer`

O aviso do linter sobre uma função `security definer` não significa, isoladamente, que ela seja vulnerável. No MonitorIA essas RPCs precisam atravessar RLS para consolidar dados, mas validam organização, usuário e função internamente.

Allowlist funcional que deve permanecer coberta por testes de autorização:

- consultas `assistant_*`, `search_monitoria_*` e `search_operational_sessions` exigem membro da organização;
- ações de revisão/configuração exigem `owner` ou `admin` quando modificam configuração compartilhada;
- rotas financeiras e trial validam organização, plano e estado da operação;
- `consume_api_rate_limit_v1` e rotinas internas aceitam exclusivamente `service_role`.

Uma nova função `security definer` não entra na allowlist automaticamente. Ela precisa definir `search_path`, revogar `public/anon`, validar `auth.uid()` ou `auth.role()` e ter teste de acesso cruzado.

## Rotação de segredos

Rotacionar imediatamente quando houver suspeita de exposição e, preventivamente, segundo a política interna:

1. Criar a nova chave no provedor.
2. Atualizar primeiro Vercel/Edge Functions e confirmar saúde autenticada.
3. Atualizar Agents quando o segredo também existir no ambiente local.
4. Revogar a chave anterior.
5. Verificar falhas de autenticação e registrar a rotação no controle interno.

Segredos abrangidos: `SUPABASE_SERVICE_ROLE_KEY`, chaves OpenAI/Groq, `CRON_SECRET`, segredo do Agent, Stripe/Pix e tokens OAuth. Nunca colocar segredo na URL ou query string; os crons usam `Authorization: Bearer`.

## Backup e restauração

- Usar os backups/PITR habilitados no plano Supabase e registrar a janela disponível.
- Antes de restaurar produção, restaurar em projeto/branch isolado.
- Validar contagens por organização, RLS, objetos de Storage e migrations.
- Somente promover a restauração depois de confirmar que não reativa usuários, webhooks ou crons indevidamente.
- Registrar data, ponto restaurado, responsável e resultado. Um teste de restauração é operacional e deve ser repetido após mudanças de plano ou arquitetura.

## Exclusão segura

1. Confirmar identidade, legitimidade, organização, categorias e intervalo.
2. Verificar obrigação legal, disputa ou preservação aplicável.
3. Exportar quando solicitado e autorizado.
4. Executar a exclusão lógica prevista pelo produto.
5. Deixar o job de retenção eliminar Storage e linhas elegíveis; registrar falhas sem incluir conteúdo pessoal.
6. Confirmar conclusão e informar que backups expiram no ciclo normal e não voltam ao uso comum.

## Resposta a incidentes

Classificar, conter, preservar evidências, avaliar risco/dano relevante, comunicar e corrigir. A Resolução CD/ANPD nº 15/2024 estabelece, para incidentes comunicáveis, prazo de três dias úteis para comunicação do controlador à ANPD e aos titulares, ressalvada legislação específica. O relógio regulatório e a decisão devem ser registrados internamente.

Logs devem conter códigos, IDs técnicos e contexto mínimo. Não registrar senha, token, chave RTSP, frame, texto integral de solicitação LGPD ou payload completo de provedor.

## Limites jurídicos congelados

Não ativar silenciosamente:

- reconhecimento facial ou embedding facial;
- identidade civil, etnia, tom de pele ou atributos protegidos;
- rastreamento permanente entre ambientes;
- leitura avançada de placas.

Qualquer proposta futura exige add-on separado, avaliação de impacto, base legal, retenção própria, acesso reforçado, revisão jurídica e nova decisão arquitetural.

## Identificação jurídica aplicada

Os textos públicos usam os dados fornecidos e juridicamente revisados da BigCorps Tecnologia LTA, CNPJ 14.282.244/0001-19, com foro em São Paulo/SP e Ithiel Almeida como encarregado pelo tratamento de dados. Alterações societárias ou de contato devem ser atualizadas na fonte única `src/lib/app-config.ts`.
