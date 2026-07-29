# MonitorIA Agent v0.7.2

Agent local para Windows responsável por acessar a câmera RTSP, proteger as
credenciais com DPAPI e transformar movimento em eventos visuais estruturados.

## Privacidade por arquitetura

O vídeo contínuo permanece no computador local. O Agent usa uma conexão FFmpeg
em baixa resolução e escala de cinza para medir movimento. Somente quando um
evento é formado são capturados até três JPEGs completos:

1. início;
2. maior pico de movimento;
3. encerramento.

Esses quadros são enviados ao MonitorIA para análise com o perfil aprovado.

## Compatibilidade

O executável é compilado com `bun-windows-x64-baseline`, destinado a CPUs x64
sem AVX2 que possuam SSE4.2.

## Comandos

```powershell
.\monitoria-agent.exe
.\monitoria-agent.exe status
.\monitoria-agent.exe reset
.\monitoria-agent.exe self-test
```

## Funcionamento contínuo

- sincroniza a configuração a cada 5 minutos;
- observa a câmera no intervalo configurado;
- inicia um evento quando o percentual de pixels alterados supera o limite;
- mantém o evento aberto enquanto houver movimento;
- fecha após o período de silêncio configurado;
- mantém uma fila em memória de até 10 eventos;
- envia eventos sequencialmente, com até 3 tentativas;
- informa o tamanho da fila no heartbeat;
- não cria evento de timeline quando a IA retorna `no_relevant_change`.

## Configuração local

A configuração é salva preferencialmente em:

```text
%PROGRAMDATA%\MonitorIA\agent.json
```

Caso a pasta exija permissão administrativa:

```text
%LOCALAPPDATA%\MonitorIA\agent.json
```

## Atualização da v0.5.5

A configuração e o pareamento existentes são compatíveis. Basta fechar o
executável antigo e executar o `monitoria-agent.exe` v0.7.2. Não é necessário
gerar um novo código de pareamento.
