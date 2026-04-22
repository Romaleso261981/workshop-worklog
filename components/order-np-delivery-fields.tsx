"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Props = {
  resetKey: string | number;
  initialSettlementRef?: string | null;
  initialSettlementLabel?: string | null;
  initialWarehouseRef?: string | null;
  initialWarehouseLabel?: string | null;
  /** Якщо true — без абзацу про NOVA_POSHTA_API_KEY / .env (наприклад у формі адміна). */
  hideManualApiHint?: boolean;
};

/**
 * Населений пункт + відділення Нової Пошти (потрібен NOVA_POSHTA_API_KEY на сервері).
 * Без ключа — ручний ввід населеного пункту та відділення текстом.
 */
export function OrderNpDeliveryFields({
  resetKey,
  initialSettlementRef,
  initialSettlementLabel,
  initialWarehouseRef,
  initialWarehouseLabel,
  hideManualApiHint = false,
}: Props) {
  const [npAvailable, setNpAvailable] = useState<boolean | null>(null);

  const [setRef, setSetRef] = useState("");
  const [setLabel, setSetLabel] = useState("");
  const [query, setQuery] = useState("");
  const [setItems, setSetItems] = useState<{ ref: string; label: string }[]>([]);
  const [setOpen, setSetOpen] = useState(false);
  const [setLoading, setSetLoading] = useState(false);
  /** Підказка всередині випадаючого списку (порожній пошук, мережа тощо). */
  const [setHint, setSetHint] = useState<string | null>(null);
  /** НП відхилила ключ — показуємо під полем завжди, не лише в списку. */
  const [npKeyRejected, setNpKeyRejected] = useState(false);

  const [whItems, setWhItems] = useState<{ ref: string; label: string }[]>([]);
  const [whLoading, setWhLoading] = useState(false);
  const [whRef, setWhRef] = useState("");
  const [whLabel, setWhLabel] = useState("");

  const wrapRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void fetch("/api/novaposhta/settlements?probe=1")
      .then((r) => r.json())
      .then((j: { settlementsAvailable?: boolean }) => {
        setNpAvailable(Boolean(j.settlementsAvailable));
      })
      .catch(() => setNpAvailable(false));
  }, []);

  useEffect(() => {
    setSetRef((initialSettlementRef ?? "").trim());
    const sl = (initialSettlementLabel ?? "").trim();
    setSetLabel(sl);
    setQuery(sl);
    setSetItems([]);
    setSetHint(null);
    setNpKeyRejected(false);
    setSetOpen(false);
    setWhRef((initialWarehouseRef ?? "").trim());
    setWhLabel((initialWarehouseLabel ?? "").trim());
    setWhItems([]);
  }, [resetKey, initialSettlementRef, initialSettlementLabel, initialWarehouseRef, initialWarehouseLabel]);

  const runSettlementSearch = useCallback((text: string) => {
    if (text.trim().length < 2) {
      setSetItems([]);
      setSetHint(null);
      return;
    }
    setSetLoading(true);
    setSetHint(null);
    void fetch(`/api/novaposhta/settlements?q=${encodeURIComponent(text.trim())}`)
      .then((r) => r.json())
      .then(
        (j: {
          ok?: boolean;
          hint?: string;
          items?: { ref: string; label: string }[];
          errors?: unknown;
        }) => {
          if (j && j.ok === false) {
            setSetItems([]);
            const keyBad =
              j.hint === "invalid_api_key" ||
              (Array.isArray(j.errors) && j.errors.some((e) => typeof e === "string" && /api key/i.test(e)));
            setNpKeyRejected(Boolean(keyBad));
            if (keyBad) {
              setSetHint(
                "Нова Пошта відхилила API-ключ. Згенеруйте ключ у кабінеті (Інформаційні сервіси / API), вставте в .env.local без лапок, перезапустіть dev-сервер.",
              );
            } else {
              const raw = Array.isArray(j.errors) ? j.errors[0] : j.errors;
              const msg = typeof raw === "string" ? raw : "Помилка сервісу Нової Пошти.";
              setSetHint(`Нова Пошта: ${msg}`);
            }
            return;
          }
          setNpKeyRejected(false);
          const items = Array.isArray(j.items) ? j.items : [];
          setSetItems(items);
          if (items.length === 0) {
            setSetHint("За цим запитом нічого не знайдено — спробуйте інше написання або повну назву.");
          }
        },
      )
      .catch(() => {
        setSetItems([]);
        setSetHint("Помилка мережі при зверненні до підказок.");
      })
      .finally(() => setSetLoading(false));
  }, []);

  useEffect(() => {
    if (npAvailable !== true) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      runSettlementSearch(query);
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, npAvailable, runSettlementSearch]);

  useEffect(() => {
    function onDocClick(ev: MouseEvent) {
      if (!wrapRef.current?.contains(ev.target as Node)) setSetOpen(false);
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  useEffect(() => {
    if (npAvailable !== true || !setRef) {
      setWhItems([]);
      return;
    }
    setWhLoading(true);
    void fetch(`/api/novaposhta/warehouses?settlementRef=${encodeURIComponent(setRef)}`)
      .then((r) => r.json())
      .then((j: { items?: { ref: string; label: string }[] }) => {
        setWhItems(Array.isArray(j.items) ? j.items : []);
      })
      .catch(() => setWhItems([]))
      .finally(() => setWhLoading(false));
  }, [setRef, npAvailable]);

  /** Підпис для збереження: обраний зі списку або текст із поля пошуку, якщо API не дав обрати ref. */
  const settlementLabelForSubmit = useMemo(
    () => setLabel.trim() || query.trim(),
    [setLabel, query],
  );

  if (npAvailable === null) {
    return <p className="text-xs text-muted">Перевірка Нової Пошти…</p>;
  }

  if (!npAvailable) {
    return (
      <div className="space-y-4">
        <input type="hidden" name="npSettlementRef" value="" />
        <input type="hidden" name="npWarehouseRef" value="" />
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="npSettlementLabel-manual">
            Населений пункт (вручну)
          </label>
          <textarea
            id="npSettlementLabel-manual"
            name="npSettlementLabel"
            rows={2}
            value={setLabel}
            onChange={(ev) => setSetLabel(ev.target.value)}
            placeholder="Напр. смт Ладижин, Вінницька обл., Гайсинський р-н"
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none ring-accent focus:ring-2"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="npWarehouseLabel-manual">
            Відділення Нової Пошти (вручну)
          </label>
          <input
            id="npWarehouseLabel-manual"
            name="npWarehouseLabel"
            value={whLabel}
            onChange={(ev) => setWhLabel(ev.target.value)}
            placeholder="Напр. Відділення №1"
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none ring-accent focus:ring-2"
          />
        </div>
        {hideManualApiHint ? null : (
          <p className="text-xs text-muted">
            Щоб з’явились підказки як в інтернет-магазині (населений пункт → список відділень), додайте ключ{" "}
            <code className="rounded bg-accent-soft px-1">NOVA_POSHTA_API_KEY</code> у <code className="rounded bg-accent-soft px-1">.env.local</code> — див. коментар у файлі <code className="rounded bg-accent-soft px-1">.env.example</code>.
          </p>
        )}
      </div>
    );
  }

  return (
    <div ref={wrapRef} className="space-y-4">
      <input type="hidden" name="npSettlementRef" value={setRef} />
      <input type="hidden" name="npSettlementLabel" value={settlementLabelForSubmit} />
      <input type="hidden" name="npWarehouseRef" value={whRef} />
      <input type="hidden" name="npWarehouseLabel" value={whLabel} />

      <div className="space-y-2">
        <label className="mb-1 block text-sm font-medium" htmlFor="np-settlement-search">
          Населений пункт (Нова Пошта)
        </label>
        <div className="relative">
          <input
            id="np-settlement-search"
            type="search"
            autoComplete="off"
            value={query}
            onChange={(ev) => {
              setQuery(ev.target.value);
              setSetOpen(true);
            }}
            onFocus={() => setSetOpen(true)}
            placeholder="Почніть вводити: Ладижин, Київ…"
            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none ring-accent focus:ring-2"
          />
          {setOpen && query.trim().length >= 2 ? (
            <ul className="absolute z-100 mt-1 max-h-52 w-full overflow-auto rounded-lg border border-border bg-card py-1 text-sm shadow-lg">
              {setLoading ? (
                <li className="px-3 py-2 text-muted">Завантаження…</li>
              ) : setHint ? (
                <li className="px-3 py-2 text-left text-xs text-amber-950">{setHint}</li>
              ) : setItems.length === 0 ? (
                <li className="px-3 py-2 text-xs text-muted">Немає варіантів.</li>
              ) : (
                setItems.map((it) => (
                  <li key={it.ref}>
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left hover:bg-accent-soft"
                      onMouseDown={(ev) => ev.preventDefault()}
                      onClick={() => {
                        setSetRef(it.ref);
                        setSetLabel(it.label);
                        setQuery(it.label);
                        setSetOpen(false);
                        setSetHint(null);
                        setWhRef("");
                        setWhLabel("");
                      }}
                    >
                      {it.label}
                    </button>
                  </li>
                ))
              )}
            </ul>
          ) : null}
        </div>
        {npKeyRejected ? (
          <p className="text-xs text-red-800" role="alert">
            Ключ у <code className="rounded bg-accent-soft px-1">.env.local</code> є, але Нова Пошта його не приймає.
            Потрібен саме API-ключ із кабінету (не пароль і не токен з іншого сервісу). Після зміни обов’язково перезапустіть{" "}
            <code className="rounded bg-accent-soft px-1">npm run dev</code>.
          </p>
        ) : null}
        {setLabel ? (
          <p className="text-xs text-muted">
            Обрано: <span className="text-foreground">{setLabel}</span>
          </p>
        ) : query.trim() ? (
          <p className="text-xs text-muted">
            У замовлення піде введений текст: <span className="text-foreground">{query.trim()}</span>
          </p>
        ) : (
          <p className="text-xs text-muted">Оберіть населений пункт зі списку або введіть назву в полі вище.</p>
        )}
      </div>

      {setRef ? (
        <div className="space-y-2">
          <label className="mb-1 block text-sm font-medium" htmlFor="np-warehouse-select">
            Відділення Нової Пошти
          </label>
          {whLoading ? (
            <p className="text-xs text-muted">Завантаження відділень…</p>
          ) : whItems.length === 0 ? (
            <div className="space-y-2">
              <p className="text-xs text-amber-800">
                Відділень з API не завантажилось або список порожній. Можна ввести відділення текстом — воно збережеться з
                замовленням.
              </p>
              <input
                type="text"
                value={whLabel}
                onChange={(ev) => {
                  setWhRef("");
                  setWhLabel(ev.target.value);
                }}
                placeholder="Напр. Відділення №3 або повна адреса відділення"
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none ring-accent focus:ring-2"
              />
            </div>
          ) : (
            <select
              id="np-warehouse-select"
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none ring-accent focus:ring-2"
              value={whRef}
              onChange={(ev) => {
                const v = ev.target.value;
                setWhRef(v);
                const opt = whItems.find((w) => w.ref === v);
                setWhLabel(opt?.label ?? "");
              }}
            >
              <option value="">— оберіть відділення —</option>
              {whItems.map((w) => (
                <option key={w.ref} value={w.ref}>
                  {w.label}
                </option>
              ))}
            </select>
          )}
        </div>
      ) : null}
    </div>
  );
}
