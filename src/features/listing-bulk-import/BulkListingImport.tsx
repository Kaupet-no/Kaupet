import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import {
  CheckCircle2,
  ChevronDown,
  Download,
  FileSpreadsheet,
  Loader2,
  Upload,
  XCircle,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ResponsiveOverlay, ResponsiveOverlayContent } from "@/components/ui/responsive-overlay";
import { DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { CategoryPicker } from "@/components/category-picker";
import { showErrorToast } from "@/lib/toast";
import { useCategories } from "@/hooks/use-categories";
import { useAllCategoryFilters } from "@/hooks/use-category-filters";
import { createListingsFromImport, type BulkImportResult } from "./listing-bulk-import.functions";
import {
  attributeMetaFromFilters,
  parseImportFile,
  type ParsedBulkImport,
} from "./parse-import-file";

/** CategoryPicker sender denne id-en når «Ingen (toppnivå)» velges. */
const PICKER_ROOT = "__none__";

export function BulkListingImport({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: categories = [], isLoading: categoriesLoading } = useCategories();
  const { data: filters = [] } = useAllCategoryFilters();
  const [templateCategoryId, setTemplateCategoryId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<ParsedBulkImport | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [importId, setImportId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [results, setResults] = useState<BulkImportResult[] | null>(null);
  const createImport = useMutation({
    mutationFn: (variables: { importId: string; rows: ParsedBulkImport["rows"] }) =>
      createListingsFromImport({ data: variables }),
    onSuccess: setResults,
    onError: (error: Error) => showErrorToast(error.message || "Kunne ikke opprette annonsene."),
  });

  // Malbyggeren drar med seg logo-PNG-en og OOXML-skriveren, som ingen
  // trenger før de faktisk laster ned malen.
  const downloadTemplate = async () => {
    const { downloadBulkImportXlsxTemplate } = await import("./template");
    downloadBulkImportXlsxTemplate({ categories, filters, categoryId: templateCategoryId });
  };

  const templateCategory = categories.find((category) => category.id === templateCategoryId);
  const templateCategoryLabel = !templateCategory
    ? "Alle kategorier"
    : categories.some((category) => category.parent_id === templateCategory.id)
      ? `${templateCategory.name_nb} (alle underkategorier)`
      : templateCategory.name_nb;

  const invalidRowNumbers = new Set(parsed?.errors.map((error) => error.rowNumber) ?? []);
  const reset = () => {
    setParsed(null);
    setFileError(null);
    setImportId(null);
    setResults(null);
    setConfirmOpen(false);
    createImport.reset();
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const selectFile = async (file: File | undefined) => {
    if (!file) return;
    setFileError(null);
    setParsed(null);
    setResults(null);
    try {
      const next = await parseImportFile(file, attributeMetaFromFilters(filters));
      setParsed(next);
      setImportId(crypto.randomUUID());
    } catch (error) {
      setFileError((error as Error).message || "Filen kunne ikke leses.");
    }
  };

  const downloadErrors = () => {
    if (!parsed && !results) return;
    const rows = (results ?? []).filter((result) => result.status === "failed");
    const csv = [
      "row_number;external_id;error",
      ...rows.map(
        (row) => `${row.rowNumber};${row.externalId};"${(row.error ?? "").replaceAll('"', '""')}"`,
      ),
    ].join("\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "kaupet-proff-import-feil.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const createdCount = results?.filter((result) => result.status === "created").length ?? 0;
  const duplicateCount = results?.filter((result) => result.status === "duplicate").length ?? 0;
  const failedCount = results?.filter((result) => result.status === "failed").length ?? 0;
  const pending = createImport.isPending;
  return (
    <ResponsiveOverlay open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <ResponsiveOverlayContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <div className="space-y-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="size-5 text-primary" />
              Importer annonser
            </DialogTitle>
            <DialogDescription>
              Last opp én CSV- eller Excel-fil for å opprette flere annonser.
            </DialogDescription>
          </DialogHeader>

          {!results ? (
            <>
              <Alert>
                <AlertTitle>Filformat</AlertTitle>
                <AlertDescription>
                  Velg en kategori for å få en mal med ferdige kolonner og nedtrekksmenyer for
                  akkurat de feltene kategorien trenger. Obligatoriske kolonner:{" "}
                  <code>external_id</code>, <code>category</code>, <code>title</code>,{" "}
                  <code>description</code> og <code>price</code>. Bruk <code>external_id</code> som
                  bedriftens egen stabile referanse, for eksempel varenummer, SKU eller lager-ID.
                  Verdien må være unik i filen. Pris er hele kroner i NOK. Én annonse per rad; maks
                  500 rader og 5 MB. Bilder importeres ikke, og bilde-URL-er støttes ikke.
                </AlertDescription>
              </Alert>
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-56 flex-1 space-y-2">
                  <Label id="template-category-label">Mal for kategori</Label>
                  <CategoryPicker
                    open={pickerOpen}
                    onOpenChange={setPickerOpen}
                    categories={categories}
                    selectedId={templateCategoryId ?? ""}
                    allowSelectAny
                    onSelect={(categoryId) =>
                      setTemplateCategoryId(categoryId === PICKER_ROOT ? null : categoryId)
                    }
                    trigger={
                      <Button
                        type="button"
                        variant="outline"
                        aria-labelledby="template-category-label"
                        className="w-full justify-between font-normal"
                        onClick={() => setPickerOpen(true)}
                        disabled={categoriesLoading}
                      >
                        {templateCategoryLabel}
                        <ChevronDown className="size-4 opacity-60" />
                      </Button>
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Velg en hovedkategori for å få med alle underkategoriene dens, eller en
                    underkategori for en smalere mal.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void downloadTemplate()}
                  disabled={categoriesLoading}
                >
                  <Download className="size-4" />
                  Last ned Excel-mal
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={pending}
                >
                  <Upload className="size-4" />
                  Velg fil
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="sr-only"
                  aria-label="Velg importfil"
                  onChange={(event) => void selectFile(event.target.files?.[0])}
                />
              </div>
              {fileError && (
                <Alert variant="destructive">
                  <XCircle className="size-4" />
                  <AlertDescription>{fileError}</AlertDescription>
                </Alert>
              )}

              {parsed && (
                <section aria-labelledby="bulk-preview-title" className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 id="bulk-preview-title" className="font-semibold">
                        Forhåndsvisning: {parsed.fileName}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {parsed.rows.length} gyldige · {invalidRowNumbers.size} ugyldige
                      </p>
                    </div>
                    <Badge variant={parsed.errors.length === 0 ? "default" : "destructive"}>
                      {parsed.errors.length === 0
                        ? "Klar for oppretting"
                        : "Rett feil i kildefilen"}
                    </Badge>
                  </div>
                  {parsed.errors.length > 0 && (
                    <div className="max-h-64 overflow-y-auto rounded-md border border-destructive/40">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Rad</TableHead>
                            <TableHead>Felt</TableHead>
                            <TableHead>Feil</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {parsed.errors.map((error, index) => (
                            <TableRow key={`${error.rowNumber}-${error.field}-${index}`}>
                              <TableCell>{error.rowNumber}</TableCell>
                              <TableCell>{error.field}</TableCell>
                              <TableCell className="text-destructive">{error.message}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Rad</TableHead>
                          <TableHead>Ekstern ID</TableHead>
                          <TableHead>Kategori</TableHead>
                          <TableHead>Tittel</TableHead>
                          <TableHead>Pris</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {parsed.rows.map((row) => (
                          <TableRow key={row.rowNumber}>
                            <TableCell>{row.rowNumber}</TableCell>
                            <TableCell>{row.externalId}</TableCell>
                            <TableCell>{row.category}</TableCell>
                            <TableCell>{row.title}</TableCell>
                            <TableCell>{row.priceNok.toLocaleString("nb-NO")} kr</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {pending && (
                    <div role="status" aria-live="polite" className="space-y-2">
                      <div className="flex items-center gap-2 text-sm">
                        <Loader2 className="size-4 animate-spin" />
                        Oppretter annonser…
                      </div>
                      <Progress value={undefined} />
                    </div>
                  )}
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      disabled={parsed.errors.length > 0 || parsed.rows.length === 0 || pending}
                      onClick={() => setConfirmOpen(true)}
                    >
                      Opprett annonser
                    </Button>
                  </div>
                </section>
              )}
            </>
          ) : (
            <ImportResult
              results={results}
              createdCount={createdCount}
              duplicateCount={duplicateCount}
              failedCount={failedCount}
              onDownloadErrors={downloadErrors}
              onNewImport={reset}
            />
          )}
        </div>
      </ResponsiveOverlayContent>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Opprette annonser?</AlertDialogTitle>
            <AlertDialogDescription>
              Du er i ferd med å opprette {parsed?.rows.length ?? 0} annonser. Annonsene opprettes
              med status aktiv.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                if (importId && parsed) {
                  setConfirmOpen(false);
                  createImport.mutate({ importId, rows: parsed.rows });
                }
              }}
            >
              Bekreft oppretting
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ResponsiveOverlay>
  );
}

function ImportResult({
  results,
  createdCount,
  duplicateCount,
  failedCount,
  onDownloadErrors,
  onNewImport,
}: {
  results: BulkImportResult[];
  createdCount: number;
  duplicateCount: number;
  failedCount: number;
  onDownloadErrors: () => void;
  onNewImport: () => void;
}) {
  return (
    <section aria-labelledby="bulk-result-title" className="space-y-5">
      <div>
        <h3 id="bulk-result-title" className="font-semibold">
          Import ferdig
        </h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <ResultCount
            icon={<CheckCircle2 className="size-4" />}
            label="Opprettet"
            count={createdCount}
          />
          <ResultCount label="Duplikat" count={duplicateCount} />
          <ResultCount icon={<XCircle className="size-4" />} label="Feilet" count={failedCount} />
        </div>
      </div>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Rad</TableHead>
              <TableHead>Ekstern ID</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Detaljer</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {results.map((result) => (
              <TableRow key={`${result.rowNumber}-${result.externalId}`}>
                <TableCell>{result.rowNumber}</TableCell>
                <TableCell>{result.externalId}</TableCell>
                <TableCell>
                  {result.status === "created"
                    ? "Opprettet"
                    : result.status === "duplicate"
                      ? "Duplikat"
                      : "Feilet"}
                </TableCell>
                <TableCell>
                  {result.kaupetCode ? (
                    <Link
                      to="/$kaupetCode"
                      params={{ kaupetCode: result.kaupetCode }}
                      className="underline"
                    >
                      Åpne annonsen
                    </Link>
                  ) : (
                    result.error
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button type="button" variant="outline" onClick={onNewImport}>
          Importer en ny fil
        </Button>
        {failedCount > 0 && (
          <Button type="button" variant="outline" onClick={onDownloadErrors}>
            <Download className="size-4" />
            Last ned feil som CSV
          </Button>
        )}
      </div>
    </section>
  );
}

function ResultCount({
  icon,
  label,
  count,
}: {
  icon?: React.ReactNode;
  label: string;
  count: number;
}) {
  return (
    <div className="rounded-md border p-3">
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        {icon}
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold">{count}</p>
    </div>
  );
}
