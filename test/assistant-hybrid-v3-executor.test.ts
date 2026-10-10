import assert from "node:assert/strict";
import test from "node:test";
import { executeAssistantPlanV2 } from "../src/assistant/executor-v2";
import { planDeterministicallyV2 } from "../src/assistant/deterministic-v2";
import type { AssistantDirectoryV2 } from "../src/assistant/v2-contracts";

const site="11111111-1111-4111-8111-111111111111",camera="22222222-2222-4222-8222-222222222222",zone="33333333-3333-4333-8333-333333333333";
const eventId="44444444-4444-4444-8444-444444444444";
const directory:AssistantDirectoryV2={sites:[{id:site,name:'Centro',timezone:'America/Sao_Paulo'}],cameras:[{id:camera,name:'Entrada',siteId:site,sourceKind:'live_camera'}],zones:[{id:zone,name:'Área Restrita',siteId:site,cameraId:camera,zoneType:'restricted',description:'',personRoleHint:null}],visualEntities:[],processes:[]};
const plan=(message:string,history:any[]=[])=>planDeterministicallyV2({message,currentDate:'2026-10-10',timezone:'America/Sao_Paulo',selectedFrom:null,selectedTo:null,selectedCameraId:null,selectedSiteId:null,directory,history}).plan;

test("planner keeps composite operations, periods and follow-ups before hybrid execution",()=>{
  const previous=plan('Quero ver crianças na câmera Entrada nos últimos 7 dias');
  const follow=plan('Viu crianças?',[{role:'user',content:'Quero ver crianças na câmera Entrada nos últimos 7 dias'},{role:'assistant',content:'Consulta concluída',plan:previous}]);
  assert.equal(follow.legacyPlan.fromDate,previous.legacyPlan.fromDate);assert.equal(follow.operations[0].cameraId,camera);
  assert.equal(follow.operations[0].apparentAgeGroup,'child');
  const compound=plan('Quantos clientes vieram ontem, qual câmera teve mais movimento e teve algo depois do fechamento?');
  assert.ok(compound.operations.length>=3);assert.equal(compound.legacyPlan.fromDate,'2026-10-09');
  assert.equal(plan('Mostre eventos da Área Restrita hoje').operations[0].zoneId,zone);
});

test("flag OFF keeps legacy RPC and evidence behavior; gated composite searches stay inside one execution",async()=>{
  const oldFlag=process.env.MONITORIA_ASSISTANT_HYBRID_V3_ENABLED;
  const oldOrgs=process.env.MONITORIA_ASSISTANT_HYBRID_V3_ORGANIZATIONS;
  try {
    const base=plan('Mostre eventos da Área Restrita hoje');
    const searchOp={...base.operations[0],kind:'search_events' as const,aggregation:'list' as const,zoneId:zone};
    const calls:Array<{name:string;args:any}>=[];
    const supabase={rpc(name:string,args:any){
      calls.push({name,args});
      const data=name==='assistant_coverage_summary_v2'?{dataState:'AVAILABLE'}:
        name==='assistant_hybrid_event_search_v3'?{events:[{id:eventId}],total:null,totalIsExact:false,returnedCount:1,embeddingCoverage:0}:
        {total:1,events:[{id:eventId}]};
      return {abortSignal:()=>Promise.resolve({data,error:null}),then:(resolve:any,reject:any)=>Promise.resolve({data,error:null}).then(resolve,reject)};
    }};
    process.env.MONITORIA_ASSISTANT_HYBRID_V3_ENABLED='false';
    const input={supabase,organizationId:'org',plan:{...base,operations:[searchOp]},fromIso:'2026-10-09',toIso:'2026-10-10',compareFromIso:null,compareToIso:null};
    const legacy=await executeAssistantPlanV2(input);
    assert.ok(calls.some(c=>c.name==='assistant_structured_event_search_v3'));
    assert.ok(!calls.some(c=>c.name==='assistant_hybrid_event_search_v3'));
    assert.deepEqual(legacy.candidateEvidenceIds,[]); // identical to pre-v3 collector for bare id fields
    calls.length=0;
    process.env.MONITORIA_ASSISTANT_HYBRID_V3_ENABLED='true';process.env.MONITORIA_ASSISTANT_HYBRID_V3_ORGANIZATIONS='org';
    const hybrid=await executeAssistantPlanV2({...input,plan:{...base,operations:[searchOp,{...searchOp,id:'second',cameraId:camera}]}});
    assert.equal(calls.filter(c=>c.name==='assistant_hybrid_event_search_v3').length,2);
    assert.ok(calls.filter(c=>c.name==='assistant_hybrid_event_search_v3').every(c=>c.args.p_zone_id===zone));
    assert.deepEqual(hybrid.candidateEvidenceIds,[eventId]);
    calls.length=0;
    await executeAssistantPlanV2({...input,plan:{...base,operations:[{...searchOp,aggregation:'count'}]}});
    assert.ok(!calls.some(c=>c.name==='assistant_hybrid_event_search_v3'));
  } finally {
    if(oldFlag===undefined)delete process.env.MONITORIA_ASSISTANT_HYBRID_V3_ENABLED;else process.env.MONITORIA_ASSISTANT_HYBRID_V3_ENABLED=oldFlag;
    if(oldOrgs===undefined)delete process.env.MONITORIA_ASSISTANT_HYBRID_V3_ORGANIZATIONS;else process.env.MONITORIA_ASSISTANT_HYBRID_V3_ORGANIZATIONS=oldOrgs;
  }
});
