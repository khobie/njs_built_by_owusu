import { PrismaClient } from '@prisma/client';
import { syncKoforiduaElectoralAreas } from '../src/lib/koforidua-electoral-areas-sync';

const prisma = new PrismaClient();

async function main() {
  const result = await syncKoforiduaElectoralAreas('Ghana');
  console.log('Koforidua electoral areas synced:', result);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
