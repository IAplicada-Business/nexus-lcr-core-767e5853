-- =====================================================================
-- Fechamento anual 2025 — balancetes importados do Gestta
--   * Cabeçalho por tarefa Gestta (idempotência: gestta_task_id)
--   * Linhas parseadas (conta + saldos) para validação D = C
--   * Colunas alinhadas a listFechamentos / getFechamentoCliente (LCR-front)
-- =====================================================================

ALTER TYPE public.documento_tipo ADD VALUE IF NOT EXISTS 'balancete';

CREATE TABLE IF NOT EXISTS public.balancetes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  exercicio integer NOT NULL DEFAULT 2025,
  competencia text NOT NULL DEFAULT '2025-12',
  gestta_task_id text,
  gestta_ref text,
  documento_balancete_id uuid REFERENCES public.documentos(id) ON DELETE SET NULL,
  documento_conciliacoes_id uuid REFERENCES public.documentos(id) ON DELETE SET NULL,
  balancete_url text,
  conciliacoes_url text,
  storage_path text,
  debitos_total numeric(18, 2),
  creditos_total numeric(18, 2),
  dc_ok boolean,
  status text NOT NULL DEFAULT 'pendente',
  divergencias jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT balancetes_gestta_task_id_key UNIQUE (gestta_task_id),
  CONSTRAINT balancetes_status_check CHECK (
    status IN ('pendente', 'ok', 'parcial', 'incompleto', 'sem_cadastro', 'erro')
  )
);

CREATE INDEX IF NOT EXISTS idx_balancetes_empresa_exercicio
  ON public.balancetes (empresa_id, exercicio);

CREATE INDEX IF NOT EXISTS idx_balancetes_exercicio_status
  ON public.balancetes (exercicio, status);

CREATE TABLE IF NOT EXISTS public.balancete_linhas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  balancete_id uuid NOT NULL REFERENCES public.balancetes(id) ON DELETE CASCADE,
  ordem integer NOT NULL DEFAULT 0,
  pdc_codigo text,
  conta_nome text,
  saldo_anterior numeric(18, 2),
  debito numeric(18, 2),
  credito numeric(18, 2),
  saldo_atual numeric(18, 2),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_balancete_linhas_balancete
  ON public.balancete_linhas (balancete_id, ordem);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.balancetes TO authenticated;
GRANT ALL ON public.balancetes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.balancete_linhas TO authenticated;
GRANT ALL ON public.balancete_linhas TO service_role;

ALTER TABLE public.balancetes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.balancete_linhas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_balancetes_all ON public.balancetes;
CREATE POLICY p_balancetes_all ON public.balancetes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS p_balancete_linhas_all ON public.balancete_linhas;
CREATE POLICY p_balancete_linhas_all ON public.balancete_linhas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS trg_balancetes_updated ON public.balancetes;
CREATE TRIGGER trg_balancetes_updated
  BEFORE UPDATE ON public.balancetes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
