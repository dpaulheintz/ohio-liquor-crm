// Reset the OHLQ concept demo to its seed data: ENV_FILE=/path/.env.local npx tsx scripts/ohlq-demo-reset.ts
import { config } from 'dotenv';
config({ path: process.env.ENV_FILE ?? '.env.local', quiet: true });

async function main() {
  const { resetDemo } = await import('../src/lib/ohlq-demo/seed');
  console.log(await resetDemo());
}
main().catch((e) => { console.error(e); process.exit(1); });
