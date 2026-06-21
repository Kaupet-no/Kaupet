type ListingImage = { storage_path: string; sort_order: number };

export function ImageGallery({
  images,
  imgUrls,
  activeImage,
  onSelect,
  title,
}: {
  images: ListingImage[];
  imgUrls: Record<string, string>;
  activeImage: number;
  onSelect: (index: number) => void;
  title: string;
}) {
  return (
    <>
      <div className="aspect-[4/3] overflow-hidden rounded-xl border border-border bg-muted">
        {images.length > 0 ? (
          <img
            src={imgUrls[images[activeImage].storage_path]}
            alt={title}
            className="size-full object-contain"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-sm text-muted-foreground">
            Ingen bilder
          </div>
        )}
      </div>
      {images.length > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto" role="list">
          {images.map((img, i) => (
            <button
              key={img.storage_path}
              type="button"
              onClick={() => onSelect(i)}
              aria-label={`Vis bilde ${i + 1} av ${images.length} for «${title}»`}
              aria-pressed={i === activeImage}
              className={`size-20 shrink-0 overflow-hidden rounded-lg border-2 ${
                i === activeImage ? "border-primary" : "border-transparent"
              }`}
            >
              {imgUrls[img.storage_path] && (
                <img src={imgUrls[img.storage_path]} alt="" className="size-full object-cover" />
              )}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
