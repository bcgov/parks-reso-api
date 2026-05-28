// Backfill emailCanonical on existing pass records that don't have it.
// Run AFTER deploying the new shortPassDate-emailCanonical-index GSI.
// Idempotent — safe to re-run; only updates records missing the field.
//
// Usage:
//   AWS_REGION=ca-central-1 TABLE_NAME=ParksDUP node tools/backfillEmailCanonical.js [--dry-run] [--table ParksDUP] [--limit N]

const {
  DynamoDBClient,
  ScanCommand,
  UpdateItemCommand
} = require('@aws-sdk/client-dynamodb');

const REGION = process.env.AWS_REGION || 'ca-central-1';
const client = new DynamoDBClient({ region: REGION });

// Mirror of baseLayer.js canonicalizeEmail() — keep in sync.
function canonicalizeEmail(email) {
  if (!email || typeof email !== 'string') return '';
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf('@');
  if (at < 1 || at === trimmed.length - 1) return trimmed;
  let local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  const plusIdx = local.indexOf('+');
  if (plusIdx >= 0) local = local.slice(0, plusIdx);
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    local = local.replace(/\./g, '');
  }
  return `${local}@${domain}`;
}

async function backfill(tableName, dryRun, limit) {
  console.log(`Backfill on table=${tableName} dryRun=${dryRun} limit=${limit ?? 'none'} region=${REGION}`);
  let scanned = 0, eligible = 0, updated = 0, skipped = 0, errors = 0;
  let lastKey;

  do {
    const resp = await client.send(new ScanCommand({
      TableName: tableName,
      FilterExpression: 'attribute_exists(email) AND attribute_not_exists(emailCanonical) AND begins_with(pk, :passPrefix)',
      ExpressionAttributeValues: { ':passPrefix': { S: 'pass::' } },
      ExclusiveStartKey: lastKey,
    }));
    scanned += resp.ScannedCount || 0;
    for (const item of (resp.Items || [])) {
      eligible++;
      const email = item.email && item.email.S;
      const canon = canonicalizeEmail(email);
      if (!canon) {
        skipped++;
        console.log(`  SKIP pk=${item.pk?.S} sk=${item.sk?.S} — email canonicalized to empty: ${JSON.stringify(email)}`);
        continue;
      }
      if (dryRun) {
        updated++; // counted as would-update
        if (updated <= 10) console.log(`  WOULD UPDATE pk=${item.pk?.S} sk=${item.sk?.S} email=${email} → ${canon}`);
        if (limit && updated >= limit) break;
        continue;
      }
      try {
        await client.send(new UpdateItemCommand({
          TableName: tableName,
          Key: { pk: item.pk, sk: item.sk },
          UpdateExpression: 'SET emailCanonical = :ec',
          ConditionExpression: 'attribute_not_exists(emailCanonical)',
          ExpressionAttributeValues: { ':ec': { S: canon } },
        }));
        updated++;
        if (updated % 500 === 0) console.log(`  ...updated ${updated} records`);
      } catch (e) {
        if (e.name === 'ConditionalCheckFailedException') {
          skipped++;  // raced; already populated
        } else {
          errors++;
          console.error(`  ERROR pk=${item.pk?.S} sk=${item.sk?.S}: ${e.message}`);
        }
      }
      if (limit && updated >= limit) break;
    }
    if (limit && updated >= limit) break;
    lastKey = resp.LastEvaluatedKey;
    if (lastKey) console.log(`  scanned=${scanned} eligible=${eligible} updated=${updated} skipped=${skipped} errors=${errors} (continuing...)`);
  } while (lastKey);

  console.log(`\nDone. table=${tableName} scanned=${scanned} eligible=${eligible} updated=${updated} skipped=${skipped} errors=${errors}`);
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const limitArg = args.find(a => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : null;
  const tableArg = args.find(a => a.startsWith('--table='));
  const tables = tableArg ? [tableArg.split('=')[1]] : (process.env.TABLE_NAME ? [process.env.TABLE_NAME] : ['ParksDUP', 'archivedPasses']);

  for (const t of tables) {
    await backfill(t, dryRun, limit);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
