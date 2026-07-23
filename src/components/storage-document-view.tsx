import { useEffect, useState, type ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { FileText, Loader2 } from "lucide-react";

type Props = {
  bucket: string;
  path: string | null | undefined;
  title?: string;
  sidePanel?: ReactNode;
};

/** PDF (ou arquivo) do Storage privado — mesmo padrão da revisão de documentos. */
export function StorageDocumentView({ bucket, path, title = "Documento original", sidePanel }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!path) {
      setUrl(null);
      setErro(null);
      return;
    }
    let active = true;
    setErro(null);
    supabase.storage.from(bucket).createSignedUrl(path, 600).then(({ data, error }) => {
      if (!active) return;
      if (error || !data?.signedUrl) {
        setUrl(null);
        setErro(error?.message ?? "Não foi possível gerar o link do arquivo.");
        return;
      }
      setUrl(data.signedUrl);
    });
    return () => { active = false; };
  }, [bucket, path]);

  const ext = (path ?? "").split(".").pop()?.toLowerCase() ?? "";
  const isPdf = ext === "pdf" || !ext;

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <Card className="overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-6 py-3">
          <FileText className="h-4 w-4 text-primary" />
          <h3 className="font-display text-lg">{title}</h3>
        </div>
        <CardContent className="p-0">
          {!path ? (
            <div className="flex h-[50vh] items-center justify-center text-sm text-muted-foreground">Arquivo não disponível.</div>
          ) : erro ? (
            <div className="flex h-[50vh] flex-col items-center justify-center gap-2 px-6 text-center text-sm text-destructive">{erro}</div>
          ) : !url ? (
            <div className="flex h-[50vh] items-center justify-center text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />Carregando…
            </div>
          ) : isPdf ? (
            <iframe src={url} title={title} className="h-[70vh] w-full" />
          ) : (
            <div className="flex h-[40vh] flex-col items-center justify-center gap-3 text-muted-foreground">
              <p>Pré-visualização indisponível para .{ext}</p>
              <Button variant="outline" size="sm" asChild>
                <a href={url} target="_blank" rel="noopener noreferrer">Abrir arquivo</a>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      {sidePanel ? <div className="space-y-5">{sidePanel}</div> : null}
    </div>
  );
}
