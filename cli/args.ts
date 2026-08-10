/** Pure argv parsing for gqn, extracted so it can be unit-tested. */

export type FlagValue = string | true;
export type Flags = Record<string, FlagValue>;

/** Flags that never take a value (so `gqn --prod graphs list` works). */
const BOOLEAN_FLAGS: Record<string, true> = {
  local: true,
  prod: true,
  production: true,
  cascade: true,
  force: true,
  help: true,
  h: true,
  version: true,
  v: true,
};

/** Every flag gqn understands; anything else is a typo and must fail loudly. */
const KNOWN_FLAGS = new Set([
  ...Object.keys(BOOLEAN_FLAGS),
  "url",
  "title",
  "t",
  "body",
  "b",
  "x",
  "y",
  "parent",
  "p",
  "label",
  "l",
  "mode",
  "id",
  "token",
]);

/**
 * A token is only "the next flag" (not this flag's value) when it is `--` or
 * a flag gqn actually knows. Anything else — negative numbers, markdown like
 * `- item`, titles starting with `-` — is a value; silently dropping those
 * broke `--body '- item'` in the past.
 */
function isFlagToken(token: string): boolean {
  if (token === "--") return true;
  if (token.startsWith("--")) {
    const key = token.slice(2).split("=")[0] as string;
    return KNOWN_FLAGS.has(key);
  }
  if (token.startsWith("-") && token.length === 2) {
    return KNOWN_FLAGS.has(token.slice(1));
  }
  return false;
}

export function parseArgs(argv: string[]): { args: string[]; flags: Flags; unknown: string[] } {
  const args: string[] = [];
  const flags: Flags = {};
  const unknown: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i] as string;
    if (token === "--") {
      args.push(...argv.slice(i + 1));
      break;
    }
    const isLong = token.startsWith("--");
    const isShort = !isLong && token.startsWith("-") && token.length === 2;
    if (!isLong && !isShort) {
      args.push(token);
      continue;
    }
    let key: string;
    let value: FlagValue | undefined;
    if (isLong) {
      const eq = token.indexOf("=");
      if (eq !== -1) {
        key = token.slice(2, eq);
        value = token.slice(eq + 1);
      } else {
        key = token.slice(2);
      }
    } else {
      key = token.slice(1);
    }
    if (!KNOWN_FLAGS.has(key)) {
      unknown.push(token);
      continue;
    }
    if (value === undefined) {
      const next = argv[i + 1];
      if (!BOOLEAN_FLAGS[key] && next !== undefined && !isFlagToken(next)) {
        value = next;
        i++;
      } else {
        value = true;
      }
    }
    flags[key] = value;
  }
  return { args, flags, unknown };
}

export function flag(flags: Flags, ...names: string[]): FlagValue | undefined {
  for (const name of names) {
    const value = flags[name];
    if (value !== undefined) return value;
  }
  return undefined;
}

/**
 * Numeric flag or an error string. `--x abc` must fail, not silently send
 * null and report success while the server ignores the update.
 */
export function numericFlag(flags: Flags, ...names: string[]): { value?: number; error?: string } {
  const raw = flag(flags, ...names);
  if (raw === undefined) return {};
  if (raw === true || raw.trim() === "") return { error: `--${names[0]} requires a number` };
  const value = Number(raw);
  if (!Number.isFinite(value)) return { error: `--${names[0]} must be a number, got: ${raw}` };
  return { value };
}
