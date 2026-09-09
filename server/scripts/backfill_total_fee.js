/**
 * Backfill each existing payment document's totalFee to 65000.
 *
 * Transactions (paid amounts) are NEVER touched — only the ceiling changes.
 * Students without a payment doc get one created with 65000 + empty history
 * so the Fees tab shows the same total-to-pay for everyone.
 *
 * Usage (run from the project root):
 *   node server/scripts/backfill_total_fee.js               # dry run
 *   node server/scripts/backfill_total_fee.js --apply       # actually write
 *   node server/scripts/backfill_total_fee.js --apply --force
 *       # also overwrite custom fees (e.g. scholarship 40000). Skip by default.
 *
 * --apply             Persist changes to Firestore.
 * --force             Overwrite totalFee even when the existing value is neither
 *                     missing nor the old default (50000). Use only if you truly
 *                     want every student on 65000 regardless of prior tweaks.
 * --no-create-missing Skip creating payment docs for students that don't have one.
 */

const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (!match) return;
    const key = match[1];
    let value = match[2].trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    process.env[key] = value;
  });
}

const { cert, initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
if (!rawServiceAccount) {
  console.error('FIREBASE_SERVICE_ACCOUNT_BASE64 is missing from server/.env');
  process.exit(1);
}
const serviceAccount = JSON.parse(Buffer.from(rawServiceAccount, 'base64').toString('utf8'));
if (serviceAccount.private_key) {
  serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
}
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const NEW_TOTAL_FEE = 65000;
const OLD_DEFAULT_FEE = 50000;

const APPLY = process.argv.includes('--apply');
const FORCE = process.argv.includes('--force');
const NO_CREATE = process.argv.includes('--no-create-missing');

function fmt(n) { return `₹${Number(n || 0).toLocaleString('en-IN')}`; }

async function main() {
  console.log(`\n=== Fee-total backfill → ${fmt(NEW_TOTAL_FEE)} ===`);
  console.log(APPLY ? 'MODE: APPLY (writes will happen)' : 'MODE: DRY RUN (no writes; use --apply to persist)');
  console.log(`Overwrite custom fees:      ${FORCE ? 'YES (--force)' : 'no (only missing/50000 get updated)'}`);
  console.log(`Create missing payment docs: ${NO_CREATE ? 'no (--no-create-missing)' : 'yes'}\n`);

  const [studentsSnap, paymentsSnap] = await Promise.all([
    db.collection('students').get(),
    db.collection('payments').get()
  ]);

  const payments = new Map();
  paymentsSnap.forEach(doc => payments.set(doc.id, doc.data() || {}));

  const students = studentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  console.log(`Students in DB : ${students.length}`);
  console.log(`Payment docs   : ${payments.size}\n`);

  const summary = { updated: 0, skipped: 0, created: 0, unchanged_custom: 0 };

  for (const student of students) {
    const existing = payments.get(student.id);
    const currentFee = existing ? Number(existing.totalFee) : null;
    const txCount = existing && Array.isArray(existing.transactions) ? existing.transactions.length : 0;
    const paid = existing && Array.isArray(existing.transactions)
      ? existing.transactions.reduce((sum, t) => sum + (Number(t?.amount) || 0), 0) : 0;

    if (!existing) {
      if (NO_CREATE) { summary.skipped++; continue; }
      console.log(`+ CREATE  ${student.id.padEnd(24)} ${student.name || ''} → totalFee ${fmt(NEW_TOTAL_FEE)} (no history)`);
      summary.created++;
      if (APPLY) {
        await db.collection('payments').doc(student.id).set({
          studentId: student.id,
          totalFee: NEW_TOTAL_FEE,
          transactions: [],
          batchId: student.batchId || null,
          updatedAt: Date.now(),
          backfilledAt: Date.now(),
          backfilledFrom: null
        });
      }
      continue;
    }

    const shouldRewrite =
      !Number.isFinite(currentFee) ||             // missing
      currentFee === 0 ||                          // zero
      currentFee === OLD_DEFAULT_FEE ||            // old default
      (FORCE && currentFee !== NEW_TOTAL_FEE);     // custom (only with --force)

    if (currentFee === NEW_TOTAL_FEE) {
      summary.skipped++;
      continue;
    }

    if (!shouldRewrite) {
      console.log(`~ KEEP    ${student.id.padEnd(24)} ${student.name || ''} · custom fee ${fmt(currentFee)}, ${txCount} tx, paid ${fmt(paid)} (use --force to overwrite)`);
      summary.unchanged_custom++;
      continue;
    }

    console.log(`↑ UPDATE  ${student.id.padEnd(24)} ${student.name || ''} · ${fmt(currentFee)} → ${fmt(NEW_TOTAL_FEE)} · ${txCount} tx (paid ${fmt(paid)}) kept intact`);
    summary.updated++;
    if (APPLY) {
      // merge:true keeps transactions, records, lastFeeMessage etc. untouched.
      await db.collection('payments').doc(student.id).set({
        totalFee: NEW_TOTAL_FEE,
        updatedAt: Date.now(),
        backfilledAt: Date.now(),
        backfilledFrom: currentFee
      }, { merge: true });
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`  Updated to ${fmt(NEW_TOTAL_FEE)} : ${summary.updated}`);
  console.log(`  Created (was missing) : ${summary.created}`);
  console.log(`  Skipped (already ${fmt(NEW_TOTAL_FEE)}) : ${summary.skipped}`);
  console.log(`  Kept custom (needs --force) : ${summary.unchanged_custom}`);
  if (!APPLY) console.log(`\n(no writes were made — re-run with --apply to persist)\n`);
  else console.log(`\n✅ Changes committed to Firestore.\n`);

  process.exit(0);
}

main().catch(err => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
