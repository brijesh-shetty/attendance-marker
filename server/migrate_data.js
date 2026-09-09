/**
 * Data Migration Script: Old Firebase -> New Firebase
 * 
 * Usage:
 *   node server/migrate_data.js <OLD_SERVICE_ACCOUNT_BASE64> <NEW_SERVICE_ACCOUNT_BASE64>
 */

const { cert, initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const oldBase64 = process.argv[2];
const newBase64 = process.argv[3];

if (!oldBase64 || !newBase64) {
  console.log('\n❌ Usage error!');
  console.log('Please provide both old and new Base64 service account keys:');
  console.log('  node server/migrate_data.js <OLD_BASE64> <NEW_BASE64>\n');
  process.exit(1);
}

function parseBase64(base64Str) {
  try {
    const jsonStr = Buffer.from(base64Str, 'base64').toString('utf8');
    const account = JSON.parse(jsonStr);
    if (account.private_key) account.private_key = account.private_key.replace(/\\n/g, '\n');
    return account;
  } catch (err) {
    console.error('❌ Invalid Base64 service account key:', err.message);
    process.exit(1);
  }
}

const oldAccount = parseBase64(oldBase64);
const newAccount = parseBase64(newBase64);

// Initialize Old Firebase App
const oldApp = initializeApp({ credential: cert(oldAccount) }, 'oldApp');
const oldDb = getFirestore(oldApp);

// Initialize New Firebase App
const newApp = initializeApp({ credential: cert(newAccount) }, 'newApp');
const newDb = getFirestore(newApp);

const COLLECTIONS = [
  'students',
  'student_credentials',
  'attendance',
  'tests',
  'payments',
  'syllabus',
  'audit_logs'
];

async function migrateCollection(collName) {
  console.log(`\n📦 Migrating collection: "${collName}"...`);
  const snapshot = await oldDb.collection(collName).get();
  
  if (snapshot.empty) {
    console.log(`  ℹ️ Collection "${collName}" is empty.`);
    return;
  }

  let count = 0;
  const batchSize = 400;
  let batch = newDb.batch();

  for (const doc of snapshot.docs) {
    const docRef = newDb.collection(collName).doc(doc.id);
    batch.set(docRef, doc.data());
    count++;

    if (count % batchSize === 0) {
      await batch.commit();
      batch = newDb.batch();
      console.log(`  ...migrated ${count} documents so far.`);
    }
  }

  if (count % batchSize !== 0) {
    await batch.commit();
  }

  console.log(`  ✅ Successfully migrated ${count} documents for "${collName}".`);
}

async function runMigration() {
  console.log(`🚀 Starting migration from "${oldAccount.project_id}" to "${newAccount.project_id}"...`);
  
  for (const coll of COLLECTIONS) {
    try {
      await migrateCollection(coll);
    } catch (err) {
      console.error(`❌ Failed to migrate collection "${coll}":`, err.message);
    }
  }

  console.log('\n🎉 ALL DATA MIGRATED SUCCESSFULLY TO NEW FIREBASE PROJECT!');
  process.exit(0);
}

runMigration();
