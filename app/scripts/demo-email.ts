import fs from 'node:fs';
import path from 'node:path';
import { getDb, repoRoot } from '../src/lib/db/client';
import { q1 } from '../src/lib/db/client';
import { processInbound } from '../src/lib/services/inbound';
import { IDS } from '../src/lib/seed';

// demo:email — feeds a fixture "email" (bank statements from the CFO) through the real
// inbound pipeline. Transport is the only stubbed part (Q12).

async function main() {
  const ds = (...p: string[]) => path.join(repoRoot(), 'dataset', ...p);
  const res = await processInbound(IDS.engNep, {
    from: 'sophie.marchand@altiverre.example',
    subject: 'Relevés bancaires novembre-décembre 2025',
    attachments: [
      { filename: 'releve_512100_2025-11.pdf', mime: 'application/pdf', bytes: fs.readFileSync(ds('evidence', 'releve_512100_2025-11.pdf')) },
      { filename: 'releve_512100_2025-12.pdf', mime: 'application/pdf', bytes: fs.readFileSync(ds('evidence', 'releve_512100_2025-12.pdf')) },
    ],
  });
  console.log('inbound processed:', res);
  const unknown = await processInbound(IDS.engNep, {
    from: 'stranger@example.com',
    subject: 'Unsolicited attachment',
    attachments: [],
  });
  console.log('unknown sender (quarantined):', unknown.quarantined);
  const count = await q1<{ n: string }>(`select count(*) n from evidence`, []);
  console.log('evidence rows:', count.n);
  const db = await getDb();
  await db.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
