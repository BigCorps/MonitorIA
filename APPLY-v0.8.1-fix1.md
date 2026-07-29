# Correção v0.8.1 — fix 1

O backend não precisa de nenhuma alteração.

Extraia este ZIP na raiz do projeto e execute:

```bash
cd /workspaces/MonitorIA

npm run check
npm test
npm run build
```

Quando os três comandos passarem:

```bash
git add .
git commit -m "fix: corrige validação da v0.8.1"
git push origin main
```

Não execute `npm audit fix --force`. Esse comando pode instalar versões
incompatíveis. As vulnerabilidades devem ser analisadas separadamente
depois que o build estiver estável.
