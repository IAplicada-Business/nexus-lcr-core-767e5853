import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/status-pill";
import { getFechamentoCliente } from "@/lib/lcr.functions";
import { FECHAMENTO_STATUS_LABEL } from "@/lib/format";
import { requireAcesso } from "@/lib/guard";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/fechamento_/$empresaId")({
  beforeLoad: ({ context }) => requireAcesso(context.queryClient, "fechamento", "/fechamento"),
  validateSearch: (s: Record<string, unknown>) => ({
    balanceteId: typeof s.balanceteId === "string" ? s.balanceteId : undefined,
  }),
  head: () => ({ meta: [{ title: "Balancete — Fechamento 2025" }] }),
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData({
      queryKey: ["fechamento-cliente", params.empresaId],
      queryFn: () => getFechamentoCliente({ data: { empresa_id: params.empresaId } }),
    }),
  component: FechamentoClientePage,
  errorComponent: ({ error }) => <div className="p-6 text-destructive">Erro: {error.message}</div>,
});

function FechamentoClientePage() {
  const { empresaId } = Route.useParams();
  const { balanceteId } = Route.useSearch();
  const { data } = useSuspenseQuery({
    queryKey: ["fechamento-cliente", empresaId],
    queryFn: () => getFechamentoCliente({ data: { empresa_id: empresaId } }),
  });

  const bal = data.balancete;
  const status = bal?.status ?? "pendente";

  return (
    <>
      <div className="mb-4">
        <Button asChild variant="ghost" size="sm" className="gap-1.5">
          <Link to="/fechamento"><ArrowLeft className="h-4 w-4" /> Voltar ao lote</Link>
        </Button>
      </div>

      <PageHeader
        title={data.empresa.razao_social}
        description="Fechamento anual 2025 · Demonstrativos do Gestta (BALANCETE + CONCILIAÇÕES)"
      />

      <Card className="p-6">
        {!bal ? (
          <p className="text-sm text-muted-foreground">
            Este cliente ainda não possui balancete importado. Aguarde a extração do pipeline ou verifique o relatório CSV de cobertura.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <StatusPill variant={status === "ok" ? "ok" : status === "parcial" ? "warn" : "danger"}>
                {FECHAMENTO_STATUS_LABEL[status as keyof typeof FECHAMENTO_STATUS_LABEL] ?? status}
              </StatusPill>
              {bal.dc_ok != null && (
                <span className="text-sm text-muted-foreground">D = C: {bal.dc_ok ? "conferido" : "divergente"}</span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Detalhe com linhas parseadas e PDF de conciliações será exibido aqui após a Edge Function <code className="text-xs">processar-balancete</code>.
            </p>
            {balanceteId && (
              <p className="text-xs text-muted-foreground">ID balancete: {balanceteId}</p>
            )}
          </div>
        )}
      </Card>
    </>
  );
}
