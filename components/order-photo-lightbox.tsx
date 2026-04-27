"use client";

import { useEffect } from "react";

type Props = {
  urls: string[];
  index: number | null;
  onPrev?: () => void;
  onNext?: () => void;
  onClose: () => void;
};

/** Повноекранний перегляд фото; закриття — клік поза зображенням або Escape. */
export function OrderPhotoLightbox({ urls, index, onPrev, onNext, onClose }: Props) {
  const hasMany = urls.length > 1;
  const url = index != null && index >= 0 && index < urls.length ? urls[index] : null;

  useEffect(() => {
    if (!url) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (hasMany && e.key === "ArrowLeft") onPrev?.();
      if (hasMany && e.key === "ArrowRight") onNext?.();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [url, onClose]);

  if (!url) return null;

  return (
    <div
      className="fixed inset-0 z-200 flex items-center justify-center bg-black/95 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Перегляд фото"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Закрити перегляд"
        className="absolute right-4 top-4 z-201 flex h-10 w-10 items-center justify-center rounded-full border border-white/30 bg-black/50 text-2xl leading-none text-white transition hover:bg-black/70 focus:outline-none focus:ring-2 focus:ring-white"
      >
        ×
      </button>
      {hasMany ? (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onPrev?.();
            }}
            aria-label="Попереднє фото"
            className="absolute left-4 top-1/2 z-201 -translate-y-1/2 rounded-full border border-white/30 bg-black/50 px-3 py-2 text-xl text-white transition hover:bg-black/70 focus:outline-none focus:ring-2 focus:ring-white"
          >
            ←
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onNext?.();
            }}
            aria-label="Наступне фото"
            className="absolute right-4 top-1/2 z-201 -translate-y-1/2 rounded-full border border-white/30 bg-black/50 px-3 py-2 text-xl text-white transition hover:bg-black/70 focus:outline-none focus:ring-2 focus:ring-white"
          >
            →
          </button>
          <div className="pointer-events-none absolute bottom-4 left-1/2 z-201 -translate-x-1/2 rounded-full border border-white/20 bg-black/50 px-3 py-1 text-xs text-white">
            {index! + 1} / {urls.length}
          </div>
        </>
      ) : null}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt=""
        className="max-h-full max-w-full cursor-default object-contain shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
