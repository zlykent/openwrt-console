import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import {
  defaultLocale,
  LOCALE_COOKIE,
  locales,
  negotiateLocale,
  type Locale,
} from "./config";
import en from "./messages/en.json";
import zh from "./messages/zh.json";

const dictionaries: Record<Locale, unknown> = { en, zh };

function isLocale(value: string | undefined): value is Locale {
  return value !== undefined && (locales as readonly string[]).includes(value);
}

export default getRequestConfig(async () => {
  const store = await cookies();
  const candidate = store.get(LOCALE_COOKIE)?.value;

  // Precedence: an explicit user choice (cookie) always wins; otherwise detect
  // the browser/system language from Accept-Language; finally fall back to the
  // app default. Detection is stateless — nothing is written to the cookie, so
  // a manual switch via LocaleSwitcher still overrides on later requests.
  let locale: Locale;
  if (isLocale(candidate)) {
    locale = candidate;
  } else {
    const headerList = await headers();
    locale = negotiateLocale(headerList.get("accept-language")) ?? defaultLocale;
  }

  return {
    locale,
    // Static JSON imports are inferred as `unknown`; both dictionaries share
    // the `en` shape, so assert it to satisfy next-intl's message type.
    messages: dictionaries[locale] as typeof en,
  };
});
