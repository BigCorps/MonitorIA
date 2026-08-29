# MonitorIA 1.0.3 — Listing Microsoft Store (pt-BR)

Documento de preenchimento do Partner Center. Não publica nada por si só.

## Identidade e disponibilidade

- Produto: MonitorIA
- Desenvolvido por: BIGCORPS TECNOLOGIA LTA
- Idioma principal: Português (Brasil)
- Tipo do aplicativo: EXE
- Arquitetura: x64
- Sistema: Windows 10/11 64 bits
- Categoria recomendada: Empresas > Dados + análises
- Categoria secundária: não necessária no primeiro envio
- Modelo de preço recomendado: Assinatura
- Descoberta: disponível e pesquisável na Microsoft Store
- Site: https://monitoria.cam
- Suporte: https://monitoria.cam/contato
- Privacidade: https://monitoria.cam/privacidade
- Exclusão de conta/dados: https://monitoria.cam/excluir-conta
- Termos/licença aplicáveis: https://monitoria.cam/termos

### Observação sobre preço

O MonitorIA é um serviço recorrente por câmera, com trial e contratação fora da Microsoft Store. Para aplicativos não relacionados a jogos no PC, a política da Microsoft admite cobrança segura de terceiros para assinaturas digitais. O preenchimento deve refletir a experiência comercial realmente oferecida no momento da submissão. Não marcar `Free`, `Paid` ou `Freemium` se isso contradisser a contratação exibida ao usuário.

## Descrição breve — recomendada (<270 caracteres)

Transforme câmeras comuns em uma memória visual pesquisável. O MonitorIA seleciona acontecimentos, organiza evidências e usa IA para ajudar sua empresa a entender o que ocorreu sem enviar a gravação contínua para a nuvem.

## Descrição completa

MonitorIA transforma câmeras de segurança compatíveis em uma memória visual pesquisável para empresas.

O Agent instalado no Windows conecta-se às câmeras ou ao DVR/NVR da sua rede, detecta acontecimentos localmente e envia somente os quadros e clipes selecionados necessários ao serviço. A gravação contínua permanece no ambiente do cliente.

No painel do MonitorIA você pode pesquisar acontecimentos, acompanhar câmeras, consultar evidências, receber descrições geradas por inteligência artificial e usar recursos de inteligência operacional conforme o plano e a configuração de cada câmera.

Recursos de memória curta e continuidade podem correlacionar acontecimentos de forma probabilística usando características visuais amplas, áreas, horários e atividades. O MonitorIA não usa reconhecimento facial para descobrir identidade civil, e correspondências operacionais não confirmam a identidade de uma pessoa.

A edição Microsoft Store funciona por usuário: inicia quando o usuário abre o MonitorIA e pode continuar durante o bloqueio da tela enquanto a sessão estiver ativa. Na primeira abertura, o usuário escolhe explicitamente se deseja iniciar o MonitorIA automaticamente nos próximos logins. Para monitoramento antes do login ou sem usuário conectado, use a edição MonitorIA 24/7 distribuída pelo site oficial.

É necessário possuir conta MonitorIA e um DVR, NVR ou câmera compatível acessível pela rede. A disponibilidade e a qualidade da análise dependem da câmera, rede, energia, iluminação e enquadramento.

O MonitorIA não substitui DVR, NVR, alarmes, vigilância humana, controle de acesso ou procedimentos profissionais de segurança. Resultados de inteligência artificial podem conter erros ou omissões e devem ser confrontados com a gravação original quando uma decisão relevante depender deles.

Consulte privacidade, retenção, subprocessadores e termos em monitoria.cam.

## Recursos / App features

1. Pesquisa de acontecimentos captados pelas suas câmeras.
2. Evidências visuais organizadas com imagens e clipes selecionados.
3. Descrições estruturadas por inteligência artificial.
4. Monitoramento de várias câmeras a partir do mesmo painel.
5. Memória operacional e continuidade visual não biométrica quando habilitadas.
6. Indicadores de saúde do Agent e das câmeras.
7. Assistente para consultar acontecimentos e indicadores da organização.
8. Integração opcional com assistentes externos via MCP, mediante autorização.
9. Gravação contínua permanece no DVR/NVR ou ambiente local do cliente.
10. Autostart da edição Store somente após consentimento explícito do usuário.

## O que há de novo nesta versão

Use somente se esta submissão for uma atualização de uma versão já publicada. Para primeira publicação, deixe o campo vazio conforme orientação do Partner Center.

MonitorIA 1.0.3 consolida o novo Core de monitoramento, melhora o suporte a múltiplas câmeras e segmentos RTSP variáveis, reforça a fila durável e a preservação de evidências durante falhas de rede ou troca de computador, melhora a experiência de reparo e adiciona consentimento explícito para inicialização automática na edição Microsoft Store.

## Palavras-chave — máximo 7

1. análise de câmeras
2. inteligência artificial
3. monitoramento empresarial
4. memória visual
5. segurança empresarial
6. vídeo analytics
7. câmeras com IA

## Requisitos adicionais do sistema

- Conta ativa no MonitorIA.cam.
- Windows 10 ou Windows 11 64 bits.
- Conexão com a internet para sincronização e análise na nuvem.
- DVR, NVR ou câmera compatível acessível pela rede do computador.
- O computador precisa permanecer ligado e com a sessão do usuário ativa para a edição Store monitorar.
- Para funcionamento antes do login, use a edição MonitorIA 24/7 do site oficial.

## Pacote EXE

- Arquivo: `MonitorIA-Store-Setup.exe`
- URL: preencher somente depois de congelar o binário final em URL HTTPS exclusiva e imutável da versão 1.0.3.
- Silent install parameters: `/VERYSILENT /SUPPRESSMSGBOXES /NORESTART /SP-`
- Silent uninstall: validar novamente no RC final antes da submissão.

## Declarações / Properties

- Acessa informações pessoais: Sim.
- Privacy policy URL: https://monitoria.cam/privacidade
- Depende de driver ou NT service não Microsoft: Não, na edição Store.
- Suporte a pen/ink: Não declarar se não houver funcionalidade específica.
- Acessibilidade: não marcar como testada contra uma diretriz formal sem evidência de teste correspondente.

## Notas para certificação — manter abaixo de 2.000 caracteres

O MonitorIA é um cliente Win32 para um serviço web de análise de câmeras. Esta edição da Microsoft Store instala por usuário e não cria Windows Service nem exige privilégio administrativo.

Instalação silenciosa do EXE: /VERYSILENT /SUPPRESSMSGBOXES /NORESTART /SP-

A instalação silenciosa não abre o aplicativo e não cria inicialização automática. Na primeira abertura manual, o MonitorIA pergunta se o usuário deseja iniciar o aplicativo automaticamente nos próximos logins; “Não” é a opção padrão. A preferência pode ser alterada posteriormente pelo atalho “MonitorIA — Inicialização automática”.

Para usar o produto, abra o MonitorIA, conecte o computador à conta com um código temporário gerado no painel https://monitoria.cam e, no painel, execute “Procurar câmeras”. O serviço requer uma conta MonitorIA e uma câmera/DVR/NVR compatível disponível na rede. A gravação contínua permanece no ambiente do cliente; somente evidências selecionadas são enviadas ao serviço.

A edição Store monitora após o login e enquanto a sessão do Windows permanecer ativa, inclusive com tela bloqueada. O produto não depende da edição 24/7, que é uma distribuição separada.

Contato de certificação e suporte: usar os dados da conta empresarial do Partner Center e https://monitoria.cam/contato.

## Capturas de tela

A Microsoft exige 1 screenshot e recomenda 4 ou mais; para a submissão final, preparar 5–8 screenshots de PC, sem dados pessoais reais:

1. Dashboard / visão geral com câmeras online.
2. Acontecimentos com evidências selecionadas.
3. Pesquisa/Assistente em cenário demonstrativo.
4. Tela Câmeras / status operacional.
5. Instalação / escolha 24/7 x Microsoft Store no painel.
6. Tela nativa de conexão por código da edição Store.
7. Diálogo de consentimento para inicialização automática.
8. Configuração de privacidade/retenção ou Perfil e empresa.

## Assets

- Store logo: arte 1:1 obrigatória.
- Poster 2:3: recomendado.
- Screenshots: mínimo 1, recomendado 4+, máximo 10.
- Não usar imagens com acontecimentos de clientes reais sem autorização e sanitização.

## Antes de clicar em Submit

- RC final construído exatamente do commit congelado.
- Teste em máquina/usuário limpo concluído.
- Todas as assinaturas Authenticode + timestamp válidas.
- URL do EXE versionada e imutável, com SHA-256 conferido.
- Privacy/support/terms respondendo publicamente sem login.
- Listing e screenshots coerentes com a versão submetida.
- Age ratings preenchido de acordo com o questionário real do Partner Center.
- Notas para certificação revisadas e abaixo de 2.000 caracteres.
