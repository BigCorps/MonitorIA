# Materiais de listagem — Microsoft Store

## Estado

O Agent MonitorIA **1.0.0** está fechado para publicação.

- DVR real: aprovado
- Windows Agent: 1.0.0
- Instalador Store: `MonitorIA-Store-Setup.exe`
- Publicador: `BIGCORPS TECNOLOGIA LTA`
- Site: `https://monitoria.cam`

## Imagens já existentes

| Arquivo | Uso |
|---|---|
| `logo-300x300.png` | logo quadrado da listagem |
| `logo-2160x2160.png` | versão de alta resolução |

## Screenshots

A Store exige pelo menos **1 screenshot**. Para uma listagem melhor, produzir
**4 a 6 imagens reais** depois da validação visual final do onboarding/dashboard.

Sugestão:

1. onboarding / primeiros passos;
2. dashboard com Agent conectado;
3. Pesquisa IA / busca por acontecimento;
4. linha do tempo ou eventos;
5. detalhe de um acontecimento;
6. tela de instalação/pareamento, se fizer sentido visualmente.

Regras internas para as capturas:

- usar somente organização/dados de demonstração;
- não exibir dados reais de clientes;
- não exibir senhas, tokens, e-mails pessoais ou chaves;
- evitar rostos e placas identificáveis;
- usar a interface real de produção;
- manter navegador limpo, sem abas/favoritos pessoais.

## Nome

```text
MonitorIA
```

## Descrição curta

```text
Conecte câmeras IP, DVR e NVR ao MonitorIA e pesquise por texto o que aconteceu no seu negócio.
```

## Descrição longa

```text
O MonitorIA transforma as câmeras de segurança que você já possui em uma
memória visual pesquisável.

O MonitorIA Agent é instalado no computador Windows conectado à mesma rede das
câmeras. Ele encontra equipamentos compatíveis, processa o fluxo necessário ao
monitoramento e conecta o ambiente ao painel MonitorIA.

COMO FUNCIONA

1. Instale o MonitorIA Agent no computador da empresa.
2. Acesse monitoria.cam e conclua o pareamento pelo painel.
3. O Agent encontra câmeras IP, DVR e NVR compatíveis na rede.
4. Acompanhe acontecimentos e pesquise por texto no painel MonitorIA.

REQUISITOS

- Windows 10 versão 1809 ou superior, 64 bits
- computador ligado durante o monitoramento
- acesso à mesma rede do DVR, NVR ou câmeras
- equipamento com fluxo compatível, como RTSP
- conta MonitorIA

PRIVACIDADE

As credenciais das câmeras permanecem no computador onde o Agent está
instalado. Nenhuma credencial de câmera é solicitada pelo instalador da
Microsoft Store.

Política de privacidade: https://monitoria.cam/privacidade
Termos de uso: https://monitoria.cam/termos
Suporte: https://monitoria.cam/contato
```

## Termos de busca

```text
câmera IP, DVR, NVR, RTSP, monitoramento, vigilância, câmeras de segurança, CFTV, eventos, pesquisa por câmera
```

## Conta de demonstração para certificação

Usuário previsto:

```text
reviewer@monitoria.cam
```

Organização:

```text
MonitorIA Review Demo
```

**Não colocar a senha neste repositório.**

Antes do envio:

- definir senha exclusiva;
- testar em janela anônima;
- garantir que a conta não fique bloqueada durante a certificação;
- garantir que o trial não impeça o teste;
- manter somente dados fictícios/sintéticos.

## Notas para certificação

Copiar o bloco abaixo no Partner Center e substituir `<SENHA_DEMO>` somente lá.

```text
MonitorIA conecta câmeras IP, DVR e NVR ao painel web https://monitoria.cam.

O instalador Microsoft Store é um EXE x64 standalone/offline. Ele instala o
serviço Windows "MonitorIAAgent" em C:\Program Files\MonitorIA e requer elevação
UAC porque o serviço roda em segundo plano. A instalação não solicita
credenciais de câmeras.

COMO TESTAR
1. Instale o aplicativo pela Microsoft Store.
2. Acesse https://monitoria.cam/login.
3. Entre com:
   Usuário: reviewer@monitoria.cam
   Senha: <SENHA_DEMO>
4. Use a organização "MonitorIA Review Demo".
5. Abra o fluxo de instalação/pareamento no dashboard e confirme o status do
   Agent.

Não é necessária uma câmera física para validar login, painel e pareamento. A
conta de demonstração usa somente dados sintéticos.

A desinstalação é silenciosa e remove o serviço e o estado local do Agent.

Suporte: https://monitoria.cam/contato
```

## Antes de clicar em Submit

- release `agent-v1.0.0` publicada;
- `MonitorIA-Store-Setup.exe` presente na release;
- URL versionada funcionando;
- assinatura `Valid`;
- screenshots adicionadas;
- logo adicionado;
- conta demo testada;
- senha demo inserida somente nas notas de certificação;
- todas as seções do Partner Center salvas.
