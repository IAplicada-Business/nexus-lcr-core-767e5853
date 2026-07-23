import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { PageHeader, ResumoTela } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusPill, variantFor } from "@/components/status-pill";
import { listFechamentos } from "@/lib/lcr.functions";
import { FECHAMENTO_STATUS_LABEL } from "@/lib/format";
import { requireAcesso } from "@/lib/guard";

export const Route = createFileRoute("/_authenticated/fechamento")({
  beforeLoad: ({ context }) => requireAcesso(context.queryClient, "fechamento", "/fechamento"),
  head: () => ({ meta: [{ title: "Balancetes (Fechamento) — LCR Contábil" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData({ queryKey: ["fechamentos"], queryFn: () => listFechamentos() }),
  component: FechamentoPage,
  errorComponent: ({ error }) => <div className="p-6 text-destructive">Erro: {error.message}</div>,
});

type FechRow = {
  id: string;
  status: string;
  debitos_total: number | null;
  creditos_total: number | null;
  dc_ok: boolean | null;
  gestta_task_id: string | null;
  created_at?: string | null;
};
type EmpRow = { id: string; razao_social: string; nome_fantasia: string | null; codigo_gestta: string | null; fechamentos: FechRow[] };

function statusVariant(status: string) {
  if (status === "ok") return "ok" as const;
  if (status === "parcial") return "warn" as const;
  if (status === "incompleto" || status === "sem_cadastro") return "danger" as const;
  return variantFor(status);
}

function EmpresaRow({ empresa }: { empresa: EmpRow }) {
  const fech = empresa.fechamentos[0];
  const status = fech?.status ?? "pendente";

  return (
    <TableRow>
      <TableCell className="font-medium">
        <div>{empresa.razao_social}</div>
        {empresa.codigo_gestta && <div className="text-xs text-muted-foreground">{empresa.codigo_gestta}</div>}
      </TableCell>
      <TableCell>
        <StatusPill variant={statusVariant(status)}>
          {FECHAMENTO_STATUS_LABEL[status as keyof typeof FECHAMENTO_STATUS_LABEL] ?? status}
        </StatusPill>
      </TableCell>
      <TableCell>{fech?.dc_ok == null ? "—" : fech.dc_ok ? "Sim" : "Não"}</TableCell>
      <TableCell>
        <div className="flex items-center justify-end gap-2">
          {fech ? (
            <Button asChild variant="outline" size="sm">
              <Link to="/fechamento/$empresaId" params={{ empresaId: empresa.id }} search={{ balanceteId: fech.id }}>
                Abrir
              </Link>
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">Aguardando extração</span>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}

function FechamentoPage() {
  const { data } = useSuspenseQuery({ queryKey: ["fechamentos"], queryFn: () => listFechamentos() });
  const [status, setStatus] = useState("all");

  const empresas = data.empresas as EmpRow[];
  const statusDe = (e: EmpRow) => e.fechamentos[0]?.status ?? "pendente";
  const filtradas = useMemo(() => {
    if (status === "all") return empresas;
    if (status === "pendente") return empresas.filter((e) => e.fechamentos.length === 0);
    return empresas.filter((e) => statusDe(e) === status);
  }, [empresas, status]);

  const comDados = empresas.filter((e) => e.fechamentos.length > 0);
  const ok = comDados.filter((e) => statusDe(e) === "ok").length;
  const parcial = comDados.filter((e) => statusDe(e) === "parcial").length;
  const incompleto = comDados.filter((e) => statusDe(e) === "incompleto").length;
  const semCadastro = comDados.filter((e) => statusDe(e) === "sem_cadastro").length;
  const pendentes = empresas.length - comDados.length;

  return (
    <>
      <PageHeader
        title="Balancetes (Fechamento)"
        description={`Fechamento anual 2025 — lote Gestta (~${data.metaTotal} clientes). Extração automática de BALANCETE + CONCILIAÇÕES com validação D = C.`}
      />

      <ResumoTela itens={[
        { label: "Meta lote", value: data.metaTotal },
        { label: "Extraídos", value: comDados.length },
        { label: "OK (D=C)", value: ok, tone: "ok" as const },
        { label: "Parcial", value: parcial, tone: "warn" as const },
        { label: "Pendente", value: pendentes },
      ]} />

      {comDados.length === 0 && (
        <Card className="mb-6 border-dashed p-6 text-sm text-muted-foreground">
          Nenhum balancete importado ainda. Após o drain do pipeline (Gestta → Supabase), os clientes aparecem aqui com status
          {" "}<strong>OK</strong>, <strong>Parcial</strong>, <strong>Incompleto</strong> ou <strong>Sem cadastro</strong>.
        </Card>
      )}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
          <Tabs value={status} onValueChange={setStatus}>
            <TabsList className="flex-wrap">
              <TabsTrigger value="all">Todos</TabsTrigger>
              <TabsTrigger value="pendente">Pendente</TabsTrigger>
              {Object.entries(FECHAMENTO_STATUS_LABEL).map(([k, v]) => (
                <TabsTrigger key={k} value={k}>{v}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <span className="text-sm text-muted-foreground">{filtradas.length} cliente(s)</span>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>D = C</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtradas.map((e) => (
              <EmpresaRow key={e.id} empresa={e} />
            ))}
            {filtradas.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                  Nenhum cliente neste filtro.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      {(incompleto > 0 || semCadastro > 0) && (
        <p className="mt-4 text-xs text-muted-foreground">
          {incompleto > 0 && `${incompleto} incompleto(s)`}
          {incompleto > 0 && semCadastro > 0 && " · "}
          {semCadastro > 0 && `${semCadastro} sem cadastro LCR`}
        </p>
      )}
    </>
  );
}
