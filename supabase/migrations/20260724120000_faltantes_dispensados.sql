-- OPT-0008 (Bruno 22/07): a conciliação travava por FALTANTES (extrato sem
-- classificação / lançamento sem extrato) sem o usuário poder aceitar os casos
-- que, por natureza, não têm correspondência. Esta coluna guarda as dispensas
-- por linha; detectarFaltantes (edge conciliar) as remove das listas e do count.
--
-- Coluna SEPARADA de `resultado` (que é sobrescrito a cada "Analisar"), então a
-- dispensa persiste entre reanálises. Cada item:
--   { "lado": "extrato"|"lancamento", "data": "AAAA-MM-DD"|null,
--     "valor_cents": int, "descricao": string, "lancamento_id": uuid|null }

ALTER TABLE public.conciliacoes
  ADD COLUMN IF NOT EXISTS faltantes_dispensados jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.conciliacoes.faltantes_dispensados IS
  'OPT-0008: faltantes dispensados pelo usuário (não exigem correspondência). Array de {lado,data,valor_cents,descricao,lancamento_id?}. Consumido por detectarFaltantes no edge conciliar.';
