"use client";

import { getFirebaseStorage } from "@/lib/firebase/client";
import { storageRefFromDownloadURL } from "@/lib/firebase/storage-ref-from-download-url";
import { ORDER_PHOTOS_MAX_COUNT, ORDER_PHOTOS_MAX_FILE_MB } from "@/lib/order-photos";
import { deleteObject, getDownloadURL, ref as storageRef, uploadBytes } from "firebase/storage";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { OrderPhotoLightbox } from "@/components/order-photo-lightbox";

const THUMB = "h-14 w-14 shrink-0";

export type OrderPhotosEditorHandle = {
  /** Завантажує нові файли, видаляє з Storage скасовані URL, повертає підсумковий масив для Firestore. */
  flush: (orderId: string) => Promise<string[]>;
};

type Props = {
  initialUrls?: string[] | null;
  resetKey: number;
  disabled?: boolean;
};

function safeExt(name: string): string {
  const p = name.split(".").pop();
  if (!p || !/^[a-z0-9]{1,8}$/i.test(p)) return "";
  return `.${p.toLowerCase()}`;
}

export const OrderPhotosEditor = forwardRef<OrderPhotosEditorHandle, Props>(function OrderPhotosEditor(
  { initialUrls, resetKey, disabled = false },
  ref,
) {
  const [remoteUrls, setRemoteUrls] = useState<string[]>([]);
  const [pendingDelete, setPendingDelete] = useState<string[]>([]);
  const [locals, setLocals] = useState<{ id: string; file: File; preview: string }[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const remoteUrlsRef = useRef(remoteUrls);
  const localsRef = useRef(locals);
  const pendingDeleteRef = useRef(pendingDelete);
  remoteUrlsRef.current = remoteUrls;
  localsRef.current = locals;
  pendingDeleteRef.current = pendingDelete;

  useEffect(() => {
    const urls = Array.isArray(initialUrls) ? initialUrls.filter((u) => typeof u === "string" && u.trim()) : [];
    setRemoteUrls(urls);
    setPendingDelete([]);
    setLocals((prev) => {
      for (const l of prev) URL.revokeObjectURL(l.preview);
      return [];
    });
  }, [resetKey, initialUrls]);

  const totalCount = remoteUrls.length + locals.length;
  const allPreviewUrls = [...remoteUrls, ...locals.map((l) => l.preview)];

  const addFiles = useCallback((list: FileList | null) => {
    if (!list || disabled) return;
    const maxBytes = ORDER_PHOTOS_MAX_FILE_MB * 1024 * 1024;
    setLocals((prev) => {
      let room = ORDER_PHOTOS_MAX_COUNT - remoteUrlsRef.current.length - prev.length;
      const next: { id: string; file: File; preview: string }[] = [];
      for (let i = 0; i < list.length && room > 0; i++) {
        const file = list[i];
        if (!file.type.startsWith("image/")) continue;
        if (file.size > maxBytes) continue;
        next.push({
          id: `${Date.now()}-${i}-${Math.random().toString(36).slice(2)}`,
          file,
          preview: URL.createObjectURL(file),
        });
        room -= 1;
      }
      return next.length ? [...prev, ...next] : prev;
    });
  }, [disabled]);

  const removeLocal = (id: string) => {
    setLocals((prev) => {
      const row = prev.find((x) => x.id === id);
      if (row) URL.revokeObjectURL(row.preview);
      return prev.filter((x) => x.id !== id);
    });
  };

  const removeRemote = (url: string) => {
    setRemoteUrls((prev) => prev.filter((u) => u !== url));
    setPendingDelete((prev) => (prev.includes(url) ? prev : [...prev, url]));
  };

  useImperativeHandle(ref, () => ({
    flush: async (orderId: string) => {
      const rem = remoteUrlsRef.current;
      const loc = localsRef.current;
      const del = pendingDeleteRef.current;
      const storage = getFirebaseStorage();
      for (const u of del) {
        try {
          await deleteObject(storageRefFromDownloadURL(storage, u));
        } catch {
          /* вже видалено або не наш bucket */
        }
      }
      const uploaded: string[] = [];
      for (const row of loc) {
        const ext = safeExt(row.file.name);
        const path = `orders/${orderId}/photos/${crypto.randomUUID()}${ext}`;
        const r = storageRef(storage, path);
        await uploadBytes(r, row.file, {
          contentType: row.file.type || "image/jpeg",
        });
        uploaded.push(await getDownloadURL(r));
      }
      for (const row of loc) {
        URL.revokeObjectURL(row.preview);
      }
      setLocals([]);
      setPendingDelete([]);
      const merged = [...rem, ...uploaded];
      setRemoteUrls(merged);
      return merged;
    },
  }), []);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <label className="text-sm font-medium text-foreground">Фото замовлення</label>
        <span className="text-xs text-muted">Необов’язково · до {ORDER_PHOTOS_MAX_COUNT} шт. · до {ORDER_PHOTOS_MAX_FILE_MB} МБ кожне</span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {remoteUrls.map((u) => (
          <div key={u} className={`relative ${THUMB}`}>
            <button
              type="button"
              disabled={disabled}
              onClick={(e) => {
                e.stopPropagation();
                setLightboxIndex(remoteUrls.indexOf(u));
              }}
              className={`${THUMB} block overflow-hidden rounded-lg border border-border bg-muted/30 shadow-sm focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={u} alt="" className="h-full w-full object-cover" loading="lazy" />
            </button>
            {!disabled ? (
              <button
                type="button"
                aria-label="Прибрати фото"
                onClick={() => removeRemote(u)}
                className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-white text-xs font-bold text-red-700 shadow hover:bg-red-50"
              >
                ×
              </button>
            ) : null}
          </div>
        ))}
        {locals.map((row) => (
          <div key={row.id} className={`relative ${THUMB}`}>
            <button
              type="button"
              disabled={disabled}
              onClick={(e) => {
                e.stopPropagation();
                setLightboxIndex(remoteUrls.length + locals.findIndex((l) => l.id === row.id));
              }}
              className={`${THUMB} block overflow-hidden rounded-lg border border-dashed border-accent/50 bg-accent-soft/30 focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={row.preview} alt="" className="h-full w-full object-cover" />
            </button>
            {!disabled ? (
              <button
                type="button"
                aria-label="Скасувати додавання"
                onClick={() => removeLocal(row.id)}
                className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-white text-xs font-bold text-red-700 shadow hover:bg-red-50"
              >
                ×
              </button>
            ) : null}
          </div>
        ))}
        {!disabled && totalCount < ORDER_PHOTOS_MAX_COUNT ? (
          <label className="flex h-14 w-14 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-dashed border-border bg-card text-xs font-medium text-muted transition hover:border-accent hover:text-foreground">
            +
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              onChange={(ev) => {
                addFiles(ev.target.files);
                ev.target.value = "";
              }}
            />
          </label>
        ) : null}
      </div>
      <OrderPhotoLightbox
        urls={allPreviewUrls}
        index={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
        onPrev={() =>
          setLightboxIndex((i) => (i == null ? 0 : (i - 1 + allPreviewUrls.length) % allPreviewUrls.length))
        }
        onNext={() => setLightboxIndex((i) => (i == null ? 0 : (i + 1) % allPreviewUrls.length))}
      />
    </div>
  );
});
