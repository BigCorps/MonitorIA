# Validação — MonitorIA padrão / Robustez Gate 1

## Base

- GitHub `main`: `a066def70077eafc4aad17b84e47794fa5e0b578`.
- Este pacote promove para o MonitorIA padrão a experiência já aprovada no VIP.
- Nenhuma migration Supabase nova.
- Nenhum arquivo do Agent.

## O que foi promovido

### Estado real por câmera
O mesmo motor compartilhado continua decidindo:
- Conectando
- Precisa concluir configuração
- Pronta para monitorar
- Monitorando
- Atenção necessária
- Offline

A diferença entre padrão e VIP fica somente nos CTAs/destinos.

### Câmeras
`/dashboard/cameras` deixa de usar `ONLINE` como resumo final e passa a mostrar:
- checklist;
- Local;
- estado real;
- etapas restantes;
- próximo botão;
- diagnóstico avançado recolhido.

### Detalhe da câmera
A página individual também usa o estado real e oferece o perfil guiado quando a
configuração ainda não foi concluída.

### Perfil inteligente
O onboarding padrão agora usa a mesma experiência validada no VIP:
- primeira imagem real;
- geração automática da sugestão;
- aprovação simples;
- botão “Aprovar e iniciar monitoramento”;
- edição completa em “Configuração avançada”.

### Multi-Site
A escolha do Local passa a ser obrigatória antes de gerar o código tanto no
padrão quanto no VIP. O backend deixa de fazer fallback silencioso para
`sites[0]`.

## Convites
Nenhuma nova mudança foi necessária: cooldown, código de 6 dígitos, auditoria e
remetente seguro já são infraestrutura compartilhada e portanto já atendem os
dois produtos.

## Validação local

- 12 arquivos TS/TSX analisados pelo parser TypeScript.
- 0 erros sintáticos.
- 6/6 asserções de runtime do motor de estado aprovadas.
- testes textuais antigos que proibiam a UX no padrão foram atualizados.
- teste antigo da listagem de câmeras foi atualizado para o novo estado real.
- 0 arquivos em `agent/**`.
- scan de segredos: limpo.

## Agent 1.0.4

Nenhum watchdog, restart isolado, `runtime_revision` ou mudança de binário faz
parte deste pacote. Essas melhorias ficam acumuladas para uma evolução futura
do Agent 1.0.4, conforme decisão do projeto.

## Validação integrada

O build completo deve ser confirmado por GitHub Actions/Vercel após o upload,
pois este ZIP é um overlay e não contém o repositório inteiro.
