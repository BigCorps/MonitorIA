-- Notas de rollback emergencial.
--
-- Este arquivo NÃO restaura automaticamente a função antiga porque ela
-- contém a falha oauth_provider_not_allowed já confirmada.
--
-- Em caso de problema:
-- 1. desabilite temporariamente o Custom Access Token Hook no Dashboard;
-- 2. restaure a migration anterior pelo controle de versão;
-- 3. não apague identidades, usuários ou preferências.
--
-- Para voltar apenas o valor padrão da coluna:
alter table private.user_auth_preferences
  alter column allow_google set default false;
