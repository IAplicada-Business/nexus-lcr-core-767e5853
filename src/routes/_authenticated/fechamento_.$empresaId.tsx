import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader } from "@/components/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusPill } from "@/components/status-pill";
import { StorageDocumentView } from "@/components/storage-document-view";
import { getFechamentoCliente } from "@/lib/lcr.functions";
import { FECHAMENTO_STATUS_LABEL } from "@/lib/format";
import { requireAcesso } from "@/lib/guard";
import { ArrowLeft, Download, Eye, FileText, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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

type Linha = {
  ordem: number;
  pdc_codigo: string | null;
  conta_nome: string | null;
  saldo_anterior: number | null;
  debito: number | null;
  credito: number | null;
  saldo_atual: number | null;
};

const brl = (v: number | null | undefined) =>
  v == null ? "—" : v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function baixarArquivo(bucket: string, path: string) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60);
  if (error || !data?.signedUrl) {
    toast.error(error?.message ?? "Não foi possível gerar o link.");
    return;
  }
  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}

function FechamentoClientePage() {
  const { empresaId } = Route.useParams();
  const { data } = useSuspenseQuery({
    queryKey: ["fechamento-cliente", empresaId],
    queryFn: () => getFechamentoCliente({ data: { empresa_id: empresaId } }),
  });

  const bal = data.balancete;
  const linhas = (data.linhas ?? []) as Linha[];
  const status = bal?.status ?? "pendente";
  const [aberto, setAberto] = useState<"balancete" | "conciliacoes" | null>(null);

  const documentos = [
    {
      key: "balancete" as const,
      rotulo: "BALANCETE",
      descricao: "Demonstrativo contábil (SCI)",
      bucket: "balancetes",
      path: bal?.balancete_url,
    },
    {
      key: "conciliacoes" as const,
      rotulo: "CONCILIAÇÕES",
      descricao: "Checklist / conciliações (PDF)",
      bucket: "conciliacoes",
      path: bal?.conciliacoes_url,
    },
  ].filter((d) => d.path);

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

      {!bal ? (
        <Card className="p-6">
          <p className="text-sm text-muted-foreground">
            Este cliente ainda não possui balancete importado. Aguarde a extração do pipeline ou verifique o relatório CSV de cobertura.
          </p>
        </Card>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            <StatusPill variant={status === "ok" ? "ok" : status === "parcial" ? "warn" : "danger"}>
              {FECHAMENTO_STATUS_LABEL[status as keyof typeof FECHAMENTO_STATUS_LABEL] ?? status}
            </StatusPill>
            {bal.dc_ok != null && (
              <span className="text-sm text-muted-foreground">D = C: {bal.dc_ok ? "conferido" : "divergente"}</span>
            )}
            {bal.debitos_total != null && bal.creditos_total != null && (
              <span className="text-sm text-muted-foreground">
                Débitos {brl(Number(bal.debitos_total))} · Créditos {brl(Number(bal.creditos_total))}
              </span>
            )}
          </div>

          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/40 px-6 py-3">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                <h3 className="font-display text-lg">Documentos recebidos</h3>
                <span className="text-xs text-muted-foreground">· {documentos.length} arquivo(s)</span>
              </div>
            </div>
            <CardContent className="p-0">
              {documentos.length === 0 ? (
                <div className="px-6 py-8 text-center text-sm text-muted-foreground">Nenhum PDF arquivado para este cliente.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Documento</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {documentos.map((d) => (
                      <TableRow key={d.key}>
                        <TableCell className="text-sm font-medium">{d.rotulo}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{d.descricao}</TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant={aberto === d.key ? "default" : "outline"}
                              size="sm"
                              onClick={() => setAberto(aberto === d.key ? null : d.key)}
                            >
                              <Eye className="mr-1 h-4 w-4" />
                              {aberto === d.key ? "Fechar" : "Ver"}
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => baixarArquivo(d.bucket, d.path!)} title="Baixar">
                              <Download className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {aberto && (
            <div className="rounded-xl border border-border bg-card/40 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-display text-lg">
                  {aberto === "balancete" ? "Balancete de fechamento" : "Conciliações"}
                </h3>
                <Button variant="ghost" size="sm" onClick={() => setAberto(null)}>
                  <X className="mr-1 h-4 w-4" />Fechar
                </Button>
              </div>

              {aberto === "balancete" ? (
                <StorageDocumentView
                  bucket="balancetes"
                  path={bal.balancete_url}
                  title="Balancete (PDF)"
                  sidePanel={(
                    <Card>
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/40 px-6 py-3">
                        <h3 className="font-display text-lg">Linhas do balancete</h3>
                        <span className="text-xs text-muted-foreground">{linhas.length} conta(s)</span>
                      </div>
                      <CardContent className="max-h-[70vh] overflow-auto p-0">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-16">Conta</TableHead>
                              <TableHead>Nome</TableHead>
                              <TableHead className="text-right">Débito</TableHead>
                              <TableHead className="text-right">Crédito</TableHead>
                              <TableHead className="text-right">Saldo</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {linhas.map((l) => (
                              <TableRow key={l.ordem}>
                                <TableCell className="font-mono text-xs">{l.pdc_codigo}</TableCell>
                                <TableCell className="max-w-[14rem] truncate text-sm" title={l.conta_nome ?? ""}>{l.conta_nome}</TableCell>
                                <TableCell className="text-right text-sm">{brl(l.debito)}</TableCell>
                                <TableCell className="text-right text-sm">{brl(l.credito)}</TableCell>
                                <TableCell className="text-right text-sm">{brl(l.saldo_atual)}</TableCell>
                              </TableRow>
                            ))}
                            {linhas.length === 0 && (
                              <TableRow>
                                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                                  Nenhuma linha parseada.
                                </TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  )}
                />
              ) : (
                <StorageDocumentView
                  bucket="conciliacoes"
                  path={bal.conciliacoes_url}
                  title="Conciliações (PDF)"
                  sidePanel={(
                    <Card>
                      <CardContent className="space-y-2 p-6 text-sm text-muted-foreground">
                        <p>PDF de conciliações arquivado para consulta.</p>
                        <p>Use o botão de download se precisar abrir fora do navegador.</p>
                      </CardContent>
                    </Card>
                  )}
                />
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
