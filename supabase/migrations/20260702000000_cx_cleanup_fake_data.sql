-- Limpeza dos dados fake gerados pelo seed 20260622153400_seed_cerebro_demo.sql.
-- Motivo: os scores de NPS e Health foram populados com random() para permitir
-- navegar a tela na reunião de validação. Ficaram na base e passam impressão
-- de dado real, o que é enganoso. Zeramos aqui e voltamos a popular na Fase 2
-- quando o cálculo real de Health Score estiver ligado (após primeiro fechamento
-- de julho/2026).

BEGIN;

DELETE FROM public.cx_engagement_events;
DELETE FROM public.cx_touchpoints;
DELETE FROM public.cx_nps_responses;
DELETE FROM public.cx_health_score;

COMMIT;
