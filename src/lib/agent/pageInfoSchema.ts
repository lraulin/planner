import { z } from "zod";

/**
 * The page envelope every paged tool returns. Its own module so contract files that
 * `contracts.ts` spreads in can share it without an import cycle.
 */
export const pageInfoSchema = z.strictObject({
  offset: z.number().int().min(0),
  limit: z.number().int().min(1),
  returned: z.number().int().min(0),
  total: z.number().int().min(0),
  hasMore: z.boolean(),
  nextOffset: z.number().int().min(0).nullable(),
});
