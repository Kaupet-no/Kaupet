import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ChevronsUpDown } from "lucide-react";
import { Loader2 } from "lucide-react";
import { showSuccessToast, showErrorToast } from "@/lib/toast";
import { supabase } from "@/integrations/supabase/client";
import { CategoryPicker } from "@/components/category-picker";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DialogFooter } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { formatErrorMessage } from "@/lib/errors";
import { ALL_ICON_OPTIONS, CategoryIcon } from "@/lib/category-icons";
import { CATEGORY_HEADING_FONTS, DEFAULT_CATEGORY_HEADING_FONT } from "@/lib/category-fonts";
import { collectDescendantIds, depthOf, MAX_CATEGORY_DEPTH } from "@/lib/category-admin-tree";
import { MAIN_CATEGORY_COLOR_PRESETS, slugify, type Category } from "./shared";

export function CategoryDetailsPanel({
  category,
  parentId,
  categories,
  dialogEl,
  onClose,
  onSaved,
}: {
  category: Category | null;
  parentId: string | null;
  categories: Category[];
  dialogEl: HTMLDivElement | null;
  onClose: () => void;
  onSaved: (saved: Category) => void;
}) {
  const [name, setName] = useState(category?.name_nb ?? "");
  const [slug, setSlug] = useState(category?.slug ?? "");
  const [parent, setParent] = useState<string>(category?.parent_id ?? parentId ?? "__none__");
  const [slugTouched, setSlugTouched] = useState(!!category);
  const [icon, setIcon] = useState<string | null>(category?.icon ?? null);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [iconSearch, setIconSearch] = useState("");
  const filteredIconOptions = useMemo(() => {
    const q = iconSearch.trim().toLowerCase();
    if (!q) return ALL_ICON_OPTIONS.slice(0, 100);
    return ALL_ICON_OPTIONS.filter((o) => o.name.toLowerCase().includes(q)).slice(0, 100);
  }, [iconSearch]);
  const [parentPickerOpen, setParentPickerOpen] = useState(false);
  const [color, setColor] = useState<string>(category?.color ?? "");
  const [headingFont, setHeadingFont] = useState<string>(
    category?.heading_font ?? DEFAULT_CATEGORY_HEADING_FONT,
  );
  const [searchExamples, setSearchExamples] = useState<string>(
    (category?.search_examples ?? []).join("\n"),
  );
  const [titleExample, setTitleExample] = useState<string>(category?.title_example ?? "");
  const [isHidden, setIsHidden] = useState(category?.is_hidden ?? false);

  const save = useMutation({
    mutationFn: async () => {
      const newParentId = parent === "__none__" ? null : parent;
      const payload = {
        name_nb: name.trim(),
        slug: slug.trim() || slugify(name),
        parent_id: newParentId,
        icon,
        // Color and heading font only apply to main (top-level) categories.
        color: parent === "__none__" ? color.trim() || null : null,
        heading_font: parent === "__none__" ? headingFont : null,
        search_examples: searchExamples
          .split("\n")
          .map((w) => w.trim())
          .filter(Boolean),
        title_example: titleExample.trim() || null,
        is_hidden: isHidden,
      };
      if (category) {
        const { data, error } = await supabase
          .from("categories")
          .update(payload)
          .eq("id", category.id)
          .select(
            "id, name_nb, slug, parent_id, sort_order, icon, color, heading_font, search_examples, title_example, is_hidden",
          )
          .single();
        if (error) throw error;
        return data as Category;
      } else {
        // New categories are appended last within their sibling group;
        // drag-and-drop is the only way to reorder afterwards.
        const siblingMaxSortOrder = Math.max(
          0,
          ...categories
            .filter((c) => (c.parent_id ?? null) === newParentId)
            .map((c) => c.sort_order),
        );
        const { data, error } = await supabase
          .from("categories")
          .insert({ ...payload, sort_order: siblingMaxSortOrder + 10 })
          .select(
            "id, name_nb, slug, parent_id, sort_order, icon, color, heading_font, search_examples, title_example, is_hidden",
          )
          .single();
        if (error) throw error;
        return data as Category;
      }
    },
    onSuccess: (saved) => {
      showSuccessToast(category ? "Kategori oppdatert" : "Kategori opprettet");
      onSaved(saved);
    },
    onError: (e: Error) => showErrorToast(formatErrorMessage(e, "Kunne ikke lagre kategorien")),
  });

  const excludedIds = category ? collectDescendantIds(categories, category.id) : new Set<string>();
  if (category) excludedIds.add(category.id);
  const possibleParents = categories
    .filter((c) => !excludedIds.has(c.id))
    .filter((c) => depthOf(c.id, categories) < MAX_CATEGORY_DEPTH - 1);

  return (
    <>
      {parentId && !category && (
        <p className="text-sm text-muted-foreground">Opprettes som underkategori.</p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) {
            showErrorToast("Navn er påkrevd");
            return;
          }
          if (parent !== "__none__" && depthOf(parent, categories) >= MAX_CATEGORY_DEPTH - 1) {
            showErrorToast(`Maks kategoridybde er ${MAX_CATEGORY_DEPTH} nivåer`);
            return;
          }
          save.mutate();
        }}
        className="space-y-4"
      >
        <div className="space-y-2">
          <Label htmlFor="name">Navn</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (!slugTouched) setSlug(slugify(e.target.value));
            }}
            required
            maxLength={80}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="slug">Slug</Label>
          <Input
            id="slug"
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value);
              setSlugTouched(true);
            }}
            maxLength={80}
            placeholder="auto-generert fra navn"
          />
          {parent === "__none__" && slug.trim() && (
            <p className="text-xs text-muted-foreground">Landingsside: kaupet.no/{slug.trim()}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label>Ikon</Label>
          <Popover
            open={iconPickerOpen}
            onOpenChange={(open) => {
              setIconPickerOpen(open);
              if (!open) setIconSearch("");
            }}
          >
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                role="combobox"
                aria-expanded={iconPickerOpen}
                className="w-full justify-between"
              >
                <span className="flex items-center gap-2">
                  <CategoryIcon iconName={icon} className="size-4" />
                  {icon ?? "Velg ikon"}
                </span>
                <ChevronsUpDown className="size-4 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent container={dialogEl} className="w-(--radix-popover-trigger-width) p-0">
              <Command shouldFilter={false}>
                <CommandInput
                  placeholder="Søk eller skriv inn ikon-navn…"
                  value={iconSearch}
                  onValueChange={setIconSearch}
                />
                <CommandList>
                  <CommandEmpty>
                    {iconSearch.trim() ? (
                      <button
                        type="button"
                        className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm hover:bg-accent"
                        onClick={() => {
                          setIcon(iconSearch.trim());
                          setIconPickerOpen(false);
                        }}
                      >
                        Bruk «{iconSearch.trim()}» som ikon-navn
                      </button>
                    ) : (
                      "Ingen ikoner funnet"
                    )}
                  </CommandEmpty>
                  <CommandGroup>
                    {filteredIconOptions.map(({ name: iconName, icon: IconComponent }) => (
                      <CommandItem
                        key={iconName}
                        value={iconName}
                        onSelect={() => {
                          setIcon(iconName);
                          setIconPickerOpen(false);
                        }}
                      >
                        <IconComponent className="size-4" />
                        {iconName}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
        {parent === "__none__" && (
          <div className="space-y-2">
            <Label htmlFor="color">Farge (hovedkategori)</Label>
            <div className="flex items-center gap-2">
              <span
                className="size-9 shrink-0 rounded-md border"
                style={{ background: color || "transparent" }}
                aria-hidden
              />
              <Input
                id="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                placeholder="oklch(0.62 0.13 250)"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {MAIN_CATEGORY_COLOR_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setColor(preset)}
                  className="size-6 rounded-full border ring-offset-background transition hover:ring-2 hover:ring-ring"
                  style={{ background: preset }}
                  aria-label={`Velg farge ${preset}`}
                />
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Brukes som bakgrunn på landingssiden og som aksent på kategorisiden. La stå tom for å
              skjule kategorien som hovedkategori.
            </p>
          </div>
        )}
        {parent === "__none__" && (
          <div className="space-y-2">
            <Label htmlFor="heading-font">Overskriftsfont (hovedkategori)</Label>
            <Select value={headingFont} onValueChange={setHeadingFont}>
              <SelectTrigger id="heading-font">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CATEGORY_HEADING_FONTS).map(([token, { label, stack }]) => (
                  <SelectItem key={token} value={token}>
                    <span style={{ fontFamily: stack }}>{label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Brukes på kategori-overskriften som vises på landingssiden når kategorien er valgt.
            </p>
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="search-examples">Eksempelsøkeord</Label>
          <Textarea
            id="search-examples"
            value={searchExamples}
            onChange={(e) => setSearchExamples(e.target.value)}
            placeholder={"iPhone 15\nPlayStation 5\nairpods"}
            rows={4}
          />
          <p className="text-xs text-muted-foreground">
            Ett ord/uttrykk per linje. Rulleres i søkefeltets typewriter-animasjon på landingssiden
            når kategorien er valgt. Tom liste faller tilbake til underkategorinavn.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="title-example">Tittel-eksempel</Label>
          <Input
            id="title-example"
            value={titleExample}
            onChange={(e) => setTitleExample(e.target.value)}
            maxLength={120}
            placeholder="Levis Ribcage Straight Blå Jeans"
          />
          <p className="text-xs text-muted-foreground">
            Vises som «F.eks. …»-eksempel i tittelfeltet ved annonseopprettelse for denne kategorien
            og underkategoriene uten eget eksempel. Tom faller tilbake til overordnet kategori.
          </p>
        </div>
        <div className="space-y-2">
          <Label
            htmlFor="is-hidden"
            className="flex items-center gap-2 text-sm font-normal text-foreground"
          >
            <Checkbox
              id="is-hidden"
              checked={isHidden}
              onCheckedChange={(v) => setIsHidden(Boolean(v))}
            />
            Skjult for sluttbrukere
          </Label>
          <p className="text-xs text-muted-foreground">
            Filtreres bort fra landingssider, søk/browse, kategorisider og sitemap.xml. Fortsatt
            valgbar i kategorivelgeren ved annonseopprettelse — bruk til f.eks. dedikerte
            e2e-testkategorier.
          </p>
        </div>
        <div className="grid gap-4">
          <div className="space-y-2">
            <Label>Overordnet kategori</Label>
            <CategoryPicker
              open={parentPickerOpen}
              onOpenChange={setParentPickerOpen}
              categories={possibleParents}
              selectedId={parent}
              allowSelectAny
              onSelect={(categoryId) => setParent(categoryId)}
              trigger={
                <Button type="button" variant="outline" className="w-full justify-between">
                  {parent === "__none__"
                    ? "Ingen (toppnivå)"
                    : (categories.find((c) => c.id === parent)?.name_nb ??
                      "Velg overordnet kategori")}
                  <ChevronsUpDown className="size-4 opacity-50" />
                </Button>
              }
            />
            {parent !== "__none__" &&
              (color.trim() ||
                searchExamples.trim() ||
                headingFont !== DEFAULT_CATEGORY_HEADING_FONT) && (
                <p className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">
                  Denne kategorien har farge, font eller søkeeksempler satt som hovedkategori. Disse
                  fjernes når du lagrer med en overordnet kategori valgt.
                </p>
              )}
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Avbryt
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? <Loader2 className="size-4 animate-spin" /> : "Lagre"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
