/**
 * Description rules — the tier that actually categorises this data set.
 *
 * The bank's own label is missing on every row of the 360 feed and too broad on most of the
 * rest (`Merchandise` covers a grocery run and a video game), so the merchant name is the
 * only signal with enough resolution to answer "where could I cut back". These rules read
 * the **normalized** merchant from `merchant.ts`, never the raw description, so a store
 * number or a PayPal stamp cannot break a match.
 *
 * **First match wins**, and the array order is the priority order. Put the specific rule
 * above the general one — `METLIFE PET` has to beat a bare `METLIFE`, or pet insurance
 * files under Insurance and the Pets total is quietly short.
 *
 * A rule may also supply a canonical `merchant`. That is how two spellings become one
 * merchant: `WM SUPERCENTER` and `WAL-MART` normalize differently and always will, because
 * the fact that they are one company is knowledge about the world rather than about the
 * string. Recording it here keeps it visible and correctable as a list.
 *
 * This list is expected to grow by inspection — reclassify, read the register, add the rule
 * that was missing. It is data, not logic; adding a line should never require reading the
 * matcher.
 */

import type { FinanceFlowKind } from "@/db/schema";
import type { FinanceCategory } from "./categories";

export type ClassifyRule = {
  /** Stable identifier, so a rule can be cited when explaining why a row was categorised. */
  id: string;
  /** Tested against the normalized merchant, which is already uppercase. */
  match: RegExp;
  category?: FinanceCategory;
  /** Only set where the merchant itself settles the flow — interest is never "spending". */
  flow?: FinanceFlowKind;
  /** Canonical display name, when the normalized string is not one. */
  merchant?: string;
};

export const CLASSIFY_RULES: readonly ClassifyRule[] = [
  // — Housing and utilities ————————————————————————————————————————————————
  // Rent arrives under three different payer strings for the same $2,100; the memo token
  // `RENT:RAULI` is the only part common to all of them.
  {
    id: "rent",
    match: /^(TURBOTENANT|RENT:RAULI)|RENT:RAULI/,
    category: "Rent & Housing",
    merchant: "Rent",
  },
  { id: "smeco", match: /^SMECO/, category: "Utilities", merchant: "SMECO" },
  {
    id: "st-marys-water",
    match: /^ST MARYS COUNTY METROPOLI/,
    category: "Utilities",
    merchant: "St Mary's County Water",
  },
  {
    id: "evergreen-disposal",
    match: /^EVERGREEN DISPOSAL/,
    category: "Utilities",
    merchant: "Evergreen Disposal",
  },
  // Propane, billed twice a year. The trading name says "HEATING AIR", which is why the
  // bank files it under home services and it needs a rule to read as the utility it is.
  {
    id: "taylor-gas",
    match: /^TAYLOR GAS/,
    category: "Utilities",
    merchant: "Taylor Gas",
  },
  {
    id: "comcast",
    match: /^(COMCAST|XFINITY)|COMCAST \/ XFINITY/,
    category: "Phone & Internet",
    merchant: "Comcast / Xfinity",
  },
  {
    id: "mint-mobile",
    match: /^MINT MOBILE/,
    category: "Phone & Internet",
    merchant: "Mint Mobile",
  },
  {
    id: "simplisafe",
    match: /^SIMPLISAFE/,
    category: "Home & Security",
    merchant: "SimpliSafe",
  },

  // — Groceries ————————————————————————————————————————————————————————————
  {
    id: "walmart",
    match: /^(WM SUPERCENTER|WAL-?MART)/,
    category: "Groceries",
    merchant: "Walmart",
  },
  { id: "safeway", match: /^SAFEWAY/, category: "Groceries", merchant: "Safeway" },
  {
    id: "harris-teeter",
    match: /^HARRIS TEETER/,
    category: "Groceries",
    merchant: "Harris Teeter",
  },
  { id: "giant", match: /^GIANT\b/, category: "Groceries", merchant: "Giant" },
  {
    id: "weis",
    match: /^WEIS MARKETS/,
    category: "Groceries",
    merchant: "Weis Markets",
  },
  {
    id: "grocery-chains",
    match: /^(FOOD LION|ALDI|TRADER JOE|WHOLE FOODS|WEGMANS|SHOPPERS)/,
    category: "Groceries",
  },

  // — Dining ———————————————————————————————————————————————————————————————
  { id: "pizza-hut", match: /^PIZZA HUT/, category: "Dining", merchant: "Pizza Hut" },
  {
    id: "chipotle",
    match: /^CHIPOTLE( MEX GR)?/,
    category: "Dining",
    merchant: "Chipotle",
  },
  { id: "potbelly", match: /^POTBELLY/, category: "Dining", merchant: "Potbelly" },
  {
    id: "panda-express",
    match: /^PANDA EXPRESS/,
    category: "Dining",
    merchant: "Panda Express",
  },
  {
    id: "firehouse",
    match: /^FIREHOUSE SUBS/,
    category: "Dining",
    merchant: "Firehouse Subs",
  },
  {
    id: "dining-chains",
    match:
      /^(SBARRO|LITTLE CAESAR|DOMINO|MCDONALD|SUBWAY|BURGER KING|WENDY|TACO BELL|STARBUCKS|DUNKIN|POPEYES|CHICK-FIL-A|FIVE GUYS|PAPA JOHN|IHOP|DENNY|ARBY)/,
    category: "Dining",
  },

  // — Fuel ————————————————————————————————————————————————————————————————
  { id: "sheetz", match: /^SHEETZ/, category: "Gas & Auto", merchant: "Sheetz" },
  { id: "wawa", match: /^WAWA/, category: "Gas & Auto", merchant: "Wawa" },
  {
    id: "fuel-chains",
    match:
      /^(ROYAL FARMS|EXXON|SHELL OIL|BP#|SUNOCO|CIRCLE K|SPEEDWAY|VALERO|MARATHON)/,
    category: "Gas & Auto",
  },

  // — Pets (before Insurance, so pet insurance counts as a pet cost) ——————————
  {
    id: "metlife-pet",
    match: /^METLIFE PET/,
    category: "Pets",
    merchant: "MetLife Pet",
  },
  { id: "vetsource", match: /^VETSOURCE/, category: "Pets", merchant: "VetSource" },
  { id: "vca", match: /^VCA\b/, category: "Pets", merchant: "VCA Animal Hospital" },
  { id: "chewy", match: /^(CHEWY|PETSMART|PETCO)/, category: "Pets" },

  // — Health ———————————————————————————————————————————————————————————————
  { id: "cvs", match: /^CVS/, category: "Health", merchant: "CVS" },
  { id: "walgreens", match: /^WALGREENS/, category: "Health", merchant: "Walgreens" },
  {
    id: "health-providers",
    match: /^(MEDSTAR|SHADYGROVE|SHADY GROVE|QUEST DIAG|LABCORP|ONE MEDICAL)/,
    category: "Health",
  },

  // — Software, AI and developer tools ——————————————————————————————————————
  {
    id: "anthropic",
    match: /^(ANTHROPIC|CLAUDE)/,
    category: "Software & AI",
    merchant: "Anthropic",
  },
  { id: "xai", match: /^(GROK|XAI)/, category: "Software & AI", merchant: "xAI" },
  { id: "cursor", match: /^CURSOR/, category: "Software & AI", merchant: "Cursor" },
  { id: "github", match: /^GITHUB/, category: "Software & AI", merchant: "GitHub" },
  {
    id: "paddle",
    match: /^PADDLE/,
    category: "Software & AI",
    merchant: "Paddle.com Market Limited",
  },
  { id: "apple", match: /^APPLE/, category: "Software & AI", merchant: "Apple" },
  {
    id: "software-vendors",
    match: /^(OPENAI|MICROSOFT|ADOBE|GOOGLE (ONE|STORAGE)|DROPBOX|JETBRAINS|1PASSWORD)/,
    category: "Software & AI",
  },

  // — Games ————————————————————————————————————————————————————————————————
  { id: "steam", match: /^STEAM/, category: "Games", merchant: "Steam" },
  {
    id: "playstation",
    match: /^PLAYSTATION/,
    category: "Games",
    merchant: "PlayStation",
  },
  { id: "itch", match: /^ITCH IO/, category: "Games", merchant: "itch.io" },
  {
    id: "game-vendors",
    match: /^(SJ GAMES|NINTENDO|XBOX|EPIC GAMES)/,
    category: "Games",
  },

  // — Streaming and subscriptions ————————————————————————————————————————————
  {
    id: "prime-video",
    match: /^PRIME VIDEO/,
    category: "Streaming & Media",
    merchant: "Prime Video",
  },
  {
    id: "youtube",
    match: /^GOOGLE YOUTUBE/,
    category: "Streaming & Media",
    merchant: "YouTube",
  },
  {
    id: "spotify",
    // `PP*SPOTIFY*<hash>` and `PAYPAL *SPOTIFY USA` normalize to different residues;
    // naming it here is what stops one subscription appearing as fourteen merchants.
    match: /^SPOTIFY/,
    category: "Streaming & Media",
    merchant: "Spotify USA Inc",
  },
  {
    id: "streaming-services",
    match:
      /^(NETFLIX|HULU|DISNEY|PARAMOUNT|HELP\.?HBOMAX|HBOMAX|NEBULA|AUDIBLE|PANDORA|CRUNCHYROLL)/,
    category: "Streaming & Media",
  },
  {
    id: "independent-media",
    match:
      /^(LOTUSEATERS|GRAY MIRROR|PODCOMPANY|ONEBOOKSHEL|SUBSTACK|PATREON|ANCESTRY)/,
    category: "Streaming & Media",
  },

  // — Entertainment out of the house ————————————————————————————————————————
  {
    id: "cinema",
    match: /^(LEXINGTON EXCHANGE MOV|AMC |REGAL |FANDANGO|TICKETMASTER)/,
    category: "Entertainment",
  },

  // — Everything else ———————————————————————————————————————————————————————
  { id: "geico", match: /^GEICO/, category: "Insurance", merchant: "Geico" },
  {
    id: "insurance-carriers",
    match: /^(STATE FARM|PROGRESSIVE|ALLSTATE|USAA|LEMONADE)/,
    category: "Insurance",
  },
  {
    id: "nails",
    match: /^KIMS NAILS/,
    category: "Personal Care",
    merchant: "Kim's Nails",
  },
  {
    id: "personal-care",
    match: /^(SUPERCUTS|GREAT CLIPS|SPORT CLIPS|ULTA|SEPHORA)/,
    category: "Personal Care",
  },
  {
    id: "airlines",
    match: /^(UNITED|DELTA|AMERICAN AIR|SOUTHWEST)/,
    category: "Travel",
  },
  {
    id: "travel-booking",
    match: /^(MARRIOTT|HILTON|AIRBNB|EXPEDIA|HOTELS\b|ENTERPRISE RENT)/,
    category: "Travel",
  },
  {
    id: "rent-reporting",
    match: /^RENT REPORTING/,
    category: "Professional Services",
    merchant: "Rent Reporting",
  },
  { id: "irs", match: /^IRS\b/, category: "Taxes", merchant: "IRS" },
  {
    id: "tax-authorities",
    match: /^(COMPTROLLER|STATE OF MARYLAND|MD COMPTROLLER|TREAS TAX)/,
    category: "Taxes",
  },
  {
    id: "shein",
    match: /^(SHEIN|SHEINUSSERV)/,
    category: "Shopping",
    merchant: "SHEIN",
  },
  // Amazon reaches the feed as AMAZON, AMAZON MKTPL and AMZN MKTP US. Naming it once keeps
  // the largest discretionary merchant from arriving as three smaller ones.
  {
    id: "amazon",
    match: /^(AMAZON|AMZN)/,
    category: "Shopping",
    merchant: "Amazon",
  },
  { id: "lowes", match: /^LOWES/, category: "Shopping", merchant: "Lowe's" },
  {
    id: "home-depot",
    match: /^HOME DEPOT/,
    category: "Shopping",
    merchant: "Home Depot",
  },
  {
    id: "retail",
    match:
      /^(DICKS SPORTING|TARGET|EBAY|ETSY|BEST BUY|COSTCO|IKEA|WAYFAIR|MACYS|KOHLS)/,
    category: "Shopping",
  },

  // — Flow-bearing rules ————————————————————————————————————————————————————
  // Interest and fees are the cost of holding the accounts, not a purchase. Charged
  // interest is money out; interest paid on savings is money in. Both are separated from
  // `spend` so a card's carrying cost can be read on its own.
  {
    id: "interest-charged",
    match:
      /^(INTEREST CHARGE|ANNUAL MEMBERSHIP FEE|LATE FEE|FOREIGN TRANSACTION FEE|OVERDRAFT FEE)/,
    category: "Fees & Interest",
    flow: "interest_fee",
  },
  {
    id: "interest-earned",
    match: /^MONTHLY INTEREST PAID/,
    category: "Fees & Interest",
    flow: "interest_fee",
    merchant: "Interest Paid",
  },
  // VA benefits are recurring income but arrive monthly, so the biweekly cadence detector
  // in `income.ts` will never see them. Naming the payer is the only way they count.
  {
    id: "va-benefits",
    match: /^VACP TREAS/,
    flow: "income",
    merchant: "VA Benefits",
  },
  // Lee never carries a PayPal balance, so a checking withdrawal to PayPal is the
  // purchase itself. `transfers.ts` used to park these as external; this rule is what
  // the cash-flow identity needs, and it does not need a statement to fire.
  {
    id: "paypal-outbound",
    match: /^PAYPAL TO LEE RAULIN/,
    flow: "spend",
  },
];

/** The first rule matching this normalized merchant, or null. */
export function matchRule(normalizedMerchant: string): ClassifyRule | null {
  if (normalizedMerchant === "") return null;
  return CLASSIFY_RULES.find((rule) => rule.match.test(normalizedMerchant)) ?? null;
}
