-- MonitorIA VIP — Gate 5
-- Nova origem mensal da Pesquisa IA para contratos VIP.
alter type public.assistant_allowance_source
  add value if not exists 'vip_subscription';
