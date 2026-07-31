# MonitorIA.cam v0.8.2

**Sua câmera vê. A IA lembra.**

O MonitorIA.cam transforma câmeras de segurança comuns em uma memória visual pesquisável. O vídeo contínuo permanece no local; somente quadros selecionados de acontecimentos são enviados para análise.

## Recursos atuais

- Agent Windows e segmentação por capítulos;
- modos Econômico, Equilibrado e Detalhado;
- perfil inteligente editável;
- eventos estruturados e revisáveis;
- exportação completa em Markdown e JSON;
- pesquisa conversacional com GPT-5 nano;
- evidências clicáveis e gráficos;
- histórico privado de conversas;
- página Instalador com saúde do Agent;
- auditoria, custos e retenção.

## SEO e GEO

A aplicação inclui:

- metadados canônicos para `https://monitoria.cam`;
- Open Graph e Twitter Image dinâmicos;
- `robots.txt` e `sitemap.xml` gerados pelo Next.js;
- páginas privadas marcadas como `noindex`;
- JSON-LD de Organization, WebSite e SoftwareApplication;
- FAQ com dados estruturados;
- páginas institucionais e páginas focadas em intenções de busca.

Consulte `SEO-GEO-APLICACAO.md` antes do deploy.

## Validação

```bash
npm install --include=dev
npm run check
npm test
npm run build
```
