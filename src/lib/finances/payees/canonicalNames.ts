/**
 * Canonical payee names for first-seen aliases, extracted from the starter rules'
 * `merchant` field.
 *
 * Applied only when a payee is minted. A later rename is the user's, and a re-run must
 * not undo it — the same invariant `seed.ts` already keeps.
 *
 * Spec: `agent-os/specs/2026-08-24-1522-category-by-kind-and-history/` D10.
 */

type NameHint = { match: RegExp; name: string };

const CANONICAL_NAMES: readonly NameHint[] = [
  { match: /^(TURBOTENANT|RENT:RAULI)|RENT:RAULI/, name: "Rent" },
  { match: /^SMECO/, name: "SMECO" },
  { match: /^ST MARYS COUNTY METROPOLI/, name: "St Mary's County Water" },
  { match: /^EVERGREEN DISPOSAL/, name: "Evergreen Disposal" },
  { match: /^TAYLOR GAS/, name: "Taylor Gas" },
  { match: /^(COMCAST|XFINITY)|COMCAST \/ XFINITY/, name: "Comcast / Xfinity" },
  { match: /^MINT MOBILE/, name: "Mint Mobile" },
  { match: /^SIMPLISAFE/, name: "SimpliSafe" },
  { match: /^(WM SUPERCENTER|WAL-?MART)/, name: "Walmart" },
  { match: /^SAFEWAY/, name: "Safeway" },
  { match: /^HARRIS TEETER/, name: "Harris Teeter" },
  { match: /^GIANT\b/, name: "Giant" },
  { match: /^WEIS MARKETS/, name: "Weis Markets" },
  { match: /^PIZZA HUT/, name: "Pizza Hut" },
  { match: /^CHIPOTLE( MEX GR)?/, name: "Chipotle" },
  { match: /^POTBELLY/, name: "Potbelly" },
  { match: /^PANDA EXPRESS/, name: "Panda Express" },
  { match: /^FIREHOUSE SUBS/, name: "Firehouse Subs" },
  { match: /^SHEETZ/, name: "Sheetz" },
  { match: /^WAWA/, name: "Wawa" },
  { match: /^METLIFE PET/, name: "MetLife Pet" },
  { match: /^VETSOURCE/, name: "VetSource" },
  { match: /^VCA\b/, name: "VCA Animal Hospital" },
  { match: /^CVS/, name: "CVS" },
  { match: /^WALGREENS/, name: "Walgreens" },
  { match: /^(ANTHROPIC|CLAUDE)/, name: "Anthropic" },
  { match: /^(GROK|XAI)/, name: "xAI" },
  { match: /^OPENAI/, name: "OpenAI" },
  { match: /^CURSOR/, name: "Cursor" },
  { match: /^GITHUB/, name: "GitHub" },
  { match: /^PADDLE/, name: "Paddle.com Market Limited" },
  // Exact Apple Inc. descriptors only. `/^APPLE/` also named
  // `APPLE GREENE WINE AND SPIDUNKIRKMD` — a liquor store — as Apple.
  { match: /^(APPLE\/BILL|APPLE\/US|APPLE SERVICES|APPLE)$/, name: "Apple" },
  { match: /^STEAM/, name: "Steam" },
  { match: /^PLAYSTATION/, name: "PlayStation" },
  { match: /^ITCH IO/, name: "itch.io" },
  { match: /^PRIME VIDEO/, name: "Prime Video" },
  { match: /^GOOGLE YOUTUBE/, name: "YouTube" },
  { match: /^SPOTIFY/, name: "Spotify USA Inc" },
  { match: /^GEICO/, name: "Geico" },
  { match: /^KIMS NAILS/, name: "Kim's Nails" },
  { match: /^RENT REPORTING/, name: "Rent Reporting" },
  { match: /^IRS\b/, name: "IRS" },
  { match: /^(SHEIN|SHEINUSSERV)/, name: "SHEIN" },
  { match: /^(AMAZON|AMZN)/, name: "Amazon" },
  { match: /^LOWES/, name: "Lowe's" },
  { match: /^HOME DEPOT/, name: "Home Depot" },
  { match: /^MONTHLY INTEREST PAID/, name: "Interest Paid" },
  { match: /^VACP TREAS/, name: "VA Benefits" },
];

/** Display name for a newly minted alias, or null to use the normalized string. */
export function canonicalPayeeName(normalizedMerchant: string): string | null {
  return (
    CANONICAL_NAMES.find((rule) => rule.match.test(normalizedMerchant))?.name ?? null
  );
}
