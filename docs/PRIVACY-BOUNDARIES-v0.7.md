# Limites de privacidade — MonitorIA v0.7

## Declaração técnica correta

O **vídeo contínuo** não é enviado pelo Agent. Ele permanece no equipamento
do estabelecimento e é usado localmente para medir movimento em baixa
resolução.

Quando um evento é formado, até três quadros JPEG selecionados — início,
pico e fim — podem ser enviados para a infraestrutura do MonitorIA e para o
provedor de visão configurado.

Portanto, é proibido usar a afirmação absoluta:

> Seu vídeo nunca sai da loja.

Texto recomendado:

> O vídeo contínuo permanece no estabelecimento. Somente quadros selecionados
> de eventos são enviados de forma protegida para análise e retenção conforme
> a política contratada.

## Região atual

Enquanto o Supabase permanecer em `us-west-2`, as Vercel Functions devem
executar em `pdx1`, região equivalente a `us-west-2`. Isso reduz a distância
entre o código do servidor e o banco.

A permanência em `us-west-2` é uma decisão arquitetural possível, mas implica
armazenamento e tratamento internacional dos quadros e metadados mantidos
no Supabase.

Migrar o Supabase para `sa-east-1` reduz a superfície internacional e pode
melhorar o posicionamento comercial para clientes brasileiros, mas não
elimina a transferência internacional enquanto quadros forem enviados a um
provedor de visão sem processamento no Brasil.

A decisão de migrar deve considerar:

- público-alvo e exigências contratuais dos clientes;
- latência medida para usuários brasileiros;
- custo e risco operacional da migração;
- necessidade comercial de afirmar residência de dados no Brasil.

## Transferência internacional

A operação deve possuir um mecanismo válido para cada fluxo internacional,
incluindo Supabase, OpenAI, Vercel e seus subprocessadores aplicáveis.

Um DPA não deve ser tratado automaticamente como equivalente às
cláusulas-padrão brasileiras. A documentação contratual deve ser verificada
quanto à incorporação integral das cláusulas da ANPD ou outro mecanismo
válido.

O registro das operações deve identificar:

- categorias de dados e titulares;
- países e fornecedores envolvidos;
- finalidade e frequência da transferência;
- retenção e exclusão;
- subprocessadores;
- medidas técnicas e contratuais;
- mecanismo jurídico utilizado.

## Retenção padrão

- frames temporários: 3 dias;
- quadros-chave: 90 dias;
- metadados de eventos: 90 dias;
- clipes preservados: somente mediante ação explícita e política contratual.

O endpoint diário `/api/cron/retention` remove primeiro os objetos pelo
Storage API. Apenas depois os registros expirados são eliminados do banco.

## Pessoas

`event_people.local_track_id` existe apenas para distinguir aparições dentro
do mesmo evento. O banco prefixa o ID com o UUID do evento. É proibido
reutilizá-lo para reconhecer ou correlacionar uma pessoa entre eventos,
sessões, câmeras ou dias.

Não há reconhecimento facial nem cadastro biométrico na v1.

## Placas

A tabela `event_plate_suggestions` fica reservada para um add-on futuro com
requisitos próprios. A v1 força `plateSuggestion=null` e não persiste
leitura de placas.
