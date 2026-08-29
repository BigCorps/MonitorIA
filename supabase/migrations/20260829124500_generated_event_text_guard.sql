-- MonitorIA 1.0.3 RC - 05B6.2
-- Protege headline/summary gerados por IA contra escapes Latin-1 literais
-- observados em produção de teste, por exemplo:
--   balce3o      -> balcão
--   interae7e3o  -> interação
--
-- O reparo é deliberadamente conservador: só converte o token hexadecimal
-- quando ele aparece ENTRE letras, reduzindo o risco de tocar IDs, números,
-- códigos ou texto técnico legítimo.

create or replace function public.normalize_monitoria_generated_text(
  p_value text
)
returns text
language plpgsql
immutable
strict
set search_path = ''
as $$
declare
  v_value text := p_value;
begin
  -- minúsculas Latin-1 mais comuns em português
  v_value := regexp_replace(v_value, '([[:alpha:]À-ÖØ-öø-ÿ])e0([[:alpha:]À-ÖØ-öø-ÿ])', '\1à\2', 'gi');
  v_value := regexp_replace(v_value, '([[:alpha:]À-ÖØ-öø-ÿ])e1([[:alpha:]À-ÖØ-öø-ÿ])', '\1á\2', 'gi');
  v_value := regexp_replace(v_value, '([[:alpha:]À-ÖØ-öø-ÿ])e2([[:alpha:]À-ÖØ-öø-ÿ])', '\1â\2', 'gi');
  v_value := regexp_replace(v_value, '([[:alpha:]À-ÖØ-öø-ÿ])e3([[:alpha:]À-ÖØ-öø-ÿ])', '\1ã\2', 'gi');
  v_value := regexp_replace(v_value, '([[:alpha:]À-ÖØ-öø-ÿ])e7([[:alpha:]À-ÖØ-öø-ÿ])', '\1ç\2', 'gi');
  v_value := regexp_replace(v_value, '([[:alpha:]À-ÖØ-öø-ÿ])e8([[:alpha:]À-ÖØ-öø-ÿ])', '\1è\2', 'gi');
  v_value := regexp_replace(v_value, '([[:alpha:]À-ÖØ-öø-ÿ])e9([[:alpha:]À-ÖØ-öø-ÿ])', '\1é\2', 'gi');
  v_value := regexp_replace(v_value, '([[:alpha:]À-ÖØ-öø-ÿ])ea([[:alpha:]À-ÖØ-öø-ÿ])', '\1ê\2', 'gi');
  v_value := regexp_replace(v_value, '([[:alpha:]À-ÖØ-öø-ÿ])ed([[:alpha:]À-ÖØ-öø-ÿ])', '\1í\2', 'gi');
  v_value := regexp_replace(v_value, '([[:alpha:]À-ÖØ-öø-ÿ])f2([[:alpha:]À-ÖØ-öø-ÿ])', '\1ò\2', 'gi');
  v_value := regexp_replace(v_value, '([[:alpha:]À-ÖØ-öø-ÿ])f3([[:alpha:]À-ÖØ-öø-ÿ])', '\1ó\2', 'gi');
  v_value := regexp_replace(v_value, '([[:alpha:]À-ÖØ-öø-ÿ])f4([[:alpha:]À-ÖØ-öø-ÿ])', '\1ô\2', 'gi');
  v_value := regexp_replace(v_value, '([[:alpha:]À-ÖØ-öø-ÿ])f5([[:alpha:]À-ÖØ-öø-ÿ])', '\1õ\2', 'gi');
  v_value := regexp_replace(v_value, '([[:alpha:]À-ÖØ-öø-ÿ])fa([[:alpha:]À-ÖØ-öø-ÿ])', '\1ú\2', 'gi');
  v_value := regexp_replace(v_value, '([[:alpha:]À-ÖØ-öø-ÿ])fc([[:alpha:]À-ÖØ-öø-ÿ])', '\1ü\2', 'gi');

  -- maiúsculas Latin-1; úteis em nomes/títulos sem alterar tokens isolados.
  v_value := regexp_replace(v_value, '([[:alpha:]À-ÖØ-öø-ÿ])c0([[:alpha:]À-ÖØ-öø-ÿ])', '\1À\2', 'gi');
  v_value := regexp_replace(v_value, '([[:alpha:]À-ÖØ-öø-ÿ])c1([[:alpha:]À-ÖØ-öø-ÿ])', '\1Á\2', 'gi');
  v_value := regexp_replace(v_value, '([[:alpha:]À-ÖØ-öø-ÿ])c2([[:alpha:]À-ÖØ-öø-ÿ])', '\1Â\2', 'gi');
  v_value := regexp_replace(v_value, '([[:alpha:]À-ÖØ-öø-ÿ])c3([[:alpha:]À-ÖØ-öø-ÿ])', '\1Ã\2', 'gi');
  v_value := regexp_replace(v_value, '([[:alpha:]À-ÖØ-öø-ÿ])c7([[:alpha:]À-ÖØ-öø-ÿ])', '\1Ç\2', 'gi');
  v_value := regexp_replace(v_value, '([[:alpha:]À-ÖØ-öø-ÿ])c9([[:alpha:]À-ÖØ-öø-ÿ])', '\1É\2', 'gi');
  v_value := regexp_replace(v_value, '([[:alpha:]À-ÖØ-öø-ÿ])ca([[:alpha:]À-ÖØ-öø-ÿ])', '\1Ê\2', 'gi');
  v_value := regexp_replace(v_value, '([[:alpha:]À-ÖØ-öø-ÿ])cd([[:alpha:]À-ÖØ-öø-ÿ])', '\1Í\2', 'gi');
  v_value := regexp_replace(v_value, '([[:alpha:]À-ÖØ-öø-ÿ])d3([[:alpha:]À-ÖØ-öø-ÿ])', '\1Ó\2', 'gi');
  v_value := regexp_replace(v_value, '([[:alpha:]À-ÖØ-öø-ÿ])d4([[:alpha:]À-ÖØ-öø-ÿ])', '\1Ô\2', 'gi');
  v_value := regexp_replace(v_value, '([[:alpha:]À-ÖØ-öø-ÿ])d5([[:alpha:]À-ÖØ-öø-ÿ])', '\1Õ\2', 'gi');
  v_value := regexp_replace(v_value, '([[:alpha:]À-ÖØ-öø-ÿ])da([[:alpha:]À-ÖØ-öø-ÿ])', '\1Ú\2', 'gi');

  return v_value;
end;
$$;

-- A própria migration falha se o PostgreSQL do projeto não interpretar os
-- padrões exatamente como esperado. Assim não instalamos um guard "verde"
-- que não corrige os dois casos reais observados no RC.
do $$
begin
  if public.normalize_monitoria_generated_text('balce3o') <> 'balcão' then
    raise exception 'monitoria_text_guard_failed: balce3o';
  end if;

  if public.normalize_monitoria_generated_text('interae7e3o') <> 'interação' then
    raise exception 'monitoria_text_guard_failed: interae7e3o';
  end if;

  if public.normalize_monitoria_generated_text('código E3 isolado') <> 'código E3 isolado' then
    raise exception 'monitoria_text_guard_failed: conservative_token';
  end if;
end
$$;

create or replace function public.guard_monitoria_generated_event_text()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Não reinterpreta texto que já passou por revisão humana explícita.
  if new.human_reviewed_at is null then
    new.headline := public.normalize_monitoria_generated_text(new.headline);
    new.summary := public.normalize_monitoria_generated_text(new.summary);
  end if;

  return new;
end;
$$;

drop trigger if exists monitoria_generated_event_text_guard on public.events;

create trigger monitoria_generated_event_text_guard
before insert or update of headline, summary
on public.events
for each row
execute function public.guard_monitoria_generated_event_text();
