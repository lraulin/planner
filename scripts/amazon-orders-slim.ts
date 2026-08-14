#!/usr/bin/env tsx
/**
 * Strip an Amazon privacy-request zip (or extracted folder) down to the slim JSON
 * the app imports. JPEGs and invoice PDFs stay in the zip.
 *
 *   npx tsx scripts/amazon-orders-slim.ts "/path/Your Orders.zip" -o amazon-orders.json
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadSlimTexts } from "../src/lib/amazon/files";
import { buildSlimFromTexts, serializeSlim } from "../src/lib/amazon/slim";
import { AMAZON_UPLOAD_MAX_BYTES } from "../src/lib/amazon/types";

function usage(): never {
  console.error(
    'Usage: npx tsx scripts/amazon-orders-slim.ts "<Your Orders.zip|folder>" [-o out.json]',
  );
  process.exit(2);
}

function parseArgs(argv: string[]): { input: string; output: string } {
  let input: string | undefined;
  let output = "amazon-orders.json";
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-o" || arg === "--output") {
      output = argv[++i];
      if (!output) usage();
      continue;
    }
    if (arg === "-h" || arg === "--help") usage();
    if (!input) {
      input = arg;
      continue;
    }
    usage();
  }
  if (!input) usage();
  return { input, output };
}

const { input, output } = parseArgs(process.argv.slice(2));
const texts = loadSlimTexts(resolve(input));
const found = Object.keys(texts);
if (found.length === 0) {
  console.error("No Amazon order CSVs were found in that path.");
  process.exit(1);
}

const { document, warnings } = buildSlimFromTexts(texts);
const body = serializeSlim(document);
writeFileSync(resolve(output), body, "utf8");

const bytes = Buffer.byteLength(body);
console.log(
  `Wrote ${output}: ${document.items.length} items, ${document.orders.length} orders, ${document.refunds.length} refunds, ${document.returns.length} returns, ${document.replacements.length} replacements (${(bytes / 1024 / 1024).toFixed(2)} MB).`,
);
if (bytes > AMAZON_UPLOAD_MAX_BYTES) {
  console.error(
    `Warning: ${output} is larger than the 4.5 MB upload limit. Settings import will fail on Vercel.`,
  );
}
if (warnings.length > 0) {
  console.error(`Warnings (${warnings.length}):`);
  for (const warning of warnings.slice(0, 20)) console.error(`  ${warning}`);
  if (warnings.length > 20) console.error(`  …and ${warnings.length - 20} more`);
}
