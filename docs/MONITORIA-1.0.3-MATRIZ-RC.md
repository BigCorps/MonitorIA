# MonitorIA 1.0.3 — Matriz real de Release Candidate

Use somente artifacts da **mesma execução** de `Build MonitorIA 1.0.3 Release Candidate` e confira o `commit` no `MANIFEST-RC.json`.

## Travas durante toda a matriz

- não criar `agent-v1.0.3`;
- não alterar o download público 1.0.2;
- não trocar `AGENT_RECOMMENDED_VERSION` para 1.0.3;
- não configurar `MONITORIA_STORE_PUBLIC_URL`;
- não enviar nada à Microsoft antes de todos os blocos abaixo ficarem aprovados.

## A. Integridade dos artifacts

- [ ] Os quatro artifacts vieram do mesmo `run_id` e mesmo commit.
- [ ] SHA256 local confere com `SHA256SUMS.txt`/manifesto.
- [ ] `MonitorIA-Setup.exe` tem assinatura válida e timestamp.
- [ ] `MonitorIA-Store-Setup.exe` tem assinatura válida e timestamp.
- [ ] O instalador Store não instala WinSW, XML de serviço nem `MonitorIAAgent`.
- [ ] O instalador 24/7 contém tray companion e Service Host.

## B. Windows Store — instalação nova

Máquina/usuário limpo, sem estado anterior em `%LOCALAPPDATA%\MonitorIA`.

- [ ] Instalação interativa conclui sem UAC administrativo obrigatório.
- [ ] MonitorIA aparece no Menu Iniciar.
- [ ] Primeira abertura exibe a conexão quando ainda não pareado.
- [ ] Código inválido mostra erro e não grava estado inválido.
- [ ] Código válido conecta o computador.
- [ ] Duas câmeras ficam pareadas e simultaneamente operacionais.
- [ ] Fechar a janela mantém o MonitorIA no tray.
- [ ] Dashboard/navegador fechado não interrompe o monitoramento.
- [ ] Lock/unlock mantém o monitoramento.
- [ ] Logoff encerra Desktop Host/Core como esperado.
- [ ] Login seguinte inicia novamente por HKCU autostart.
- [ ] Reboot parado na tela de login não promete monitoramento.
- [ ] Login após reboot inicia o MonitorIA automaticamente.

## C. Windows Store — upgrade e reparo

- [ ] Upgrade sobre uma instalação pareada preserva `%LOCALAPPDATA%\MonitorIA`.
- [ ] Upgrade saudável não solicita novo código.
- [ ] Duas câmeras continuam funcionando depois do upgrade.
- [ ] Token realmente revogado/inutilizável faz a interface oferecer reparo.
- [ ] Novo código restaura o pareamento sem apagar configuração antes da aceitação do servidor.
- [ ] Desinstalação explícita remove somente o estado da edição Store daquele usuário.
- [ ] A desinstalação Store não encerra por nome uma eventual edição 24/7 coexistente.

## D. Windows 24/7 — instalação nova

Máquina limpa ou VM dedicada.

- [ ] Instalação pede elevação administrativa de forma esperada.
- [ ] Serviço `MonitorIAAgent` é criado e inicia.
- [ ] Pareamento novo funciona.
- [ ] Duas câmeras ficam simultaneamente operacionais.
- [ ] Tray aparece depois do login.
- [ ] Fechar apenas o tray não para o Windows Service.
- [ ] Reabrir MonitorIA pelo Menu Iniciar restaura a interface/tray.
- [ ] Reboot confirma que o serviço inicia antes do login.
- [ ] Após login, tray volta e representa o serviço já ativo.

## E. Windows 24/7 — upgrade 1.0.2 -> 1.0.3

- [ ] Começar de uma instalação real 1.0.2 pareada.
- [ ] Registrar baseline: câmeras, pareamento e estado antes do upgrade.
- [ ] Executar `MonitorIA-Setup.exe` 1.0.3 por cima.
- [ ] `%PROGRAMDATA%\MonitorIA` é preservado.
- [ ] Upgrade saudável não pede código novamente.
- [ ] Serviço retorna a `Running`.
- [ ] Tray 1.0.3 aparece após login.
- [ ] Duas câmeras continuam operacionais.
- [ ] Reboot pós-upgrade preserva tudo.

## F. Evidências e regressões funcionais — duas câmeras

Executar com as duas câmeras reais ativas.

- [ ] Acontecimento em câmera A não bloqueia câmera B.
- [ ] Acontecimento em câmera B não bloqueia câmera A.
- [ ] Fotos `start/peak/extra/end` pertencem ao mesmo intervalo do evento.
- [ ] Vídeo cobre o intervalo canônico com margens esperadas.
- [ ] Vídeo parcial/incompleto não aparece como completo.
- [ ] Fila durável sobrevive a indisponibilidade temporária de rede.
- [ ] Evento importante é persistido antes de processamento pesado.
- [ ] Evento com retries esgotados não envenena os itens posteriores da fila.
- [ ] Abertura/fechamento só usa horário exato quando houve transição visível real.
- [ ] Quando não houve transição visível, a UI usa intervalo/“aproximadamente”.
- [ ] Movimento estrutural lento de porta/portão/persiana configurada é reconhecido.
- [ ] Atividade fora do horário recebe prioridade sem inventar intenção/crime.

## G. Pressão de disco e recuperação

- [ ] Estado normal com espaço suficiente.
- [ ] Aviso de atenção abaixo do limiar configurado.
- [ ] Sob pressão, fila durável e evidências não enviadas são preservadas.
- [ ] Timeline descartável antiga é removida antes de evidência crítica.
- [ ] Vídeo ameaçado/suspenso é comunicado sem mascarar como completo.
- [ ] Após liberar espaço, operação se recupera sem novo pareamento.

## H. Linux x64

- [ ] Pacote instala em host/VM x64 compatível.
- [ ] Serviço systemd habilita e inicia.
- [ ] Pareamento funciona.
- [ ] Reinício do serviço preserva estado.
- [ ] Reboot do Linux preserva estado e autostart.
- [ ] Reinstalação/upgrade preserva `/var/lib/monitoria`.
- [ ] Câmeras e evidências usam o mesmo contrato do Core 1.0.3.

## I. Linux arm64

- [ ] Repetir o bloco H em host/VM arm64 real ou ambiente equivalente confiável.

## J. Fechamento da RC

Só marcar a RC como aprovada quando:

- [ ] todos os blocos aplicáveis estão verdes;
- [ ] não há regressão funcional entre 24/7, Store e Linux;
- [ ] hashes/assinaturas foram arquivados;
- [ ] evidências de instalação/upgrade/reboot/pareamento foram guardadas;
- [ ] nenhuma trava de publicação foi antecipada.

Depois disso, a próxima etapa é a publicação controlada: preparar a tag `agent-v1.0.3`, atualizar o canal público somente no momento correto e montar o pacote que será reenviado à Microsoft. `MONITORIA_STORE_PUBLIC_URL` continua vazio até existir uma listagem Microsoft realmente aprovada/publicável.
