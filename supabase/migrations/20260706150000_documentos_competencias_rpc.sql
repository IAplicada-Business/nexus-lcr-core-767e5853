-- Competências distintas dos documentos, p/ popular o filtro da tela de Documentos
-- sem depender da lista capada em 500 (são +13k docs; o dropdown precisa de TODAS
-- as competências reais). Aplicar no Supabase SQL Editor (convenção Lovable).
-- Retorna poucas linhas (uma por mês com documento), ordenadas do mais recente.

CREATE OR REPLACE FUNCTION public.documentos_competencias()
RETURNS TABLE (competencia text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT competencia
  FROM public.documentos
  WHERE competencia IS NOT NULL AND competencia ~ '^\d{4}-\d{2}$'
  ORDER BY competencia DESC;
$$;
GRANT EXECUTE ON FUNCTION public.documentos_competencias() TO authenticated, service_role;
