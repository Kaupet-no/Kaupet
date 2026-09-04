import { useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import {
  Check,
  CheckCircle2,
  ChevronsUpDown,
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
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { buildTree, descendants, type Category } from "@/lib/categories";
import { categoryBreadcrumb } from "@/lib/category-filters";
import { cn } from "@/lib/utils";
import { formatErrorMessage } from "@/lib/errors";
import { showErrorToast } from "@/lib/toast";
import { useCategories, visibleCategories } from "@/hooks/use-categories";
import { useIsDemo } from "@/hooks/use-is-demo";
import { useAllCategoryFilters } from "@/hooks/use-category-filters";
import { createListingsFromImport, type BulkImportResult } from "./listing-bulk-import.functions";
import {
  attributeMetaFromFilters,
  parseImportFile,
  type ParsedBulkImport,
} from "./parse-import-file";

export function BulkListingImport({
  open,
  onOpenChange,
  locations = [],
  selectedLocationId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locations?: Array<{
    id: string;
    name: string;
    address_line: string | null;
    postal_code: string | null;
    city: string | null;
  }>;
  selectedLocationId?: string | null;
}) {
  const { data: allCategories = [], isLoading: categoriesLoading } = useCategories();
  const { data: isDemo = false } = useIsDemo();
  const categories = useMemo(
    () => visibleCategories(allCategories, isDemo),
    [allCategories, isDemo],
  );
  const { data: filters = [] } = useAllCategoryFilters();
  const [templateCategoryId, setTemplateCategoryId] = useState<string | null>(null);
  const [locationId, setLocationId] = useState(selectedLocationId ?? locations[0]?.id ?? "");
  const [showVisitingAddress, setShowVisitingAddress] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [categorySearch, setCategorySearch] = useState("");
  const [overlayEl, setOverlayEl] = useState<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<ParsedBulkImport | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [importId, setImportId] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [results, setResults] = useState<BulkImportResult[] | null>(null);
  const createImport = useMutation({
    mutationFn: (variables: {
      importId: string;
      rows: ParsedBulkImport["rows"];
      locationId: string;
      showVisitingAddress: boolean;
    }) => createListingsFromImport({ data: variables }),
    onSuccess: setResults,
    onError: (error: Error) =>
      showErrorToast(formatErrorMessage(error, "Kunne ikke opprette annonsene.")),
  });
  // Malbyggeren drar med seg logo-PNG-en og OOXML-skriveren, som ingen
  // trenger før de faktisk laster ned malen.
  const downloadTemplate = async () => {
    const { downloadBulkImportXlsxTemplate } = await import("./template");
    downloadBulkImportXlsxTemplate({ categories, filters, categoryId: templateCategoryId });
  };

  /** Hele kategoritreet flatet ut i visningsrekkefølge (hovedkategori
   * etterfulgt av sine underkategorier), slik at hele treet kan vises og
   * søkes i som én liste i stedet for å bores gjennom nivå for nivå. */
  const categoryOptions = useMemo(() => {
    const tree = buildTree(categories);
    const out: Array<{
      category: Category;
      depth: number;
      breadcrumb: string;
      parentLabel: string;
      descendantCount: number;
    }> = [];
    const walk = (category: Category, depth: number) => {
      out.push({
        category,
        depth,
        breadcrumb: categoryBreadcrumb(category.id, tree.byId),
        parentLabel: categoryBreadcrumb(category.parent_id, tree.byId),
        descendantCount: descendants(category, tree).length,
      });
      for (const child of tree.childrenByParent.get(category.id) ?? []) walk(child, depth + 1);
    };
    for (const root of tree.roots) walk(root, 0);
    return out;
  }, [categories]);

  const query = categorySearch.trim().toLowerCase();
  const matchingOptions = query
    ? categoryOptions.filter((option) => option.category.name_nb.toLowerCase().includes(query))
    : categoryOptions;

  const selectedOption = categoryOptions.find(
    (option) => option.category.id === templateCategoryId,
  );
  const templateCategoryLabel = !selectedOption
    ? "Alle kategorier"
    : selectedOption.descendantCount > 0
      ? `${selectedOption.breadcrumb} (alle underkategorier)`
      : selectedOption.breadcrumb;

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
      setFileError(formatErrorMessage(error, "Filen kunne ikke leses."));
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
      {/* På desktop flyttes rullingen fra dialogruten til den indre div-en:
          kategori-popoveren portaleres inn i dialognoden, og `overflow-y-auto`
          der klipper den så snart listen strekker seg forbi dialogens kant.
          Bunn-sheeten på telefon beholder rullingen der vaul forventer den
          (se sheet.tsx), og trenger ingen egen høydebegrensning. */}
      <ResponsiveOverlayContent
        ref={setOverlayEl}
        className="max-h-[90vh] overflow-y-auto sm:max-w-4xl sm:overflow-y-visible"
      >
        <div className="space-y-6 sm:max-h-[calc(90vh-3rem)] sm:overflow-y-auto">
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
                  Obligatoriske kolonner: <code>external_id</code>, <code>category</code>,{" "}
                  <code>title</code>, <code>description</code> og <code>price</code>. Bruk{" "}
                  <code>external_id</code> som bedriftens egen stabile referanse, for eksempel
                  varenummer, SKU eller lager-ID. Verdien må være unik i filen. Pris er hele kroner
                  i NOK. Én annonse per rad; maks 500 rader og 5 MB. Bilder importeres ikke, og
                  bilde-URL-er støttes ikke.
                </AlertDescription>
              </Alert>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="bulk-location">Lokasjon for annonsene</Label>
                  <Select value={locationId} onValueChange={setLocationId}>
                    <SelectTrigger id="bulk-location">
                      <SelectValue placeholder="Velg lokasjon" />
                    </SelectTrigger>
                    <SelectContent>
                      {locations.map((location) => (
                        <SelectItem key={location.id} value={location.id}>
                          {location.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Lokasjon velges før import. Kolonnene postnummer og sted i filen brukes ikke.
                  </p>
                </div>
                <div
                  role="group"
                  aria-label="Vis besøksadresse"
                  className="flex items-start gap-3 rounded-md border p-3 text-sm"
                >
                  <input
                    id="bulk-show-address"
                    type="checkbox"
                    aria-label="Vis besøksadresse"
                    className="mt-1 size-4 accent-primary"
                    checked={showVisitingAddress}
                    onChange={(event) => setShowVisitingAddress(event.target.checked)}
                  />
                  <span>
                    <span className="font-medium">Vis besøksadresse</span>
                    <span className="block text-muted-foreground">
                      Publiser full gateadresse på annonsene.
                    </span>
                  </span>
                </div>
              </div>
              <div className="space-y-3">
                <div className="max-w-md space-y-2">
                  <Label id="template-category-label">Mal for kategori</Label>
                  <Popover
                    open={pickerOpen}
                    onOpenChange={(next) => {
                      setPickerOpen(next);
                      if (!next) setCategorySearch("");
                    }}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        role="combobox"
                        aria-expanded={pickerOpen}
                        aria-labelledby="template-category-label"
                        className="w-full justify-between font-normal"
                        disabled={categoriesLoading}
                      >
                        <span className="truncate">{templateCategoryLabel}</span>
                        <ChevronsUpDown className="size-4 opacity-60" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      container={overlayEl}
                      align="start"
                      collisionPadding={16}
                      className="w-(--radix-popover-trigger-width) p-0"
                    >
                      <Command shouldFilter={false}>
                        <CommandInput
                          placeholder="Søk i kategorier …"
                          value={categorySearch}
                          onValueChange={setCategorySearch}
                        />
                        <CommandList>
                          <CommandEmpty>Ingen kategorier funnet</CommandEmpty>
                          <CommandGroup>
                            {!query && (
                              <CommandItem
                                value="__all__"
                                onSelect={() => {
                                  setTemplateCategoryId(null);
                                  setPickerOpen(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "size-4 shrink-0",
                                    templateCategoryId ? "opacity-0" : "opacity-100",
                                  )}
                                />
                                <span className="flex flex-col">
                                  <span className="font-medium">Alle kategorier</span>
                                  <span className="text-xs text-muted-foreground">
                                    Mal med alle felles kolonner
                                  </span>
                                </span>
                              </CommandItem>
                            )}
                            {matchingOptions.map((option) => (
                              <CommandItem
                                key={option.category.id}
                                value={option.category.id}
                                onSelect={() => {
                                  setTemplateCategoryId(option.category.id);
                                  setPickerOpen(false);
                                }}
                                style={
                                  query
                                    ? undefined
                                    : { paddingLeft: `calc(0.5rem + ${option.depth} * 0.875rem)` }
                                }
                              >
                                <Check
                                  className={cn(
                                    "size-4 shrink-0",
                                    templateCategoryId === option.category.id
                                      ? "opacity-100"
                                      : "opacity-0",
                                  )}
                                />
                                <span className="min-w-0 flex-1 truncate">
                                  {query && option.parentLabel && (
                                    <span className="text-muted-foreground">
                                      {option.parentLabel} ›{" "}
                                    </span>
                                  )}
                                  <span className={option.depth === 0 ? "font-medium" : undefined}>
                                    {option.category.name_nb}
                                  </span>
                                </span>
                                {option.descendantCount > 0 && (
                                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                                    {option.descendantCount} underkategorier
                                  </span>
                                )}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <p className="text-xs text-muted-foreground">
                    Malen får kolonner og nedtrekksmenyer for feltene kategorien bruker. En
                    hovedkategori tar med alle underkategoriene sine.
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
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
                if (importId && parsed && locationId) {
                  setConfirmOpen(false);
                  createImport.mutate({
                    importId,
                    rows: parsed.rows,
                    locationId,
                    showVisitingAddress,
                  });
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
