/** Oldest first, then by id, so rows from one day come out in the same order every time. */
export function chronological(
  left: { transactionDate: string; id: string },
  right: { transactionDate: string; id: string },
): number {
  return (
    left.transactionDate.localeCompare(right.transactionDate) ||
    left.id.localeCompare(right.id)
  );
}
