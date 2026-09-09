const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '../.env');
const envContent = fs.readFileSync(envPath, 'utf8');
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
  if (match) {
    const key = match[1];
    let value = match[2].trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    process.env[key] = value;
  }
});

const { cert, initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
if (!rawServiceAccount) {
  console.error('FIREBASE_SERVICE_ACCOUNT_BASE64 is missing');
  process.exit(1);
}

const jsonStr = Buffer.from(rawServiceAccount, 'base64').toString('utf8');
const serviceAccount = JSON.parse(jsonStr);
if (serviceAccount.private_key) {
  serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
}

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function inspectData() {
  console.log('=== Batches ===');
  const batchesSnap = await db.collection('batches').get();
  batchesSnap.forEach(d => console.log(d.id, d.data()));

  console.log('\n=== Students ===');
  const studentsSnap = await db.collection('students').get();
  studentsSnap.forEach(d => {
    console.log(d.id, '->', d.data().name, '| batchId:', d.data().batchId);
  });

  console.log('\n=== Student Credentials ===');
  const credsSnap = await db.collection('student_credentials').get();
  credsSnap.forEach(d => console.log(d.id));

  console.log('\n=== Payments ===');
  const paymentsSnap = await db.collection('payments').get();
  paymentsSnap.forEach(d => console.log(d.id));

  console.log('\n=== Attendance Docs ===');
  const attSnap = await db.collection('attendance').get();
  attSnap.forEach(d => console.log(d.id, d.data().records));

  console.log('\n=== Tests Docs ===');
  const testsSnap = await db.collection('tests').get();
  testsSnap.forEach(d => console.log(d.id, d.data().marks));

  process.exit(0);
}

inspectData().catch(err => {
  console.error(err);
  process.exit(1);
});
