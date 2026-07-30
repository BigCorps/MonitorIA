// middleware.ts
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PLAN_PROTECTED_ROUTES = [
  '/dashboard/producao',
];

const RESERVED_SUBDOMAINS = [
  'www', 'app', 'api', 'pay', 'admin', 'mail', 'smtp',
  'dashboard', 'login', 'cadastro',
  'precos', 'sobre', 'contato', 'docs', 'blog',
  'para',
];

const CRAWLER_PASSTHROUGH = ['/robots.txt', '/sitemap.xml', '/sitemap.ts'];

const ARTEFINAL_DOMAINS = ['ia.artefinal.app'];

const PIX_DOMAINS = ['pix.wiki', 'www.pix.wiki'];

// ── Min.IA ───────────────────────────────────────────────────────────────
const MINIA_APP_DOMAINS = ['app.min.ia.br'];

// Enquanto o repo da landing (min.ia.br) não existir, redireciona quem
// acessar o apex direto pra ferramenta. REMOVER este array e o bloco que o
// usa quando a landing entrar no lugar (projeto Vercel separado pro apex).
const MINIA_APEX_TEMP_REDIRECT_DOMAINS = ['min.ia.br', 'www.min.ia.br'];

// ── Todos os domínios de subdomínio de cliente ─────────────────────────────
const SUBDOMAIN_DOMAINS = [
  { suffix: '.minhai.com.br',  pattern: /^(.+)\.minhai\.com\.br$/ },
  { suffix: '.minhaia.app',    pattern: /^(.+)\.minhaia\.app$/ },
  { suffix: '.nossaia.app',    pattern: /^(.+)\.nossaia\.app$/ },
  { suffix: '.suaia.app',      pattern: /^(.+)\.suaia\.app$/ },
  { suffix: '.minhai.app',     pattern: /^(.+)\.minhai\.app$/ },
];

function extractSlug(hostname: string): string | null {
  // Dev local: loja.localhost
  if (hostname.includes('.localhost')) {
    return hostname.split('.')[0] || null;
  }
  for (const { pattern } of SUBDOMAIN_DOMAINS) {
    const match = hostname.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function isSubdomainHost(hostname: string): boolean {
  if (hostname.includes('.localhost')) return true;
  return SUBDOMAIN_DOMAINS.some(({ suffix }) =>
    hostname.endsWith(suffix) && !hostname.startsWith('www.')
  );
}

export async function middleware(request: NextRequest) {
  const host = request.headers.get('host') || '';
  const hostname = host.split(':')[0].toLowerCase();
  const pathname = request.nextUrl.pathname;

// ── 0. DOMÍNIO ARTEFINAL.APP ──────────────────────────────────────────────
if (ARTEFINAL_DOMAINS.includes(hostname)) {

if (pathname === '/favicon.ico') {
  const url = request.nextUrl.clone();
  url.pathname = '/brands/artefinal/favicon.png';
  return NextResponse.rewrite(url);
}

if (pathname === '/manifest.json' || pathname === '/manifest.webmanifest') {
  const url = request.nextUrl.clone();
  url.pathname = '/brands/artefinal/manifest.webmanifest';
  return NextResponse.rewrite(url);
}

  // Rewrite raiz → /arte
  if (pathname === '/') {
    const url = request.nextUrl.clone();
    url.pathname = '/arte';
    return NextResponse.rewrite(url);
  }

  // Evita loop: /arte não redireciona de volta para /
  if (pathname === '/arte') {
    // Deixa passar — será tratado abaixo com verificação de sessão
  }

  // Redireciona /arte/login para /arte se já estiver logado
  if (pathname === '/arte/login') {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name) { return request.cookies.get(name)?.value; },
          set() {},
          remove() {},
        },
      }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (user) return NextResponse.redirect(new URL('/arte', request.url));
    return NextResponse.next();
  }

  // Protege /arte: redireciona para /arte/login se não logado
  if (pathname === '/arte') {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name) { return request.cookies.get(name)?.value; },
          set() {},
          remove() {},
        },
      }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.redirect(new URL('/arte/login', request.url));
    return NextResponse.next();
  }
}

// ── 0.05. MIN.IA — redirect temporário do apex pra ferramenta ────────────
// min.ia.br/min.ia.br ainda não tem landing própria (repo separado não
// existe ainda) — manda direto pra ferramenta em app.min.ia.br/min.
// REMOVER quando o repo da landing existir e for configurado como projeto
// Vercel próprio pro apex.
if (MINIA_APEX_TEMP_REDIRECT_DOMAINS.includes(hostname)) {
  const url = request.nextUrl.clone();
  url.hostname = 'app.min.ia.br';
  url.pathname = '/min';
  url.search = '';
  return NextResponse.redirect(url);
}

// ── 0.1. DOMÍNIO APP.MIN.IA.BR (Min.IA) ───────────────────────────────────
if (MINIA_APP_DOMAINS.includes(hostname)) {

  if (pathname === '/favicon.ico') {
    const url = request.nextUrl.clone();
    url.pathname = '/brands/minia/favicon.png';
    return NextResponse.rewrite(url);
  }

  if (pathname === '/manifest.json' || pathname === '/manifest.webmanifest') {
    const url = request.nextUrl.clone();
    url.pathname = '/brands/minia/manifest.webmanifest';
    return NextResponse.rewrite(url);
  }

  // Rewrite raiz → /min (igual o padrão do ArteFinal pra /arte)
  if (pathname === '/') {
    const url = request.nextUrl.clone();
    url.pathname = '/min';
    return NextResponse.rewrite(url);
  }

  // /min NÃO é protegido aqui — a página mostra o carrossel sem login e só
  // pede pra entrar quando o usuário interage com uma função. O gate fica
  // dentro do próprio componente (handleFunctionSelect), não no middleware.

  // Redireciona /min/login para /min se já estiver logado
  if (pathname === '/min/login') {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name) { return request.cookies.get(name)?.value; },
          set() {},
          remove() {},
        },
      }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (user) return NextResponse.redirect(new URL('/min', request.url));
    return NextResponse.next();
  }
}

// ── 0.2. DOMÍNIO PIX.WIKI ────────────────────────────────────────────────
if (PIX_DOMAINS.includes(hostname)) {
  // Se usar www.pix.wiki, redireciona para pix.wiki
  if (hostname === 'www.pix.wiki') {
    const url = request.nextUrl.clone();
    url.hostname = 'pix.wiki';
    return NextResponse.redirect(url);
  }

  // Importante para TWA / Bubblewrap / Play Store
  if (pathname.startsWith('/.well-known/')) {
    return NextResponse.next();
  }

   // Rotas de infra compartilhada (callback de OAuth, Google/Facebook) —
   // nunca prefixar com /pix, senão o retorno do login nunca chega na
   // rota real e a sessão nunca é criada.
   if (pathname.startsWith('/auth/')) {
     return NextResponse.next();
   }

  // Favicon específico do Pix
  if (pathname === '/favicon.ico') {
    const url = request.nextUrl.clone();
    url.pathname = '/brands/pix/favicon.png';
    return NextResponse.rewrite(url);
  }

  // Manifest específico do Pix
  if (pathname === '/manifest.json' || pathname === '/manifest.webmanifest') {
    const url = request.nextUrl.clone();
    url.pathname = '/brands/pix/manifest.webmanifest';
    return NextResponse.rewrite(url);
  }

  // Robots e sitemap continuam normais
  if (CRAWLER_PASSTHROUGH.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Se alguém acessar pix.wiki/pix ou pix.wiki/pix/minha-loja,
  // limpa a URL para pix.wiki ou pix.wiki/minha-loja
  if (pathname === '/pix' || pathname.startsWith('/pix/')) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.replace(/^\/pix/, '') || '/';
    return NextResponse.redirect(url);
  }

  // pix.wiki           → /pix
  // pix.wiki/loja      → /pix/loja
  // pix.wiki/loja/10   → /pix/loja/10
  const url = request.nextUrl.clone();
  url.pathname = pathname === '/' ? '/pix' : `/pix${pathname}`;
  return NextResponse.rewrite(url);
}
  
  // ── 0. PASSTHROUGH PARA CRAWLERS ──────────────────────────────────────────
  if (CRAWLER_PASSTHROUGH.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // ── 0.5. PASSTHROUGH PARA /pay ────────────────────────────────────────────
  if (pathname.startsWith('/pay/')) {
    return NextResponse.next();
  }

  // ── 1. DETECÇÃO DE SUBDOMÍNIO DE CLIENTE ──────────────────────────────────
  if (isSubdomainHost(hostname)) {
    const slug = extractSlug(hostname);

    if (slug && !RESERVED_SUBDOMAINS.includes(slug)) {

      if (pathname === '/favicon.ico') {
        const url = request.nextUrl.clone();
        url.pathname = '/api/favicon';
        url.searchParams.set('slug', slug);
        return NextResponse.rewrite(url);
      }

      if (pathname === '/manifest.json' || pathname === '/manifest.webmanifest') {
        const url = request.nextUrl.clone();
        url.pathname = '/manifest.webmanifest';
        url.searchParams.set('slug', slug);
        return NextResponse.rewrite(url);
      }

      if (pathname === '/sw.js') {
        const url = request.nextUrl.clone();
        url.pathname = '/sw.js';
        url.searchParams.set('slug', slug);
        return NextResponse.rewrite(url);
      }

      const url = request.nextUrl.clone();
      const SPECIAL_ROUTES = ['/vendas', '/fila', '/pay', '/cliente', '/link', '/site'];
      const isSpecialRoute = SPECIAL_ROUTES.some(route => pathname.startsWith(route));

      if (isSpecialRoute) {
        const cleanPath = pathname.endsWith('/') && pathname !== '/' ? pathname.slice(0, -1) : pathname;
        url.pathname = `${cleanPath}/${slug}`;
      } else if (pathname === '/' || pathname === '/ia') {
        url.pathname = `/ia/${slug}`;
        // Sinaliza para o page.tsx se veio da raiz (deve redirecionar) ou de /ia (não redireciona)
        const response = NextResponse.rewrite(url);
        if (pathname === '/') {
          response.headers.set('x-came-from-root', '1');
        }
        return response;
      } else {
        url.pathname = `/ia/${slug}${pathname}`;
      }

      return NextResponse.rewrite(url);
    }
  }

  // ── 2. FLUXO NORMAL ────────────────────────────────────────────────────────
  let response = NextResponse.next({ request: { headers: request.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return request.cookies.get(name)?.value; },
        set(name: string, value: string, options: any) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: any) {
          request.cookies.set({ name, value: '', ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value: '', ...options });
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const isProtectedRoute = pathname.startsWith('/dashboard');

  if (isProtectedRoute && !user) {
    const redirectUrl = new URL('/login', request.url);
    redirectUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (user && pathname === '/login') {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  const requiresPlan = PLAN_PROTECTED_ROUTES.some(route => pathname.startsWith(route));
  if (requiresPlan && user) {
    const { data: credits } = await supabase
      .from('user_credits')
      .select('has_active_plan, plan_expires_at')
      .eq('user_id', user.id)
      .single();

    const hasActivePlan =
      credits?.has_active_plan === true &&
      credits?.plan_expires_at != null &&
      new Date(credits.plan_expires_at) > new Date();

    if (!hasActivePlan) {
      const redirectUrl = new URL('/dashboard/credits', request.url);
      redirectUrl.searchParams.set('requires_plan', '1');
      return NextResponse.redirect(redirectUrl);
    }
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$|api).*)',
  ],
};
