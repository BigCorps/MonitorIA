update public.plan_margin_target_versions
set valid_from = least(valid_from, date '2026-07-01')
where valid_to is null and plan_code in ('basic','standard','intensive');
