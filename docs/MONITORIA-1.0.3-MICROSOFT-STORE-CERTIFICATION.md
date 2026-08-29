# MonitorIA 1.0.3 — Auditoria para Microsoft Store (Win32 EXE)

## Estado

Pré-certificação atualizada após a Fase 05B8. **Não publicar, não criar `agent-v1.0.3`, não alterar o download público 1.0.2, não configurar `MONITORIA_STORE_PUBLIC_URL` e não enviar ao Partner Center** até o RC final, teste limpo e URL imutável serem fechados.

## FECHADO no código/CI

- `MonitorIA-Store-Setup.exe` é a distribuição Store.
- Instalação por usuário em `%LOCALAPPDATA%\Programs\MonitorIA`.
- Sem Windows Service e sem privilégio administrativo no canal Store.
- Core, Desktop Host, DPAPI e launcher de consentimento passam por assinatura no pipeline.
- Setup e uninstaller passam pelo SignTool do Inno e são verificados com Authenticode + timestamp.
- FFmpeg/ffprobe/DLLs distribuídos são validados no pipeline.
- Instalador é autônomo/offline; não é downloader do aplicativo principal.
- Silent install testado pelo workflow com `/VERYSILENT /SUPPRESSMSGBOXES /NORESTART /SP-`.
- Silent install não abre processo MonitorIA e não cria autostart.
- Autostart só é criado após consentimento explícito na primeira abertura; “Não” é padrão.
- Preferência de autostart pode ser alterada depois e é removida no uninstall.
- Upgrade preserva escolha previamente consentida sem transformar atualização em consentimento implícito.
- Desinstalação Store não encerra o Agent 24/7 por nome.
- Unicode/acentuação dos hosts nativos é verificada no PE.
- Store e 24/7 usam o mesmo Core 1.0.3.
- Retenção durável de vídeo associado à fila foi endurecida na 05B6.3.
- Fila antiga após troca de Agent foi recuperada sem duplicação na 05B6.2.1.
- Guard de texto gerado impede escapes Latin-1 conhecidos em headline/summary.
- Wizard de troca/reparo preserva as câmeras existentes no cenário homologado.

## PRIVACIDADE PÚBLICA — FECHADO

O repositório já possuía rotas públicas, e a 05B8 as atualiza para refletir o produto 1.0.3 atual:

- `/privacidade` — política de privacidade;
- `/seguranca-e-privacidade` — desenho técnico, limites e continuidade não biométrica;
- `/retencao` — política e valores padrão atuais;
- `/subprocessadores` — Supabase, Vercel, OpenAI e Microsoft Clarity;
- `/excluir-conta` — solicitação pública de exclusão;
- `/termos` — termos de uso;
- `/contato` — suporte/contato público.

A política agora descreve memória curta e perfis operacionais probabilísticos sem alegar que o produto “não mantém continuidade entre eventos”. O texto deixa explícito que não há reconhecimento facial para identidade civil e que correlações de aparência/área/horário/atividade não confirmam identidade.

Prazos padrão atualmente refletidos na documentação pública: 3 dias para frame temporário, 365 dias para keyframe, 365 dias para metadados, 30 dias para clipe preservado; saúde bruta do Agent normalmente 7 dias, com rollup horário até 365 dias. A política efetiva pode variar conforme plano, snapshot de retenção, classe do dado e preservação válida.

## LISTING — PREPARADO

O arquivo `docs/MONITORIA-1.0.3-MICROSOFT-STORE-LISTING-PT-BR.md` contém:

- descrição breve e completa;
- recursos;
- requisitos adicionais;
- palavras-chave;
- URLs públicas;
- categoria recomendada `Empresas > Dados + análises`;
- recomendação de modelo de preço `Assinatura`, coerente com serviço recorrente;
- parâmetros silenciosos;
- notas para certificação;
- roteiro de 5–8 screenshots.

O preenchimento do Partner Center deve usar os dados reais exibidos no formulário e não converter recomendações deste documento em declarações não comprovadas.

## Workflow RTSP legado — LIMPO

O arquivo experimental `build-agent-rtsp-sampler-test.yml` estava reduzido a comentários e o GitHub Actions criava um run vermelho com zero jobs ao tocar o repositório. A 05B8 o transforma em workflow válido, somente manual, que explica que o sampler foi aposentado na 1.0.2. Ele não compila nem publica nada e não roda em `push`.

## PENDENTE antes da submissão

### 1. Gerar RC final do commit congelado

Depois do 05B8 verde:

- confirmar commit final e deploy web READY;
- disparar `Build MonitorIA 1.0.3 Release Candidate` manualmente;
- exigir Contract + Windows + Linux x64 + Linux arm64 + Manifest verdes;
- registrar run ID, commit, artifact IDs e SHA-256.

### 2. Prova Store em máquina/usuário limpo

Com o artifact final:

- silent install retorna sucesso sem UI/processo/autostart;
- primeira abertura manual exibe consentimento de autostart;
- validar caminho “Não” e ausência de Run após novo login;
- habilitar pelo atalho de configuração e validar “Sim” após logout/login;
- validar conexão/pareamento, duas câmeras, lock/unlock, fechamento/reabertura;
- validar uninstall e isolamento da edição 24/7;
- conferir assinatura + timestamp dos PEs e uninstaller instalados.

### 3. URL HTTPS versionada e imutável

Somente depois do binário aprovado:

- hospedar `MonitorIA-Store-Setup.exe` em URL HTTPS exclusiva da 1.0.3;
- conferir SHA-256 baixado contra o manifesto RC;
- nunca substituir bytes no mesmo URL;
- preencher URL e parâmetros no Partner Center;
- configurar `MONITORIA_STORE_PUBLIC_URL` somente no momento de publicação planejado.

### 4. Partner Center

Preencher e conferir:

- disponibilidade, mercados, descobribilidade e preço;
- categoria/subcategoria;
- acesso a informações pessoais = Sim;
- URL de privacidade;
- contatos da conta empresarial;
- age rating;
- EXE x64 e parâmetros silenciosos;
- descrição, features, logo 1:1, screenshots e termos;
- notas de certificação.

## Ordem final

1. 05B8 verde e deploy web confirmado.
2. RC final assinado do mesmo commit.
3. Teste Store em ambiente limpo.
4. Congelar SHA-256 e URL HTTPS imutável.
5. Preencher Partner Center usando o listing preparado.
6. Somente depois decidir tag `agent-v1.0.3`, release, recomendação pública e submissão/atualização na Store.
