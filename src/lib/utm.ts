/** Parâmetros de origem do anúncio que a Utmify usa para atribuir a venda. */
export type TrackingParameters = Partial<
  Record<
    "src" | "sck" | "utm_source" | "utm_medium" | "utm_campaign" | "utm_content" | "utm_term",
    string
  >
>;

const STORAGE_KEY = "ferracini-utms";
const KEYS = [
  "src",
  "sck",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
] as const;

/** Guarda os UTMs da URL de entrada (a pessoa só chega com eles na primeira página; o checkout
 * é aberto várias telas depois). Uma nova visita com UTMs substitui a anterior. */
export function captureTrackingParameters(): void {
  try {
    const params = new URLSearchParams(window.location.search);
    const found: TrackingParameters = {};
    for (const key of KEYS) {
      const value = params.get(key)?.trim();
      if (value) found[key] = value.slice(0, 500);
    }
    if (Object.keys(found).length > 0) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(found));
    }
  } catch {
    // localStorage indisponível (aba privada etc.): segue sem atribuição.
  }
}

export function getTrackingParameters(): TrackingParameters {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as TrackingParameters) : {};
  } catch {
    return {};
  }
}
