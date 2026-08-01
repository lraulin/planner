import { upsertUser } from "@/lib/auth/provision";
import { seedSampleData } from "./sample-data";

/**
 * `npm run user:create` — provision an account without a sign-up page.
 *
 * Deliberately non-interactive: no TTY prompt, no confirmation step. Agents and
 * one-off remote runs have no terminal, and the earlier hand-written-SQL alternative
 * was worse than a flag that can be read back in shell history.
 *
 * Usage:
 *   npm run user:create -- --email lee@example.com --password 'secret123'
 *   npm run user:create -- --email new@example.com --rename-from old@example.com --password 'secret123'
 *   npm run user:create -- --email test@example.com --password 'password123' --sample-data
 *
 * Flags:
 *   --email        (required) the account's address
 *   --password     (or the USER_PASSWORD env var) at least 8 characters
 *   --name         display name; defaults to the address's local part
 *   --rename-from  rename this existing account instead of creating a new one, keeping its id
 *   --sample-data  replace this user's outline/schedule with the demo data (destructive)
 *   --force        allow --sample-data against a production database
 */

const USAGE = `Usage: npm run user:create -- --email <address> [--password <secret>] [--name <name>] [--rename-from <address>] [--sample-data] [--force]`;

function parseArgs(argv: string[]): Map<string, string | true> {
  const args = new Map<string, string | true>();

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      throw new Error(`Unexpected argument "${arg}".\n${USAGE}`);
    }
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args.set(key, next);
      i++;
    } else {
      args.set(key, true);
    }
  }

  return args;
}

function stringFlag(
  args: Map<string, string | true>,
  name: string,
): string | undefined {
  const value = args.get(name);
  if (value === true) throw new Error(`--${name} needs a value.\n${USAGE}`);
  return value;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const email = stringFlag(args, "email");
  if (!email) throw new Error(`--email is required.\n${USAGE}`);

  const password = stringFlag(args, "password") ?? process.env.USER_PASSWORD?.trim();
  if (!password) {
    throw new Error(`--password (or USER_PASSWORD) is required.\n${USAGE}`);
  }

  const sampleData = args.get("sample-data") === true;
  const force = args.get("force") === true;
  if (sampleData && process.env.NODE_ENV === "production" && !force) {
    throw new Error(
      "--sample-data deletes this user's nodes, appointments and time charts. Refusing against a production database; pass --force if that is really what you want.",
    );
  }

  const result = await upsertUser({
    email,
    password,
    name: stringFlag(args, "name"),
    renameFrom: stringFlag(args, "rename-from"),
  });

  console.log(`${result.outcome}: ${result.email} (${result.id})`);

  if (sampleData) {
    await seedSampleData(result.id);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
