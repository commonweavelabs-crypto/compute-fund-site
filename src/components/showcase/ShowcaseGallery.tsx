"use client";

// Showcase gallery (spec: accounts-roles-profiles.md § "Project page = the showcase").
// Props-driven, client-only. Editable mode adds upload/remove/reorder controls
// for owners/managers; read-only mode renders the gallery + generated-art fallback.

import { useRef, useState } from "react";
import {
  validateImageFile,
  type ShowcaseImage,
} from "@/lib/showcase";

type ShowcaseGalleryProps = {
  images: ShowcaseImage[];
  /** generated placeholder art shown when the gallery is empty */
  fallbackImageUrl?: string | null;
  /** human project title, used for accessible image names */
  imageAltBase: string;
  editable?: boolean;
  uploading?: boolean;
  uploadError?: string | null;
  maxImages?: number;
  onUpload?: (files: File[]) => void;
  onRemove?: (image: ShowcaseImage) => void;
  /** called with the new full order after a move (persist via setGalleryOrder) */
  onReorder?: (ordered: ShowcaseImage[]) => void;
};

export default function ShowcaseGallery({
  images,
  fallbackImageUrl,
  imageAltBase,
  editable = false,
  uploading = false,
  uploadError = null,
  maxImages = 8,
  onUpload,
  onRemove,
  onReorder,
}: ShowcaseGalleryProps) {
  const [pending, setPending] = useState<File[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const slotsLeft = Math.max(0, maxImages - images.length);

  const addPending = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setPending((prev) => [...prev, ...Array.from(files)]);
  };

  const submitPending = () => {
    if (pending.length === 0 || !onUpload) return;
    onUpload(pending);
    setPending([]);
    if (inputRef.current) inputRef.current.value = "";
  };

  const move = (index: number, delta: number) => {
    if (!onReorder) return;
    const target = index + delta;
    if (target < 0 || target >= images.length) return;
    const next = [...images];
    [next[index], next[target]] = [next[target], next[index]];
    onReorder(next);
  };

  const dropPending = (name: string) => {
    setPending((prev) => prev.filter((f) => f.name !== name));
  };

  const hero = images[0] ?? null;

  return (
    <section aria-label="Project showcase gallery" className="flex flex-col gap-3">
      {/* hero: first image, else the generated placeholder */}
      <div className="border border-line bg-panel2">
        {hero ? (
          <img
            src={hero.url}
            alt={`${imageAltBase} — showcase image 1 of ${images.length}`}
            className="block h-auto w-full"
          />
        ) : fallbackImageUrl ? (
          <img
            src={fallbackImageUrl}
            alt={`${imageAltBase} — generated placeholder art`}
            className="block h-auto w-full opacity-80"
          />
        ) : (
          <div className="mono flex h-40 w-full items-center justify-center text-[11px] uppercase tracking-[0.14em] text-dim">
            no showcase art yet
          </div>
        )}
      </div>

      {images.length > 1 && (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3" aria-label="Gallery images">
          {images.map((img, i) => (
            <li key={img.id} className="flex flex-col gap-1">
              <img
                src={img.url}
                alt={`${imageAltBase} — showcase image ${i + 1} of ${images.length}`}
                className={`block h-auto w-full border border-line ${i === 0 ? "border-phos" : ""}`}
              />
              {editable && (
                <div className="flex items-center justify-between gap-1">
                  <span className="mono text-[10px] uppercase tracking-[0.14em] text-dim">#{img.position}</span>
                  <span className="flex gap-1">
                    <button
                      type="button"
                      aria-label={`Move image ${i + 1} earlier`}
                      disabled={i === 0}
                      onClick={() => move(i, -1)}
                      className="mono border border-line px-1.5 py-0.5 text-[10px] uppercase text-dim hover:text-tx disabled:opacity-30"
                    >
                      earlier
                    </button>
                    <button
                      type="button"
                      aria-label={`Move image ${i + 1} later`}
                      disabled={i === images.length - 1}
                      onClick={() => move(i, 1)}
                      className="mono border border-line px-1.5 py-0.5 text-[10px] uppercase text-dim hover:text-tx disabled:opacity-30"
                    >
                      later
                    </button>
                    {onRemove && (
                      <button
                        type="button"
                        aria-label={`Remove image ${i + 1}`}
                        onClick={() => onRemove(img)}
                        className="mono border border-line bg-panel px-1.5 py-0.5 text-[10px] uppercase text-amber hover:text-tx"
                      >
                        remove
                      </button>
                    )}
                  </span>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {editable && (
        <div className="flex flex-col gap-2 border border-line bg-panel p-3">
          <p className="mono text-[11px] uppercase tracking-[0.14em] text-dim">
            gallery — {images.length}/{maxImages} slots used
          </p>

          <input
            ref={inputRef}
            id="showcase-upload"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            aria-label="Add showcase images (jpg, png or webp, 5 MB max)"
            onChange={(e) => addPending(e.target.files)}
            className="mono w-full border border-line bg-panel2 px-2 py-1.5 text-[11px] text-tx file:mono file:border-0 file:bg-transparent file:text-[11px] file:text-dim"
          />

          {pending.length > 0 && (
            <ul className="flex flex-col gap-1" aria-label="Images queued for upload">
              {pending.map((f) => {
                const invalid = validateImageFile(f);
                return (
                  <li key={f.name} className="mono flex items-center justify-between gap-2 text-[11px]">
                    <span className={invalid ? "text-amber" : "text-dim"}>
                      {invalid ? invalid : f.name}
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove ${f.name} from upload queue`}
                      onClick={() => dropPending(f.name)}
                      className="text-dim hover:text-tx"
                    >
                      x
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={submitPending}
              disabled={pending.length === 0 || slotsLeft === 0 || uploading}
              className={`mono px-3 py-1 text-[11px] uppercase tracking-[0.14em] ${
                pending.length > 0 && slotsLeft > 0 && !uploading
                  ? "border border-phos bg-phos text-bg"
                  : "border border-line bg-panel text-dim"
              } disabled:opacity-50`}
            >
              {uploading ? "uploading" : `upload ${pending.length || ""} image${pending.length === 1 ? "" : "s"}`}
            </button>
            {slotsLeft === 0 && (
              <span className="mono text-[11px] text-amber">gallery full</span>
            )}
          </div>

          {uploadError && (
            <p className="mono text-[11px] text-amber" role="alert" aria-live="polite">
              {uploadError}
            </p>
          )}
        </div>
      )}
    </section>
  );
}