import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function read(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("landing VIP notifica vendedor e confirma recebimento ao lead", async () => {
  const [action, notification] = await Promise.all([
    read("app/vip/landing/actions.ts"),
    read("src/lib/vip-lead-notification.ts"),
  ]);

  assert.match(action, /notifyVipLeadRequest/);
  assert.match(action, /select\("name,email"\)/);
  assert.match(notification, /https:\/\/api\.resend\.com\/emails/);
  assert.match(notification, /RESEND_API_KEY/);
  assert.match(notification, /RESEND_FROM/);
  assert.match(notification, /MonitorIA <\$\{email\}>/);
  assert.match(notification, /Novo interesse/);
  assert.match(notification, /Recebemos seu interesse no MonitorIA VIP/);
  assert.match(notification, /to: sellerEmail/);
  assert.match(notification, /to: input\.leadEmail/);
});

test("falha de email não invalida lead já salvo", async () => {
  const action = await read("app/vip/landing/actions.ts");
  assert.match(action, /vip_lead_seller_email/);
  assert.match(action, /vip_lead_confirmation_email/);
  assert.match(action, /successRedirect\(\)/);
});

test("Admin Clientes possui entrada direta para a carteira VIP", async () => {
  const page = await read("app/dashboard/admin/customers/page.tsx");
  assert.match(page, /title: "MonitorIA VIP"/);
  assert.match(page, /href: "\/comercial\/vip"/);
  assert.match(page, /Nova apresentação/);
});
