import assert from "node:assert/strict";
import test from "node:test";
import { createHybridSearchV3, hybridOperationEligible, hybridSearchEnabled, type HybridScope } from "../src/assistant/hybrid-search-v3";
import { projectEmbeddingQuery, validEmbedding, isSafeEmbeddingText, estimateEmbeddingCost, EMBEDDING_DIMENSIONS } from "../src/assistant/embedding-v3";
import { processEmbeddingBatchV3 } from "../src/assistant/embedding-worker-v3";
import { planDeterministicallyV2, answerDeterministicallyV2 } from "../src/assistant/deterministic-v2";
import { shouldRecoverEmptySearch } from "../src/assistant/zero-result-recovery";

const plan = planDeterministicallyV2({message:"Mostre objetos ontem",currentDate:"2026-10-10",timezone:"America/Sao_Paulo",
  selectedFrom:null,selectedTo:null,selectedCameraId:null,selectedSiteId:null,directory:{sites:[],cameras:[],zones:[],visualEntities:[],processes:[]},history:[]}).plan;
const op = {...plan.operations[0],kind:"search_events" as const,aggregation:"list" as const};
const scope: HybridScope = {organizationId:"org",from:"2026-10-09",to:"2026-10-10",query:"pacote",cameraId:"camera",siteId:"site",operation:op,limit:12};
const result = (coverage=1,events:any[] = []) => ({total:null,totalIsExact:false,returnedCount:events.length,events,embeddingCoverage:coverage});
const vector = Array.from({length:EMBEDDING_DIMENSIONS},(_,i)=>i===0?1:0);
const embed = async () => ({vectors:[vector],tokens:10,costUsd:estimateEmbeddingCost(10)});

test("rollout requires flag AND explicit organization allowlist",()=>{
  assert.equal(hybridSearchEnabled("org",{}),false);
  assert.equal(hybridSearchEnabled("org",{MONITORIA_ASSISTANT_HYBRID_V3_ENABLED:"true"}),false);
  assert.equal(hybridSearchEnabled("org",{MONITORIA_ASSISTANT_HYBRID_V3_ENABLED:"true",MONITORIA_ASSISTANT_HYBRID_V3_ORGANIZATIONS:"org,other"}),true);
});
test("counts and chronology bypass semantic top-k",()=>{
  for(const aggregation of ["count","rank","peak","first","last","duration"] as const)assert.equal(hybridOperationEligible({...op,aggregation}),false);
  assert.equal(hybridOperationEligible(op),true);
});
test("embedding text sends only allowlisted concepts, never secrets/names/paths/identifiers",()=>{
  const safe=projectEmbeddingQuery("João Silva entregou pacote email@x.com RTSP://secret@10.1.2.3 CPF 12345678910");
  assert.equal(safe,"acontecimento entrega pacote");assert.ok(isSafeEmbeddingText(safe!));
  assert.equal(isSafeEmbeddingText("acontecimento João"),false);
  assert.equal(projectEmbeddingQuery('entrega sem pacote'),null);
  assert.equal(projectEmbeddingQuery('"pacote vermelho"'),null);
  assert.equal(projectEmbeddingQuery('ninguém identificado'),null);
  for(const query of ['nenhuma pessoa entrou','ninguém entregou pacote','nunca houve entrega','nem pacote nem mochila','ausência de criança']) assert.equal(projectEmbeddingQuery(query),null);
});
test("vectors require 768 finite values and nonzero norm",()=>{
  assert.ok(validEmbedding(vector));assert.equal(validEmbedding([1]),false);
  assert.equal(validEmbedding(Array(768).fill(0)),false);assert.equal(validEmbedding([...vector.slice(1),NaN]),false);
});
test("no vectors avoids all OpenAI calls and remains a lexical success",async()=>{
  let calls=0;const search=createHybridSearchV3(async()=>({data:result(0),error:null}),async()=>{calls++;return embed();});
  const found=await search(scope);assert.equal(calls,0);assert.equal(found?.telemetry.fallback,"no_embeddings");
  assert.equal(found?.result.total,null);
});
test("provider outage/timeout degrades once per request, never database failure to zero",async()=>{
  let calls=0;const search=createHybridSearchV3(async()=>({data:result(),error:null}),async()=>{calls++;throw new Error('timeout with private prompt');});
  assert.equal((await search(scope))?.telemetry.fallback,'provider_unavailable');
  await search({...scope,query:'objeto'});assert.equal(calls,1);
  await assert.rejects(createHybridSearchV3(async()=>({data:null,error:{code:'XX000',message:'PRIVATE'}}),embed)(scope),/hybrid_database_unavailable/);
});
test("only explicitly missing v3 RPC falls back to legacy path",async()=>{
  const missing=createHybridSearchV3(async()=>({data:null,error:{code:'PGRST202'}}),embed);
  assert.equal(await missing(scope),null);
  await assert.rejects(createHybridSearchV3(async()=>({data:{error:'not_authorized'},error:null}),embed)(scope),/hybrid_result_invalid/);
});
test("every structured filter is identical in probe and hybrid RPC; dedupe query embeddings per request",async()=>{
  const args:Record<string,unknown>[]=[];let calls=0;
  const search=createHybridSearchV3(async(a)=>{args.push(a);return {data:result(),error:null};},async()=>{calls++;return embed();});
  const constrained={...scope,operation:{...op,zoneId:'zone',eventTypes:['object_removed'],apparentAgeGroup:'child' as const,afterConfirmedClosing:true}};
  const first=await search(constrained);await search(constrained);
  assert.equal(calls,1);assert.equal(first?.telemetry.embeddingTokens,10);
  const {p_embedding:_,...base}=args[0];const {p_embedding:__,...second}=args[1];assert.deepEqual(base,second);
  assert.equal(second.p_zone_id,'zone');assert.equal(second.p_apparent_age_group,'child');assert.equal(second.p_after_confirmed_closing,true);
});
test("new request/tenant cannot reuse another request's query cache",async()=>{
  let calls=0;const rpc=async()=>({data:result(),error:null});const provider=async()=>{calls++;return embed();};
  await createHybridSearchV3(rpc,provider)(scope);await createHybridSearchV3(rpc,provider)({...scope,organizationId:'other'});assert.equal(calls,2);
});
test("bounded to three unique query embeddings in compound requests",async()=>{
  let calls=0;const search=createHybridSearchV3(async()=>({data:result(),error:null}),async()=>{calls++;return embed();});
  for(const query of ['pacote','pessoa','animal','objeto'])await search({...scope,query});assert.equal(calls,3);
});
test("second RPC database error is technical failure even after successful embedding",async()=>{
  let calls=0;const search=createHybridSearchV3(async()=>++calls===1?{data:result(),error:null}:{data:null,error:{code:'57014'}},embed);
  await assert.rejects(search(scope),/hybrid_database_unavailable/);
});
test("semantic selections never become exact counts or visual confirmations",()=>{
  const payload=result(1,[{id:'event',headline:'Texto infantil',cameraName:'Entrada'}]);
  const answer=answerDeterministicallyV2({message:'pacote',plan:{...plan,operations:[op]},retrievedData:{operationResults:{[op.id]:payload},coverage:{dataState:'NO_COVERAGE'}},allowedEvidenceIds:[]});
  assert.match(answer.answer,/não é uma contagem total/);assert.match(answer.answer,/não confirma uma detecção visual/);assert.match(answer.caution ?? '',/cobertura/);
  assert.equal(shouldRecoverEmptySearch({...plan,operations:[op]}, {retrievedData:{operationResults:{[op.id]:result()}},coverage:{},candidateEvidenceIds:[]}),false);
});
test("worker OFF performs zero calls, failure retries via lease RPC, invalid vector never written",async()=>{
  let calls=0;const rpc=async()=>{calls++;return {data:[],error:null};};
  await processEmbeddingBatchV3({rpc,enabled:false});assert.equal(calls,0);
  const writes:Record<string,unknown>[]=[];
  const workerRpc=async(name:string,args:Record<string,unknown>)=>{
    if(name==='assistant_claim_embedding_jobs_v3')return {data:[{eventId:'event',organizationId:'org',sourceHash:'hash',text:'acontecimento pacote',leaseToken:'lease'}],error:null};
    writes.push(args);return {data:false,error:null};
  };
  const metrics=await processEmbeddingBatchV3({enabled:true,rpc:workerRpc,embed:async()=>({vectors:[[1]],tokens:1,costUsd:0})});
  assert.equal(metrics.failed,1);assert.equal(writes[0].p_embedding,null);assert.equal(writes[0].p_source_hash,'hash');
});
test("batch commits consume ordered vectors and report stale CAS separately",async()=>{
  const seen:any[]=[];const metrics=await processEmbeddingBatchV3({enabled:true,embed,rpc:async(name,args)=>{
    if(name==='assistant_claim_embedding_jobs_v3')return {data:[{eventId:'e',organizationId:'org',text:'acontecimento entrega',sourceHash:'h',leaseToken:'l'}],error:null};
    seen.push(args);return {data:false,error:null};
  }});
  assert.equal(metrics.stale,1);assert.equal(metrics.failed,0);assert.equal(metrics.tokens,10);
  assert.deepEqual(JSON.parse(seen[0].p_embedding),vector);
});
