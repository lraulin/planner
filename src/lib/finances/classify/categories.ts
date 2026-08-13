/**
 * The spending taxonomy, and the mapping from each bank's own vocabulary onto it.
 *
 * Two banks describe the same purchase differently — Chase calls it `Shopping` and
 * `Bills & Utilities`, Capital One calls it `Merchandise` and `Payment/Credit` — and the
 * 360 bank feed supplies no category at all on any of its 875 rows. A chart grouped on the
 * raw bank string therefore shows one merchant under two names and its single largest slice
 * is a blank.
 *
 * So there is one taxonomy, and the bank's string is only ever a **fallback** beneath the
 * description rules in `rules.ts`. It is a fallback rather than the primary because it is
 * both coarser and less available: `Merchandise` covers groceries and a video game equally,
 * and it is missing entirely on exactly the account where the largest bills land.
 *
 * The list is deliberately short. A category earns its place by being something you could
 * act on — "spend less on Dining" is a decision, "spend less on Other Services" is not.
 */

export const FINANCE_CATEGORIES = [
  "Groceries",
  "Dining",
  "Gas & Auto",
  "Rent & Housing",
  "Utilities",
  "Phone & Internet",
  "Streaming & Media",
  "Entertainment",
  "Software & AI",
  "Games",
  "Shopping",
  "Health",
  "Pets",
  "Insurance",
  "Personal Care",
  "Home & Security",
  "Travel",
  "Professional Services",
  "Taxes",
  "Fees & Interest",
] as const;

export type FinanceCategory = (typeof FINANCE_CATEGORIES)[number];

/** Shown wherever nothing classified a row. Not a member of the taxonomy — it is the
 * absence of one, and reports should be able to say how much of the total it covers. */
export const UNCATEGORIZED = "Uncategorized";

/**
 * Bank category string → our taxonomy. Keys are lowercased on lookup, so a feed that
 * changes capitalisation does not silently stop matching.
 *
 * Several bank values map to nothing on purpose. `Purchase`, `Merchandise`, `Shopping` and
 * `Other Services` are too broad to be worth a guess — mapping `Merchandise` to `Shopping`
 * would file every grocery run under Shopping and make both numbers wrong. Those rows stay
 * `Uncategorized` until a description rule claims them, which is honest and also makes the
 * gap visible enough to fix.
 */
const BANK_CATEGORY_MAP: Record<string, FinanceCategory> = {
  dining: "Dining",
  "gas/automotive": "Gas & Auto",
  "health care": "Health",
  insurance: "Insurance",
  utilities: "Utilities",
  "phone/cable": "Phone & Internet",
  internet: "Phone & Internet",
  entertainment: "Entertainment",
  airfare: "Travel",
  travel: "Travel",
  lodging: "Travel",
  "professional services": "Professional Services",
  "fee/interest charge": "Fees & Interest",
  fees: "Fees & Interest",
  groceries: "Groceries",
  gas: "Gas & Auto",
};

/** The taxonomy category a bank's own label implies, or null when it is too broad to
 * guess from. */
export function categoryFromBank(sourceCategory: string): FinanceCategory | null {
  return BANK_CATEGORY_MAP[sourceCategory.trim().toLowerCase()] ?? null;
}
