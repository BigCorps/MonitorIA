# Aplicação — MonitorIA v0.8.1

## 1. Backend

O backend já foi aplicado via MCP.

Não execute manualmente as migrations em produção. Elas acompanham o
patch para manter o repositório reproduzível.

## 2. Repositório

Extraia o ZIP na raiz do projeto:

```bash
cd /workspaces/MonitorIA

npm install --include=dev
npm run check
npm test
npm run build
```

Depois:

```bash
git add .
git commit -m "feat: adiciona perfil editável e eventos específicos v0.8.1"
git push origin main
```

## 3. Agent

Aguarde o GitHub Actions gerar:

```text
monitoria-agent-windows-x64-baseline-v0.8.1
```

Feche o executável anterior e substitua somente o arquivo.

Não execute `reset`.

```powershell
Unblock-File "$env:USERPROFILE\Downloads\monitoria-agent.exe"

& "$env:USERPROFILE\Downloads\monitoria-agent.exe" self-test
& "$env:USERPROFILE\Downloads\monitoria-agent.exe" status
& "$env:USERPROFILE\Downloads\monitoria-agent.exe"
```

## 4. Criar o Perfil v2 da câmera

Abra:

```text
/dashboard/cameras/[cameraId]
```

Ordem recomendada:

1. escolha uma foto com a porta aberta;
2. escreva onde ficam funcionários e clientes;
3. clique em “Gerar nova análise com esta foto”;
4. abra “Editar análise e zonas”;
5. ajuste descrição, objetivos e zonas;
6. marque a zona interna como Funcionários;
7. marque a zona frontal como Clientes;
8. mantenha o tampo/linha do balcão como Área compartilhada;
9. salve como nova versão;
10. confira e aprove.

O Agent sincroniza o perfil aprovado em até cinco minutos ou ao reiniciar.

## 5. Validação

Após aprovar o perfil v2 e iniciar o Agent v0.8.1:

- aguarde pelo menos duas horas de movimento normal;
- confira títulos dos eventos;
- abra pessoas e verifique os papéis;
- acompanhe os novos motivos de encerramento;
- não avalie os papéis de eventos antigos, que permanecem unknown.

Metas:

```text
person_present abaixo de 40%
maximum_duration abaixo de 10%
motion_stopped + capítulos úteis acima de 70%
papel staff/customer útil em mais de 80% das pessoas claramente posicionadas
```
