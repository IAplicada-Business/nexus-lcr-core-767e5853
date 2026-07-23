-- RBAC: menu Balancetes (Fechamento) — chave `fechamento` (src/lib/acessos.ts)

UPDATE public.permissoes_perfil
SET chaves = array_append(chaves, 'fechamento'), atualizado_em = now()
WHERE perfil IN ('admin', 'consultor', 'assistente')
  AND NOT ('fechamento' = ANY(chaves));
