/**
 * Creates (or updates the password of) a platform operator account - the SaaS owner login that
 * oversees all companies. There is deliberately NO HTTP endpoint for this: platform operators
 * can only be created by someone with shell access to the server.
 *
 * Usage:
 *   npm run create-platform-admin -- --username owner --email you@example.com --name "Your Name"
 *
 * The password is prompted for interactively and masked. It is never accepted as a CLI argument,
 * because arguments are recorded in shell history and are readable by other processes on the
 * machine via the process list.
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import readline from "readline";
import { Writable } from "stream";

const prisma = new PrismaClient();

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const key = argv[i].slice(2);
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) throw new Error(`Missing value for --${key}`);
      out[key] = value;
      i++;
    }
  }
  return out;
}

/** Reads a line from an interactive terminal without echoing it. */
function promptHiddenTty(question: string): Promise<string> {
  return new Promise((resolve) => {
    let muted = false;
    const mutedOut = new Writable({
      write(chunk, encoding, callback) {
        if (!muted) process.stdout.write(chunk, encoding);
        callback();
      },
    });
    const rl = readline.createInterface({ input: process.stdin, output: mutedOut, terminal: true });
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
    muted = true;
  });
}

/**
 * Buffered stdin lines, used when stdin is NOT a terminal (piped input, CI, a wrapper script).
 * Masked prompting only works on a real TTY, so we fall back to plain line reads there.
 */
let pipedLines: string[] | null = null;

function readPipedStdin(): Promise<string[]> {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data.split(/\r?\n/)));
    process.stdin.on("error", reject);
  });
}

async function promptHidden(question: string): Promise<string> {
  if (process.stdin.isTTY) return promptHiddenTty(question);

  if (pipedLines === null) pipedLines = await readPipedStdin();
  const next = pipedLines.shift();
  if (next === undefined) {
    throw new Error("Expected a password on stdin but the input ended. Run this in a terminal for a masked prompt.");
  }
  return next;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const username = args.username?.trim();
  const email = args.email?.trim().toLowerCase();
  const fullName = args.name?.trim();

  if (!username || !email || !fullName) {
    console.error('Usage: npm run create-platform-admin -- --username owner --email you@example.com --name "Your Name"');
    process.exit(1);
  }

  const password = await promptHidden("Choose a password (min 12 chars, will not be shown): ");
  if (password.length < 12) {
    console.error("Password must be at least 12 characters. This account can see every company on the platform.");
    process.exit(1);
  }
  const confirm = await promptHidden("Confirm password: ");
  if (password !== confirm) {
    console.error("Passwords did not match. Nothing was changed.");
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const existing = await prisma.platformAdmin.findFirst({ where: { OR: [{ username }, { email }] } });
  if (existing) {
    await prisma.platformAdmin.update({
      where: { id: existing.id },
      data: { passwordHash, fullName, status: "ACTIVE" },
    });
    // Any stolen session for this account is now useless.
    await prisma.platformRefreshToken.updateMany({
      where: { platformAdminId: existing.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    console.log(`Updated existing platform operator "${existing.username}" and revoked its active sessions.`);
    return;
  }

  const created = await prisma.platformAdmin.create({
    data: { username, email, passwordHash, fullName },
    select: { id: true, username: true, email: true, fullName: true },
  });
  console.log("Platform operator created:", created);
  console.log("Sign in at /platform/login - this is NOT the same login page companies use.");
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
