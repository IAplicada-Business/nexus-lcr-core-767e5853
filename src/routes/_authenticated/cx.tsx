import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { PageHeader, ResumoTela } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getCxCarteira } from "@/lib/lcr.functions";
import { requireAcesso } from "@/lib/guard";
import { ArrowRight, TrendingUp, TrendingDown, Minus, Heart, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, RadialBarChart, RadialBar } from "recharts";

export const Route = createFileRoute("/_authenticated/cx")({
  beforeLoad: ({ context }) => requireAcesso(context.queryClient, "cx", "/cx"),
  head: () => ({ meta: [{ title: "CX · Experiência — LCR Contábil" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData({ queryKey: ["cx-carteira"], queryFn: () => getCxCarteira() }),
  component: CxPage,
  errorComponent: ({ error }) => <div className="p-6 text-destructive">Erro: {error.message}</div>,
});

const CORES = { saudavel: "#10b981", atencao: "#f59e0b", risco: "#f43f5e" };
function TendIcon({ t }: { t: string | null }) {
  if (t === "subindo") return <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />;
  if (t === "caindo") return <TrendingDown className="h-3.5 w-3.5 text-rose-600" />;
  return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
}

function CxPage() {
  const { data } = useSuspenseQuery({ queryKey: ["cx-carteira"], queryFn: () => getCxCarteira() });
  const pieData = [
    { name: "Saudável", key: "saudavel", value: data.dist.saudavel },
    { name: "Atenção", key: "atencao", value: data.dist.atencao },
    { name: "Risco", key: "risco", value: data.dist.risco },
  ];
  const healthPct = Math.max(0, Math.min(100, Math.round(data.mediaHealth ?? 0)));
  const healthRadial = [{ name: "health", value: healthPct, fill: "var(--color-accent-lime)" }];

  return (
    <>
      <PageHeader
        title="CX ·"
        emphasis="Experiência"
        description="Saúde operacional da carteira, calculada a partir dos sinais do sistema. Fale com o Cuidador no assistente para ações de relacionamento."
      />

      <div className="mb-6 flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50/60 p-4 text-sm text-blue-900">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
        <div>
          <div className="font-medium">Saúde operacional é a métrica principal desta tela.</div>
          <div className="mt-1 text-blue-800/80">
            A partir de julho/2026, cada cliente ganha uma <strong>Saúde operacional</strong> calculada
            a partir de sinais do próprio sistema (atrasos de fechamento, documentos pendentes, divergências
            recorrentes, tempo de resposta). NPS será implementado quando a LCR iniciar coleta de pesquisa
            com os clientes — projeto separado da Fase 2/3.
          </div>
        </div>
      </div>

      <ResumoTela itens={[
        { label: "Clientes acompanhados", value: data.total },
        { label: "Saúde operacional média", value: data.mediaHealth },
        { label: "Saudáveis", value: data.dist.saudavel, tone: "ok" as const },
        { label: "Em atenção", value: data.dist.atencao },
        { label: "Em risco", value: data.dist.risco, tone: "warn" as const },
      ]} />

      {/* HERO — Saúde operacional da carteira em destaque */}
      <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="relative overflow-hidden rounded-3xl bg-deep p-7 text-primary-foreground lg:col-span-2">
          <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-primary/40 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-10 h-64 w-64 rounded-full bg-accent-lime/20 blur-3xl" />

          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-primary-foreground/70">
                <Heart className="h-3.5 w-3.5" /> Saúde operacional · carteira
              </div>
              <div className="mt-3 flex items-end gap-3">
                <span className="font-display text-6xl font-bold leading-none">{healthPct}</span>
                <span className="text-lg text-primary-foreground/60">/ 100</span>
              </div>
              <div className="mt-2 text-xs text-primary-foreground/70">
                {data.total} clientes acompanhados · {data.subindo} subindo · {data.caindo} caindo
              </div>

              <div className="mt-6 flex h-2.5 max-w-md overflow-hidden rounded-full bg-primary-foreground/15">
                <div className="bg-accent-lime" style={{ width: `${(data.dist.saudavel / (data.total || 1)) * 100}%` }} />
                <div className="bg-amber-400" style={{ width: `${(data.dist.atencao / (data.total || 1)) * 100}%` }} />
                <div className="bg-rose-400" style={{ width: `${(data.dist.risco / (data.total || 1)) * 100}%` }} />
              </div>
              <div className="mt-2 flex gap-4 text-[11px] text-primary-foreground/70">
                <span>■ {data.dist.saudavel} saudáveis</span>
                <span>■ {data.dist.atencao} em atenção</span>
                <span>■ {data.dist.risco} em risco</span>
              </div>
            </div>
          </div>
        </div>

        {/* Saúde operacional média · radial gauge */}
        <div className="rounded-3xl border-0 bg-card p-6 shadow-soft">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-accent-lime/15 text-accent-lime"><Heart className="h-4 w-4" /></span>
            <div>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Média</div>
              <div className="font-display text-lg leading-tight">Saúde operacional</div>
            </div>
          </div>
          <div className="relative mt-2 h-40">
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart innerRadius="70%" outerRadius="100%" data={healthRadial} startAngle={90} endAngle={-270}>
                <RadialBar dataKey="value" cornerRadius={20} background={{ fill: "var(--color-muted)" }} />
              </RadialBarChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-display text-4xl font-bold">{healthPct}</span>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">/ 100</span>
            </div>
          </div>
          <div className="mt-2 flex justify-between text-[11px]">
            <span className="text-emerald-600">↑ {data.subindo} subindo</span>
            <span className="text-rose-600">↓ {data.caindo} caindo</span>
          </div>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="rounded-3xl border-0 p-6 shadow-soft">
          <div className="mb-4 flex items-baseline justify-between">
            <h3 className="font-display text-lg">Distribuição da carteira</h3>
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{data.dist.saudavel + data.dist.atencao + data.dist.risco} clientes</span>
          </div>
          <div className="grid grid-cols-5 gap-4 items-center">
            <div className="col-span-2 h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={3} strokeWidth={0}>
                    {pieData.map((d) => <Cell key={d.key} fill={CORES[d.key as keyof typeof CORES]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="col-span-3 space-y-3">
              {pieData.map((d) => {
                const total = data.dist.saudavel + data.dist.atencao + data.dist.risco;
                const pct = total ? Math.round((d.value / total) * 100) : 0;
                return (
                  <div key={d.key}>
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: CORES[d.key as keyof typeof CORES] }} />{d.name}</span>
                      <span className="font-mono text-xs text-muted-foreground">{d.value} · {pct}%</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: CORES[d.key as keyof typeof CORES] }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>

        <Card className="rounded-3xl border-0 p-6 shadow-soft">
          <div className="mb-4 flex items-baseline justify-between">
            <h3 className="font-display text-lg">Como calculamos Saúde operacional</h3>
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Fase 2 · julho/26</span>
          </div>
          <ul className="space-y-3 text-sm">
            <li className="flex items-start gap-3">
              <span className="mt-1 h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
              <div>
                <div className="font-medium">Pontualidade de fechamento</div>
                <div className="text-xs text-muted-foreground">Dias além da data-corte configurada por cliente</div>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-1 h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
              <div>
                <div className="font-medium">Envio de documentos</div>
                <div className="text-xs text-muted-foreground">Frequência e tempo de resposta a pedidos no Gestta</div>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-1 h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
              <div>
                <div className="font-medium">Taxa de divergência</div>
                <div className="text-xs text-muted-foreground">Conciliações que precisaram de ajuste manual</div>
              </div>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-1 h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
              <div>
                <div className="font-medium">Continuidade do relacionamento</div>
                <div className="text-xs text-muted-foreground">Tempo de casa e recorrência de contato</div>
              </div>
            </li>
            <li className="flex items-start gap-3 opacity-50">
              <span className="mt-1 h-2 w-2 rounded-full bg-muted-foreground shrink-0" />
              <div>
                <div className="font-medium">NPS <span className="text-xs text-muted-foreground">(quando ativado)</span></div>
                <div className="text-xs text-muted-foreground">Pesquisa direta com o cliente — projeto separado</div>
              </div>
            </li>
          </ul>
        </Card>
      </div>

      <h2 className="mb-3 font-display text-xl">Clientes precisando de atenção</h2>
      <Card className="rounded-3xl border-0 shadow-soft overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead className="w-32">Classificação</TableHead>
              <TableHead className="w-24 text-center">Score</TableHead>
              <TableHead className="w-32">Tendência</TableHead>
              <TableHead className="w-24 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.atencao.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.nome}</TableCell>
                <TableCell>
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium",
                    c.classificacao === "risco" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700")}>{c.classificacao}</span>
                </TableCell>
                <TableCell className="text-center font-mono text-sm">{c.score}<span className="text-muted-foreground">/100</span></TableCell>
                <TableCell>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground"><TendIcon t={c.tendencia} /> {c.tendencia}</span>
                </TableCell>
                <TableCell className="text-right">
                  <Link to="/cx/$empresaId" params={{ empresaId: c.id }} className="inline-flex items-center gap-1 text-sm text-primary hover:underline">Ver <ArrowRight className="h-3 w-3" /></Link>
                </TableCell>
              </TableRow>
            ))}
            {data.atencao.length === 0 && <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Nenhum cliente em atenção. 🎉</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
