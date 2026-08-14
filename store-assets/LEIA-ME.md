# Materiais de listagem — Microsoft Store

## O que já está nesta pasta

| Arquivo | Uso |
|---|---|
| `logo-300x300.png` | Store logo do Partner Center |
| `logo-2160x2160.png` | reserva para qualquer campo que peça resolução maior |

Ambos derivados de `public/logo.png` (3544×3544).

## O que você precisa produzir

### Screenshots — 4 a 6 imagens

- **PNG**, `1920×1080` (aceito também `1366×768`)
- Mínimo 1, mas listagem com 4 a 6 converte bem melhor
- Capture o navegador em janela limpa, sem barra de favoritos e sem abas
  pessoais visíveis

Sugestão de sequência:

1. Dashboard com câmeras conectadas e eventos recentes
2. Tela de pareamento com o código gerado
3. Linha do tempo / busca de acontecimentos
4. Detalhe de um acontecimento
5. Tela de planos
6. Instalador do Windows na etapa final

**Regras que reprovam:**

- dados reais de clientes — use a organização de demonstração
- rostos ou placas identificáveis nas imagens das câmeras
- capturas que não correspondam ao software real
- logos de terceiros sem autorização

### Conta de demonstração

Obrigatória. O testador da Microsoft precisa entrar no painel.

- Crie uma organização dedicada, com dados fictícios
- Garanta que **não expire** durante a certificação — o trial de 24 h não pode
  derrubar o acesso do testador
- Teste o login em janela anônima antes de submeter
- Preencha usuário e senha nas notas de certificação abaixo

---

## Textos prontos

### Nome

```
MonitorIA
```

### Descrição curta

```
Conecte suas câmeras IP, DVR e NVR ao painel MonitorIA e pesquise o que
aconteceu no seu negócio, por texto, direto no navegador.
```

### Descrição longa

```
O MonitorIA transforma as câmeras de segurança que você já tem em uma memória
visual pesquisável.

O aplicativo instala o MonitorIA Agent, um serviço do Windows que roda no
computador conectado à mesma rede das câmeras. Ele lê o vídeo localmente,
identifica acontecimentos relevantes e envia apenas o resultado para o painel
web, onde você pesquisa por texto.

COMO FUNCIONA

1. Instale o MonitorIA Agent neste computador.
2. Acesse o painel em monitoria.cam, gere um código de pareamento e conecte o
   computador.
3. O Agent encontra as câmeras da rede automaticamente.
4. Pesquise no painel o que aconteceu, de qualquer lugar.

REQUISITOS

- Windows 10 versão 1809 ou superior, 64 bits
- Computador na mesma rede das câmeras, ligado durante o monitoramento
- Câmeras IP, DVR ou NVR com RTSP
- Conta no painel MonitorIA

PRIVACIDADE

O vídeo é processado no seu computador. Nenhuma credencial de câmera é
solicitada durante a instalação. A desinstalação remove o serviço e todo o
estado local, incluindo o pareamento.

Política de privacidade: https://monitoria.cam/privacidade
Termos de uso: https://monitoria.cam/termos
Suporte: https://monitoria.cam/contato
```

### Search terms

```
câmera IP, DVR, NVR, RTSP, monitoramento, vigilância, câmeras de segurança,
CFTV, gravação, eventos
```

### Notas para a certificação

Substitua `<usuario>` e `<senha>` antes de enviar.

```
MonitorIA é um agente Windows que conecta câmeras IP/DVR/NVR ao painel web
MonitorIA (https://monitoria.cam).

INSTALAÇÃO
O instalador da Store é totalmente silencioso e não requer conexão com a
internet durante a instalação. Ele registra o serviço do Windows
"MonitorIAAgent" e instala os arquivos em C:\Program Files\MonitorIA.
Nenhuma credencial de câmera é solicitada durante a instalação.
A elevação (UAC) é necessária porque o serviço roda como LocalSystem.

COMO TESTAR
1. Após a instalação, o serviço MonitorIAAgent estará em execução, aguardando
   pareamento.
2. Acesse https://monitoria.cam/login e entre com a conta de demonstração
   abaixo.
3. No painel, vá em Instaladores e gere um código de pareamento.
4. Volte ao computador e informe o código para conectar.

Não é necessária uma câmera física para validar o app: o pareamento e o painel
funcionam sem ela, e o status de conexão é exibido no dashboard.

CONTA DE DEMONSTRAÇÃO
Usuário: <usuario>
Senha: <senha>
Esta conta está com acesso permanente liberado e não expira.

MONETIZAÇÃO
O app oferece 24 horas gratuitas de monitoramento. Depois desse período o
usuário escolhe um plano no painel web. Todo o processamento de pagamento
ocorre fora da Microsoft Store, conforme permitido para aplicativos MSI/EXE.

DESINSTALAÇÃO
Silenciosa, remove o serviço, os arquivos e todo o estado local em
C:\ProgramData\MonitorIA.

CONTATO
https://monitoria.cam/contato
```
