# MonitorIA 1.0.3 — Fase 05B8 — Privacy + Store Listing Freeze

## Objetivo

Fechar a documentação pública e o material de submissão da Microsoft Store sem alterar o Core 1.0.3, o backend ou o pareamento já homologados.

## Descobertas corrigidas

1. A política de privacidade já existia; a auditoria 05B7 estava incorreta ao dizer que a rota não existia.
2. A página de segurança ainda dizia que o produto não mantinha continuidade entre eventos, mas o backend atual já possui memória curta, continuidade de veículos e perfis operacionais de equipe. A 05B8 descreve isso corretamente como correlação probabilística e não biométrica, sem identificação civil.
3. Os valores padrão atuais de retenção no backend são 3/365/365/30 dias para frame temporário/keyframe/metadados/clipe preservado. O Agent health usa 7 dias bruto e 365 dias em rollup por padrão.
4. O workflow RTSP experimental aposentado era um YAML somente com comentários e gerava falso vermelho com zero jobs. Agora é workflow válido e apenas manual.

## Escopo

- páginas públicas legais/privacidade;
- auditoria e listing Partner Center;
- teste textual de regressão;
- workflow de validação leve;
- neutralização do workflow RTSP legado.

Não há migration Supabase e não há alteração do Core, instaladores ou Agent nesta fase.

## Próximo gate

Depois do Validate RC Contract verde e do deploy Vercel READY no mesmo commit, gerar o RC final assinado e executar a prova Store em ambiente limpo antes de qualquer tag, release, URL pública do instalador ou submissão ao Partner Center.
