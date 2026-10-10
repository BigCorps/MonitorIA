/** Offline PostgreSQL/pgvector eval. NEVER connects to Supabase/OpenAI. */
import { readFile, writeFile } from "node:fs/promises";
import { createHybridFixture, asUser, searchFixture, vector768, uuid, ORG, CAM, SITE } from "../test/support/assistant-hybrid-db";

const db=await createHybridFixture();
const percentile=(values:number[],p:number)=>[...values].sort((a,b)=>a-b)[Math.min(values.length-1,Math.floor(values.length*p))];
try {
  const matrix=JSON.parse(await readFile('test/fixtures/assistant-hybrid-v3-matrix.json','utf8'));
  const report:any={label:'Offline synthetic vectors; NOT OpenAI semantic relevance or production latency',questions:matrix.length,methods:{},scale:{}};
  for(const mode of ['lexical','hybrid']) {
    const latencies:number[]=[];let relevant=0,retrieved=0,gold=0,exact=0,zero=0,recovered=0,recallSum=0;
    for(const item of matrix) {
      const args={...item.args};if(mode==='hybrid' && item.axis!==null)args.p_embedding=vector768(item.axis);
      let result:any;const start=performance.now();await asUser(db,async()=>{result=await searchFixture(db,args);});latencies.push(performance.now()-start);
      const ids=new Set(result.events.map((e:any)=>e.id));const expected=new Set(item.expected.map(uuid));
      const hits=[...ids].filter(id=>expected.has(id)).length;
      relevant+=hits;retrieved+=ids.size;gold+=expected.size;
      recallSum+=expected.size?hits/expected.size:(ids.size===0?1:0);
      if(ids.size===expected.size && hits===expected.size)exact++;
      if(!ids.size)zero++;
      if(mode==='hybrid' && item.axis!==null) {
        const baseline=await asUser(db,()=>searchFixture(db,item.args)) as any;
        if(!baseline.returnedCount && hits>0)recovered++;
      }
    }
    report.methods[mode]={precision:retrieved?relevant/retrieved:1,recall:gold?relevant/gold:1,macroRecallAt50:recallSum/matrix.length,
      falsePositives:retrieved-relevant,exactCases:exact,zeroResultCases:zero,recoveredEmptyCases:recovered,
      latencyP50Ms:percentile(latencies,.5),latencyP95Ms:percentile(latencies,.95),paidOpenAiCalls:0,costUsd:0};
  }
  // Noise corpus at the audited order of magnitude, exact cosine scan (no HNSW).
  await db.query(`insert into events(id,organization_id,camera_id,site_id,headline,summary,primary_event_type,started_at,ended_at,expires_at)
    select ('20000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,$1,$2,$3,'Registro neutro','Registro neutro','scene_change',
      '2026-10-09T14:00:00Z','2026-10-09T14:00:00Z','2099-01-01' from generate_series(1,4000) i`,[ORG,CAM,SITE]);
  await db.query(`insert into event_embeddings(event_id,organization_id,model,dimensions,embedding,source_hash,text_version,expires_at)
    select id,organization_id,'text-embedding-3-small',768,$1,assistant_embedding_hash,1,expires_at from events
    where id::text like '20000000-%'`,[vector768(6)]);
  await db.exec('analyze events; analyze event_embeddings; analyze organization_members;');
  const times:number[]=[];
  for(let i=0;i<25;i++) {const start=performance.now();await asUser(db,()=>searchFixture(db,{p_embedding:vector768(),p_query:'entrega',p_limit:12}));if(i>=5)times.push(performance.now()-start);}
  report.scale={activeVectors:Number((await db.query<{count:string}>('select count(*) from event_embeddings where organization_id=$1',[ORG])).rows[0].count),dimensions:768,index:'exact filtered scan; existing GIN; no ANN',iterations:times.length,
    latencyP50Ms:percentile(times,.5),latencyP95Ms:percentile(times,.95)};
  console.log(JSON.stringify(report,null,2));
  const destination=process.argv[2];if(destination)await writeFile(destination,JSON.stringify(report,null,2)+'\n');
} finally {await db.close();}
