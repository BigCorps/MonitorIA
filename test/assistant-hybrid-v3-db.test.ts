import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createHybridFixture, asUser, searchFixture, uuid, USER, OTHER_USER, ORG, OTHER_ORG, CAM, STOCK, SITE, ZONE, vector768 } from "./support/assistant-hybrid-db";
import { projectEmbeddingQuery } from "../src/assistant/embedding-v3";

test("Gates 2/3 — PostgreSQL real isolado, pgvector, RLS, MFA, lifecycle e matriz", async (t) => {
  const db = await createHybridFixture();
  try {
    await t.test("projection contains only controlled words and matches query projection", async () => {
      const raw = "João Silva CPF 123.456.789-10 entregou pacote RTSP://admin:password@192.168.1.2 email@x.com";
      const result = await db.query<{ text: string }>("select public.assistant_embedding_projection_v1($1,'') as text", [raw]);
      assert.equal(result.rows[0].text, projectEmbeddingQuery(raw.replace("123.456.789-10", "")));
      assert.doesNotMatch(result.rows[0].text, /João|123|RTSP|password|email/);
    });
    await t.test("anon, service-role search, outsider and AAL1 are denied; AAL2 member passes", async () => {
      await assert.rejects(asUser(db,()=>searchFixture(db),{},"anon"),/permission denied/);
      await assert.rejects(asUser(db,()=>searchFixture(db),{},"service_role"),/permission denied/);
      await assert.rejects(asUser(db,()=>searchFixture(db),{sub:OTHER_USER,aal:"aal2"}),/not_authorized/);
      await assert.rejects(asUser(db,()=>searchFixture(db),{sub:USER,aal:"aal1"}),/not_authorized/);
      await asUser(db,async()=>assert.ok((await searchFixture(db)).returnedCount>0));
      await asUser(db,async()=>assert.equal((await db.query('select * from event_embeddings')).rows.length,0),{sub:USER,aal:"aal1"});
    });
    await t.test("MCP grant restrictions remain enforced for user JWT; no new MCP-role execute grant", async () => {
      await assert.rejects(asUser(db,()=>searchFixture(db),{sub:USER,aal:"aal2",client_id:"synthetic-mcp"}),/not_authorized/);
      await db.query('insert into mcp_oauth_grants values($1,$2,$3,null)',[ORG,USER,"synthetic-mcp"]);
      await asUser(db,async()=>assert.ok((await searchFixture(db)).returnedCount>0),{sub:USER,aal:"aal2",client_id:"synthetic-mcp"});
    });
    await t.test("30+ reproducible questions with scoped expectations before ranking", async () => {
      const matrix=JSON.parse(await readFile('test/fixtures/assistant-hybrid-v3-matrix.json','utf8'));
      assert.ok(matrix.length>=30);
      for(const item of matrix) {
        const args={...item.args}; if(item.axis!==null)args.p_embedding=vector768(item.axis);
        await asUser(db,async()=>{
          const result=await searchFixture(db,args);
          assert.equal(result.total,null,item.question);assert.equal(result.totalIsExact,false,item.question);
          assert.deepEqual(result.events.map((e:any)=>e.id).sort(),item.expected.map(uuid).sort(),item.question);
          assert.ok(!result.events.some((e:any)=>[uuid(7),uuid(8),uuid(9)].includes(e.id)),item.question);
        });
      }
    });
    await t.test("dimension mismatch raises; embedding absence is successful lexical retrieval", async () => {
      await asUser(db,async()=>{
        await assert.rejects(searchFixture(db,{p_embedding:'[1,0]'}),/embedding_dimensions_invalid/);
        const result=await searchFixture(db);assert.ok(result.returnedCount>0);assert.equal(result.retrievalMode,'lexical');
      });
      await db.exec('begin; delete from event_embeddings;');
      try {
        await asUser(db,async()=>{
          const result=await searchFixture(db,{p_embedding:vector768()});
          assert.ok(result.returnedCount>0);assert.equal(result.embeddingCoverage,0);
        });
      } finally {await db.exec('rollback');}
    });
    await t.test("cross-tenant writes rejected; client cannot claim/write vectors", async () => {
      await assert.rejects(db.query("update event_embeddings set organization_id=$1 where event_id=$2",[OTHER_ORG,uuid(1)]),/embedding_source_invalid/);
      await assert.rejects(asUser(db,()=>db.query("select public.assistant_claim_embedding_jobs_v3(16)")),/permission denied/);
      await assert.rejects(asUser(db,()=>db.query("delete from event_embeddings")),/permission denied/);
    });
    await t.test("idempotent updates, soft deletion, expiry and hard-delete cascade", async () => {
      await db.query('update events set summary=summary where id=$1',[uuid(1)]);
      assert.equal((await db.query('select 1 from event_embeddings where event_id=$1',[uuid(1)])).rows.length,1);
      await db.query('update events set summary=$1,headline=$1 where id=$2',["Animal no local",uuid(1)]);
      assert.equal((await db.query('select 1 from event_embeddings where event_id=$1',[uuid(1)])).rows.length,0);
      await db.query('update events set deleted_at=now() where id=$1',[uuid(2)]);
      assert.equal((await db.query('select 1 from event_embeddings where event_id=$1',[uuid(2)])).rows.length,0);
      await db.query('update events set expires_at=now()-interval \'1 second\' where id=$1',[uuid(3)]);
      assert.equal((await db.query('select 1 from event_embeddings where event_id=$1',[uuid(3)])).rows.length,0);
      await db.query('delete from events where id=$1',[uuid(12)]);
      assert.equal((await db.query('select 1 from event_embeddings where event_id=$1',[uuid(12)])).rows.length,0);
    });
    await t.test("disabled by default; backfill is separately disabled; durable leases, budget and CAS", async () => {
      const run=async (sql:string,args:unknown[]=[])=>{
        let rows:any[]=[];await asUser(db,async()=>{rows=(await db.query(sql,args)).rows;},{},'service_role');return rows;
      };
      assert.deepEqual((await run('select public.assistant_claim_embedding_jobs_v3(16) as jobs'))[0].jobs,[]);
      await assert.rejects(run('select public.assistant_enqueue_embedding_backfill_v3($1,$2,$3,100)',[ORG,'2026-10-01','2026-10-10']),/embedding_backfill_disabled/);
      await db.exec('update private.assistant_embedding_control_v3 set enabled=true,daily_token_limit=1');
      await db.query('update events set summary=$1,headline=$1 where id=$2',['Pessoa com pacote na entrada',uuid(4)]);
      assert.deepEqual((await run('select public.assistant_claim_embedding_jobs_v3(16) as jobs'))[0].jobs,[]);
      await db.exec('update private.assistant_embedding_control_v3 set daily_token_limit=10000');
      const job=(await run('select public.assistant_claim_embedding_jobs_v3(16) as jobs'))[0].jobs[0];
      assert.ok(job);assert.equal((await run('select public.assistant_claim_embedding_jobs_v3(16) as jobs'))[0].jobs.length,0);
      assert.equal((await run('select public.assistant_finish_embedding_job_v3($1,$2,$3,$4) as ok',[job.eventId,job.leaseToken,job.sourceHash,vector768()]))[0].ok,true);
      assert.equal((await run('select public.assistant_finish_embedding_job_v3($1,$2,$3,$4) as ok',[job.eventId,job.leaseToken,job.sourceHash,vector768()]))[0].ok,false);
      await db.query('update events set summary=$1,headline=$1 where id=$2',['Pessoa saiu pela porta',uuid(4)]);
      const stale=(await run('select public.assistant_claim_embedding_jobs_v3(16) as jobs'))[0].jobs[0];
      await db.query('update events set summary=$1,headline=$1 where id=$2',['Pessoa de mochila',uuid(4)]);
      assert.equal((await run('select public.assistant_finish_embedding_job_v3($1,$2,$3,$4) as ok',[stale.eventId,stale.leaseToken,stale.sourceHash,vector768()]))[0].ok,false);
      const retry=(await run('select public.assistant_claim_embedding_jobs_v3(16) as jobs'))[0].jobs[0];
      await run('select public.assistant_finish_embedding_job_v3($1,$2,$3,null)',[retry.eventId,retry.leaseToken,retry.sourceHash]);
      assert.equal((await db.query<{status:string}>('select status from private.assistant_embedding_jobs_v3 where event_id=$1',[uuid(4)])).rows[0].status,'retry');
      const reserved=(await db.query<{reserved_tokens:number}>('select reserved_tokens from private.assistant_embedding_control_v3')).rows[0].reserved_tokens;assert.ok(reserved>0);
    });
    await t.test("deduplicate interaction sequences and legacy model/version vectors excluded",async()=>{
      await db.query('update events set interaction_group_id=$1 where id=any($2)',[uuid(990),[uuid(4),uuid(6),uuid(11)]]);
      await asUser(db,async()=>assert.equal((await searchFixture(db,{p_query:'pessoa',p_embedding:vector768(2)})).events.filter((e:any)=>[uuid(4),uuid(6),uuid(11)].includes(e.id)).length,1));
      await db.query('update event_embeddings set text_version=null,model=$1 where event_id=$2',['legacy-model',uuid(6)]);
      await asUser(db,async()=>assert.equal((await searchFixture(db,{p_query:'sinonimo-desconhecido',p_embedding:vector768(2)})).events.some((e:any)=>e.id===uuid(6)),false));
    });
  } finally { await db.close(); }
});
