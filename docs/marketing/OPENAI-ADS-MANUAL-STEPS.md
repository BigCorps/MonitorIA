# MonitorIA — passos manuais até a revisão da campanha

Objetivo: deixar mensuração e campanha prontas para revisão, sem publicar e sem
confirmar gasto.

## 1. Recuperar o acesso ao Ads Manager

1. Use Chrome ou Edge atualizado no seu computador, fora do navegador embutido
   do ChatGPT.
2. Desative temporariamente VPN, proxy, bloqueador de anúncios e proteção
   antirrastreamento estrita para `ads.openai.com`.
3. Permita JavaScript e cookies para `ads.openai.com` e `openai.com`.
4. Abra `https://ads.openai.com` diretamente e entre com a mesma conta OpenAI.
5. Se o desafio voltar em loop, limpe apenas os dados desses dois sites, feche o
   navegador, abra novamente e tente em uma rede comum.
6. Se ainda falhar, anote o horário, copie o Cloudflare Ray ID se aparecer, faça
   uma captura de tela e abra o suporte da OpenAI informando: “Ads Manager preso
   em loop no desafio do Cloudflare”. Não envie senha, código MFA ou cookie.

## 2. Criar o Pixel ID

1. No Ads Manager, abra **Conversions**.
2. Crie um **Measurement Pixel** para `monitoria.cam` com o nome
   `MonitorIA Web`.
3. Copie o Pixel ID. Ele é um identificador público, não uma chave secreta.
4. Mantenha **Automatic advanced matching** desativado.
5. Não crie integração server-side e não publique campanha ainda.

## 3. Aplicar e implantar os arquivos

1. Extraia o ZIP na raiz do repositório `BigCorps/MonitorIA`, preservando as
   pastas e substituindo os arquivos de mesmo nome.
2. Revise as alterações, faça commit e envie para a branch usada em produção.
3. Na Vercel, abra o projeto do MonitorIA e adicione ao ambiente **Production**:

   ```dotenv
   NEXT_PUBLIC_OPENAI_ADS_PIXEL_ID=COLE_O_PIXEL_ID
   NEXT_PUBLIC_OPENAI_ADS_DEBUG=true
   ```

4. Faça uma nova implantação de produção. Variáveis `NEXT_PUBLIC_*` só entram no
   bundle depois de novo build.

## 4. Validar `trial_started`

1. Abra `https://monitoria.cam` em uma sessão de teste limpa.
2. Aceite os cookies de medição.
3. Abra o console do navegador e confirme as mensagens de debug do Pixel sem
   erros.
4. Com uma conta de teste elegível, conclua a configuração e clique em
   **Iniciar minhas 24 horas grátis**.
5. Confirme que a página mostra “Teste iniciado” e que o Ads Manager recebe um
   único evento `trial_started` com `plan_id` igual a
   `monitoria_self_service_24h`.
6. Recarregue a página e confirme que não aparece um segundo evento.
7. Troque `NEXT_PUBLIC_OPENAI_ADS_DEBUG` para `false` e faça nova implantação.

Se você não puder consumir um trial para o teste, pare depois do passo 3 e volte
com uma captura da tela de diagnóstico do Pixel. Não simule a conversão clicando
em publicar anúncio.

## 5. Montar a campanha como rascunho

1. Abra **Campaigns > Create campaign**.
2. Selecione objetivo de conversão no site e escolha `trial_started`.
3. Use o nome, segmentação, context hints, anúncios e URLs do arquivo
   `OPENAI-ADS-CAMPAIGN-DRAFT.md`.
4. Defina orçamento médio diário de **R$ 40,00**.
5. Use o período inicial de 14 dias apenas como janela de avaliação; confira os
   limites de entrega mostrados pelo próprio Ads Manager.
6. Faça upload de `public/ads/monitoria-openai-trial-1200x628.png`.
7. Desative expansão de público, criativos automáticos e advanced matching caso
   alguma dessas opções apareça ativada.
8. Avance somente até **Review**. Salve como rascunho se essa opção existir.
9. Não clique em **Publish**, **Launch**, **Submit**, **Confirm payment** ou botão
   equivalente. Se o sistema exigir método de pagamento para salvar, pare antes.

## 6. O que trazer ao voltar

- Pixel ID e status do Pixel;
- confirmação de que `trial_started` chegou uma vez, ou o erro exibido;
- captura da tela de revisão da campanha;
- estimativa de gasto/limites mostrada pelo Ads Manager;
- qualquer aviso de política, audiência, imagem ou pagamento.

Com esses itens é possível fazer a revisão final antes de qualquer publicação.
