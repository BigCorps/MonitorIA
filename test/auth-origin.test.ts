import assert from "node:assert/strict";
import test from "node:test";
import {
  AUTH_CANONICAL_HOST,
  AUTH_CANONICAL_ORIGIN,
  authCallbackUrl,
  canonicalAuthUrl,
} from "../src/lib/auth-origin.js";

/*
 * Testes de regressão da origem de autenticação.
 *
 * O que estamos protegendo: OAuth e WebAuthn são amarrados à origem do
 * navegador. Se qualquer um destes testes voltar a falhar, o sintoma no
 * usuário é "o Google autentica e devolve para a landing" ou
 * "The RP ID monitoria.cam is invalid for this domain".
 */

test("a origem canônica é monitoria.cam", () => {
  assert.equal(AUTH_CANONICAL_ORIGIN, "https://monitoria.cam");
  assert.equal(AUTH_CANONICAL_HOST, "monitoria.cam");
});

test("o host canônico não é redirecionado", () => {
  assert.equal(canonicalAuthUrl("https://monitoria.cam/login"), null);
  assert.equal(
    canonicalAuthUrl("https://monitoria.cam/dashboard?a=1#b"),
    null,
  );
});

test("www canonicaliza preservando path, query e hash", () => {
  assert.equal(
    canonicalAuthUrl("https://www.monitoria.cam/login?next=%2Fdashboard"),
    "https://monitoria.cam/login?next=%2Fdashboard",
  );
  assert.equal(
    canonicalAuthUrl("https://www.monitoria.cam/foo?a=1#secao"),
    "https://monitoria.cam/foo?a=1#secao",
  );
});

test("o domínio antigo também canonicaliza", () => {
  // Este é o buraco que existia: o helper antigo devolvia `true` para
  // qualquer host desconhecido, então o fluxo simplesmente seguia na
  // origem errada.
  assert.equal(
    canonicalAuthUrl("https://monitoria.bigcorps.com.br/login"),
    "https://monitoria.cam/login",
  );
  assert.equal(
    canonicalAuthUrl("https://qualquer-outro-dominio.com/login?x=1"),
    "https://monitoria.cam/login?x=1",
  );
});

test("previews da Vercel não são forçados para produção", () => {
  assert.equal(
    canonicalAuthUrl("https://monitoria-git-branch-bigcorps.vercel.app/login"),
    null,
  );
});

test("desenvolvimento local não é forçado para produção", () => {
  assert.equal(canonicalAuthUrl("http://localhost:3000/login"), null);
  assert.equal(canonicalAuthUrl("http://127.0.0.1:3000/login"), null);
});

test("http no domínio canônico é promovido a https", () => {
  assert.equal(
    canonicalAuthUrl("http://www.monitoria.cam/login"),
    "https://monitoria.cam/login",
  );
});

test("o callback de OAuth é sempre absoluto e canônico", () => {
  assert.equal(
    authCallbackUrl("/dashboard"),
    "https://monitoria.cam/auth/callback?next=%2Fdashboard",
  );
  assert.equal(
    authCallbackUrl("/dashboard/profile"),
    "https://monitoria.cam/auth/callback?next=%2Fdashboard%2Fprofile",
  );
});

test("o callback nunca aponta para fora da origem canônica", () => {
  const url = new URL(authCallbackUrl("/dashboard"));

  assert.equal(url.origin, AUTH_CANONICAL_ORIGIN);
  assert.equal(url.pathname, "/auth/callback");
});

test("URL inválida não derruba a canonicalização", () => {
  assert.equal(canonicalAuthUrl("nao-e-uma-url"), null);
});
