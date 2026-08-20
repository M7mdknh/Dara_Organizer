/**
 * Safe production Admin bootstrap.
 *
 * Never creates a known/default password. Reads credentials from
 * environment variables (so nothing sensitive appears in shell history or
 * process listings when run via a deployment platform's one-off command),
 * with an interactive fallback for local use.
 *
 * Usage (Railway / any host with env support):
 *   ADMIN_EMAIL=you@yourdomain.com ADMIN_NAME="Your Name" ADMIN_PASSWORD='a-strong-password' npm run admin:create
 *
 * Usage (interactive, local):
 *   npm run admin:create
 *   (prompts for email, name, and password)
 *
 * Safe to re-run: if the email already exists, it updates the password and
 * ensures the ADMIN role instead of creating a duplicate.
 */
import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });

// Byte codes instead of literal control-character strings — avoids any risk
// of control characters being mis-transcribed as regular text.
const BYTE_CR = 13;
const BYTE_LF = 10;
const BYTE_CTRL_C = 3;
const BYTE_BACKSPACE = 8;
const BYTE_DEL = 127;

async function prompt(question: string, hidden = false): Promise<string> {
  if (!hidden) {
    const rl = createInterface({ input: stdin, output: stdout });
    const answer = await rl.question(question);
    rl.close();
    return answer.trim();
  }
  // Minimal hidden-input prompt (no echo) for the password.
  return new Promise((resolve) => {
    stdout.write(question);
    let collected = "";
    const onData = (chunk: Buffer) => {
      for (const byte of chunk) {
        if (byte === BYTE_CR || byte === BYTE_LF) {
          stdin.setRawMode?.(false);
          stdin.pause();
          stdin.removeListener("data", onData);
          stdout.write("\n");
          resolve(collected);
          return;
        }
        if (byte === BYTE_CTRL_C) {
          process.exit(1);
        }
        if (byte === BYTE_BACKSPACE || byte === BYTE_DEL) {
          collected = collected.slice(0, -1);
          continue;
        }
        collected += String.fromCharCode(byte);
      }
    };
    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.on("data", onData);
  });
}

async function main() {
  const email = (process.env.ADMIN_EMAIL || (await prompt("Admin email: "))).trim().toLowerCase();
  const name = process.env.ADMIN_NAME || (await prompt("Admin name: "));
  const password = process.env.ADMIN_PASSWORD || (await prompt("Admin password (min 8 chars, hidden): ", true));

  if (!email || !email.includes("@")) throw new Error("A valid email is required");
  if (!name) throw new Error("A name is required");
  if (!password || password.length < 8) throw new Error("Password must be at least 8 characters");

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await db.user.upsert({
    where: { email },
    update: { passwordHash, role: "ADMIN", active: true, name },
    create: { email, name, role: "ADMIN", passwordHash },
    select: { id: true, email: true, name: true, role: true },
  });

  console.log(`Admin account ready: ${user.email} (${user.role}). Password was not printed or logged.`);
}

main()
  .catch((err) => {
    console.error("Failed to create admin:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
