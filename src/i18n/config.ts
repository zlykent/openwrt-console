/**
 * Client-safe i18n constants. Kept separate from `request.ts` (which imports
 * `next/headers`) so browser components can read the cookie name and locale
 * list without pulling server-only code into the client bundle.
 */
export const LOCALE_COOKIE = "NEXT_LOCALE";
export const locales = ["en", "zh"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  zh: "中文",
};

/**
 * Negotiate a supported locale from an `Accept-Language` header value
 * (e.g. `zh-CN,zh;q=0.9,en;q=0.8`), which is how a browser reports the
 * user's system/OS language preference.
 *
 * Entries are ranked by quality (q) descending; the first whose primary
 * subtag matches a supported locale wins, so region variants collapse to the
 * base language (`zh-TW` → `zh`, `en-GB` → `en`). Tags with `q=0` (explicitly
 * unacceptable) and the `*` wildcard are ignored. Returns `undefined` when
 * nothing matches, letting the caller apply its own fallback.
 */
export function negotiateLocale(
  acceptLanguage: string | null | undefined,
): Locale | undefined {
  if (!acceptLanguage) return undefined;

  const ranked = acceptLanguage
    .split(",")
    .map((part) => {
      const [rawTag, ...params] = part.trim().split(";");
      const tag = rawTag.trim().toLowerCase();
      let q = 1;
      for (const param of params) {
        const m = param.trim().match(/^q=([0-9.]+)$/i);
        if (m) {
          const parsed = Number.parseFloat(m[1]);
          q = Number.isNaN(parsed) ? 1 : parsed;
        }
      }
      return { tag, q };
    })
    .filter((entry) => entry.tag !== "" && entry.q > 0)
    // Stable sort by quality desc; ties keep header order.
    .sort((a, b) => b.q - a.q);

  for (const { tag } of ranked) {
    if (tag === "*") continue;
    const primary = tag.split("-")[0];
    if ((locales as readonly string[]).includes(primary)) return primary as Locale;
  }
  return undefined;
}
