-- Avisos de fechamento sem empresa_id (sem cadastro LCR, incompleto Gestta, etc.)

CREATE TABLE IF NOT EXISTS public.fechamento_avisos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exercicio integer NOT NULL DEFAULT 2025,
  gestta_task_id text NOT NULL,
  codigo_gestta text,
  nome_gestta text NOT NULL,
  status text NOT NULL DEFAULT 'sem_cadastro',
  motivo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fechamento_avisos_gestta_task_id_key UNIQUE (gestta_task_id),
  CONSTRAINT fechamento_avisos_status_check CHECK (
    status IN ('sem_cadastro', 'incompleto', 'erro')
  )
);

CREATE INDEX IF NOT EXISTS idx_fechamento_avisos_exercicio_status
  ON public.fechamento_avisos (exercicio, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fechamento_avisos TO authenticated;
GRANT ALL ON public.fechamento_avisos TO service_role;

ALTER TABLE public.fechamento_avisos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_fechamento_avisos_all ON public.fechamento_avisos;
CREATE POLICY p_fechamento_avisos_all ON public.fechamento_avisos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS trg_fechamento_avisos_updated ON public.fechamento_avisos;
CREATE TRIGGER trg_fechamento_avisos_updated
  BEFORE UPDATE ON public.fechamento_avisos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
