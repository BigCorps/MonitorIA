import { createClient } from "npm:@supabase/supabase-js@2.110.9";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")??"";
const SERVICE_ROLE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"";
const BANCO_INTER_API_KEY=Deno.env.get("BANCO_INTER_API_KEY")??"";
const BRIDGE_BASE_URL=(Deno.env.get("BANCO_INTER_BRIDGE_BASE_URL")??"https://inter.btsolucao.com.br").replace(/\/$/,"");
const admin=createClient(SUPABASE_URL,SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});

function corsHeaders(request:Request){
  const origin=request.headers.get("origin")??"";
  const allowed=new Set(["https://monitoria.cam","https://www.monitoria.cam","https://vip.monitoria.cam","http://localhost:3000",Deno.env.get("APP_URL")?.replace(/\/$/,"")??""]);
  return {"Access-Control-Allow-Origin":allowed.has(origin)?origin:"https://monitoria.cam","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS",Vary:"Origin"};
}
function json(request:Request,body:Record<string,unknown>,status=200){return new Response(JSON.stringify(body),{status,headers:{...corsHeaders(request),"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}})}
function token(request:Request){return request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim()??""}
function uuid(value:unknown){const v=String(value??"").trim();return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)?v:null}
function objectValue(value:unknown){return value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{} }
async function user(request:Request){const t=token(request);if(!t)return null;const {data,error}=await admin.auth.getUser(t);return error?null:data.user}
async function canManage(org:string,userId:string){const {data,error}=await admin.from("organization_members").select("role").eq("organization_id",org).eq("user_id",userId).maybeSingle();return !error&&["owner","admin"].includes(String(data?.role))}

Deno.serve(async(request:Request)=>{
  if(request.method==="OPTIONS")return new Response("ok",{headers:corsHeaders(request)});
  if(request.method!=="POST")return json(request,{success:false,error:"method_not_allowed"},405);
  let paymentId:string|null=null;
  try{
    if(!BANCO_INTER_API_KEY)return json(request,{success:false,error:"banco_inter_not_configured",message:"A chave do Banco Inter ainda não foi configurada."},503);
    const authUser=await user(request);if(!authUser)return json(request,{success:false,error:"unauthorized"},401);
    const body=await request.json().catch(()=>({}));const invoiceId=uuid((body as Record<string,unknown>).invoice_id);if(!invoiceId)return json(request,{success:false,error:"invalid_invoice_id"},400);
    const {data:invoice,error:invoiceError}=await admin.from("billing_invoices").select("id,organization_id,invoice_number,status,total_cents,currency").eq("id",invoiceId).maybeSingle();
    if(invoiceError||!invoice)return json(request,{success:false,error:"invoice_not_found"},404);
    if(!(await canManage(String(invoice.organization_id),authUser.id)))return json(request,{success:false,error:"not_authorized"},403);
    if(invoice.status==="paid")return json(request,{success:false,error:"invoice_already_paid"},409);

    const expiresAt=new Date(Date.now()+30*60*1000);
    const {data:created,error:createError}=await admin.rpc("create_monitoria_pix_payment",{p_invoice_id:invoiceId,p_actor_user_id:authUser.id,p_expires_at:expiresAt.toISOString()});
    if(createError)return json(request,{success:false,error:"pix_record_creation_failed"},400);
    const local=objectValue(created);paymentId=uuid(local.paymentId);if(!paymentId)throw new Error("payment_id_missing");
    const {data:existing}=await admin.from("billing_pix_payments").select("id,status,txid,amount_cents,pix_copy_paste,qr_code_payload,expires_at").eq("id",paymentId).single();
    if(local.reused===true&&existing?.txid&&existing.pix_copy_paste)return json(request,{success:true,reused:true,payment_id:existing.id,invoice_id:invoiceId,invoice_number:invoice.invoice_number,status:existing.status,txid:existing.txid,pix_code:existing.pix_copy_paste,pix_qrcode:existing.qr_code_payload,expires_at:existing.expires_at,amount_cents:existing.amount_cents,amount:existing.amount_cents/100});

    const amountCents=Number(local.amountCents??invoice.total_cents);
    const response=await fetch(`${BRIDGE_BASE_URL}/cob.php`,{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${BANCO_INTER_API_KEY}`},body:JSON.stringify({amount:{original:(amountCents/100).toFixed(2)},expiresIn:1800,displayText:`MonitorIA.cam - ${invoice.invoice_number}`,modalidadeAlteracao:0}),signal:AbortSignal.timeout(25000)});
    const text=await response.text();let provider:Record<string,unknown>={};try{provider=objectValue(JSON.parse(text))}catch{provider={raw:text.slice(0,2000),httpStatus:response.status}}
    if(!response.ok){await admin.rpc("mark_monitoria_pix_failed",{p_payment_id:paymentId,p_error_code:`provider_http_${response.status}`,p_error_message:"O Banco Inter não aceitou a geração da cobrança.",p_provider_payload:provider});return json(request,{success:false,error:"banco_inter_generation_failed",message:"Não foi possível gerar o Pix agora."},502)}
    const txid=String(provider.txid??"").trim(),pixCode=String(provider.pixCopiaECola??"").trim(),qr=String(provider.qrcode??"").trim();
    if(!txid||!pixCode){await admin.rpc("mark_monitoria_pix_failed",{p_payment_id:paymentId,p_error_code:"provider_response_invalid",p_error_message:"A resposta bancária não trouxe txid ou código Pix.",p_provider_payload:provider});return json(request,{success:false,error:"banco_inter_response_invalid"},502)}
    const {error:attachError}=await admin.rpc("attach_monitoria_pix_provider_data",{p_payment_id:paymentId,p_txid:txid,p_pix_copy_paste:pixCode,p_qr_code_payload:qr,p_provider_payload:provider});
    if(attachError)return json(request,{success:false,error:"pix_persistence_failed"},500);
    return json(request,{success:true,reused:false,payment_id:paymentId,invoice_id:invoiceId,invoice_number:invoice.invoice_number,status:"pending",txid,pix_code:pixCode,pix_qrcode:qr||null,expires_at:String(local.expiresAt??expiresAt.toISOString()),amount_cents:amountCents,amount:amountCents/100});
  }catch(error){console.error("monitoria-create-pix:",error instanceof Error?error.message:String(error));if(paymentId)await admin.rpc("mark_monitoria_pix_failed",{p_payment_id:paymentId,p_error_code:"unexpected_error",p_error_message:"Falha inesperada ao gerar a cobrança Pix.",p_provider_payload:{}});return json(request,{success:false,error:"unexpected_error",message:"Não foi possível gerar o Pix."},500)}
});
