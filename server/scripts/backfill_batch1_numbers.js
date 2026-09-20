/**
 * Tag every student in batch 1 (2026-12-1) with a numeric `number` and
 * `batchId` so admins can log them in with the batch-coordinate form —
 * without renaming any existing Firestore doc.
 *
 * We DO NOT rename docs. Any student attendance / payment / test-mark
 * record keyed on the old doc id keeps working exactly as-is; only two
 * fields on the student doc are touched (merged in), preserving name,
 * phone, combination, college, etc.
 *
 * Number extraction rules, in order:
 *   1. If the doc already has a numeric `number` field, keep it.
 *   2. If the doc id is a plain integer ("1", "42"), use it.
 *   3. If the doc id ends in "_<digits>" (e.g. "stu_sheet_5"), use those digits.
 *   4. If the doc id matches "<batchId>__<digits>" (already batch-composed), use those digits.
 *   5. Otherwise the doc is skipped and logged for you to review manually.
 *
 * Batch assignment:
 *   - If the doc already has a batchId → keep it.
 *   - Else assign DEFAULT_BATCH (2026-12-1).
 *
 * Collision safety: if two students in the same batch would end up with
 * the same `number`, the script refuses to write ANY change and lists the
 * clashing pairs so you can rename by hand first.
 *
 * Usage:
 *   node server/scripts/backfill_batch1_numbers.js           # dry run
 *   node server/scripts/backfill_batch1_numbers.js --apply   # persist changes
 *   node server/scripts/backfill_batch1_numbers.js --apply --batch 2026-11-2
 *     (target a different batch id if you want to run this for batch 2, etc.)
 */

const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (!m) return;
    let v = m[2].trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    process.env[m[1]] = v;
  });
}

const { cert, initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
if (!b64) { console.error('FIREBASE_SERVICE_ACCOUNT_BASE64 missing in server/.env'); process.exit(1); }
const svc = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
if (svc.private_key) svc.private_key = svc.private_key.replace(/\\n/g, '\n');
initializeApp({ credential: cert(svc) });
const db = getFirestore();

const DEFAULT_BATCH_ID = '2026-12-1';
const APPLY = process.argv.includes('--apply');
const batchArgIdx = process.argv.indexOf('--batch');
const TARGET_BATCH = batchArgIdx >= 0 ? process.argv[batchArgIdx + 1] : DEFAULT_BATCH_ID;

function extractNumber(docId, docData) {
  // Rule 1: explicit `number` field
  const explicit = Number(docData.number);
  if (Number.isFinite(explicit) && Number.isInteger(explicit) && explicit > 0) return { number: explicit, source: 'existing_field' };

  // Rule 2: doc id is a plain integer
  if (/^\d+$/.test(docId)) return { number: Number(docId), source: 'plain_int_id' };

  // Rule 3: id ends in _<digits>
  const suffixMatch = docId.match(/_(\d+)$/);
  if (suffixMatch) return { number: Number(suffixMatch[1]), source: 'suffix_after_underscore' };

  // Rule 4: id already batch-composed (2026-12-1__5)
  const composedMatch = docId.match(/__(\d+)$/);
  if (composedMatch) return { number: Number(composedMatch[1]), source: 'batch_composed_id' };

  return null;
}

async function main() {
  console.log(`\n=== Backfill batch numbers for ${TARGET_BATCH} ===`);
  console.log(APPLY ? 'MODE: APPLY (writes will happen)' : 'MODE: DRY RUN (use --apply to persist)\n');

  const snap = await db.collection('students').get();
  const students = snap.docs.map(d => ({ id: d.id, data: d.data() || {} }));
  console.log(`Total student docs in DB: ${students.length}`);

  const inBatch = students.filter(s => (s.data.batchId || DEFAULT_BATCH_ID) === TARGET_BATCH);
  console.log(`Students in ${TARGET_BATCH}: ${inBatch.length}\n`);

  const plan = [];
  const skipped = [];
  for (const s of inBatch) {
    const extraction = extractNumber(s.id, s.data);
    if (!extraction) {
      skipped.push({ id: s.id, name: s.data.name, reason: 'no number pattern found' });
      continue;
    }
    const needsNumber = !Number.isFinite(Number(s.data.number));
    const needsBatch = !s.data.batchId;
    if (!needsNumber && !needsBatch) {
      // Already tagged — nothing to do.
      continue;
    }
    plan.push({
      id: s.id, name: s.data.name || '(no name)',
      newNumber: extraction.number, source: extraction.source,
      needsNumber, needsBatch
    });
  }

  // Collision check: two docs in the same batch would end up with same number.
  const byNumber = new Map();
  for (const p of plan) {
    if (!byNumber.has(p.newNumber)) byNumber.set(p.newNumber, []);
    byNumber.get(p.newNumber).push(p);
  }
  // Also include already-tagged docs so we don't assign a number they already own.
  for (const s of inBatch) {
    const existing = Number(s.data.number);
    if (Number.isFinite(existing) && Number.isInteger(existing) && existing > 0) {
      if (!byNumber.has(existing)) byNumber.set(existing, []);
      // Only push if not already in plan
      if (!byNumber.get(existing).some(p => p.id === s.id)) {
        byNumber.get(existing).push({ id: s.id, name: s.data.name, newNumber: existing, source: 'already_tagged', needsNumber: false, needsBatch: false });
      }
    }
  }

  const collisions = Array.from(byNumber.entries()).filter(([, arr]) => arr.length > 1);
  if (collisions.length) {
    console.log('❌ COLLISIONS DETECTED — the following student # values would be shared by more than one student:\n');
    for (const [num, arr] of collisions) {
      console.log(`  #${num}:`);
      arr.forEach(p => console.log(`     - ${p.id.padEnd(30)} ${p.name} (via ${p.source})`));
    }
    console.log('\nNo writes made. Resolve these first — either rename the doc id, or manually set a distinct `number` field on one of them.\n');
    process.exit(2);
  }

  if (!plan.length) {
    console.log('✅ Nothing to do — every student in this batch already has a numeric `number` and a `batchId`.');
  } else {
    console.log(`Planning to update ${plan.length} student doc(s):\n`);
    for (const p of plan) {
      const bits = [];
      if (p.needsNumber) bits.push(`number=${p.newNumber} (via ${p.source})`);
      if (p.needsBatch) bits.push(`batchId=${TARGET_BATCH}`);
      console.log(`  ${p.id.padEnd(30)} ${p.name.padEnd(30)} → set ${bits.join(', ')}`);
    }
    console.log();
  }

  if (skipped.length) {
    console.log(`⚠️  Skipped ${skipped.length} doc(s) — no number pattern in the id:\n`);
    skipped.forEach(s => console.log(`  ${s.id.padEnd(30)} ${s.name || '(no name)'}`));
    console.log('\nEdit these by hand in the admin panel if you want them to be login-able by student #.\n');
  }

  if (APPLY && plan.length) {
    let ok = 0;
    for (const p of plan) {
      const patch = { batchId: TARGET_BATCH };
      if (p.needsNumber) patch.number = p.newNumber;
      // merge: true keeps every other field on the doc untouched.
      await db.collection('students').doc(p.id).set(patch, { merge: true });
      ok++;
    }
    console.log(`\n✅ ${ok} doc(s) updated. All other fields (name, phone, combination, college, etc.) were left untouched.`);
    console.log(`\nStudents can now log in with:\n  Batch #: ${TARGET_BATCH.split('-')[2]}\n  Year: ${TARGET_BATCH.split('-')[0]}\n  Grade: ${TARGET_BATCH.split('-')[1]}\n  Student #: <the number listed above>\n  Password: their parent phone number\n`);
  } else if (!APPLY) {
    console.log('(no writes were made — re-run with --apply to persist)\n');
  }

  process.exit(0);
}

main().catch(err => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
