const { MongoClient } = require('mongodb');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const uri = `mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@medispacedb.35qkwso.mongodb.net/?retryWrites=true&w=majority&appName=MediSpaceDB`;
const client = new MongoClient(uri);

async function run() {
  try {
    await client.connect();
    const db = client.db(process.env.DB_NAME || 'medispacedb');

    // Print pharmacist status
    const pharmacists = await db.collection('users').find({ role: 1 }).toArray();
    console.log('--- PHARMACISTS STATUS ---');
    for (const p of pharmacists) {
      if (p.isOnline || p.onlineCount > 0) {
        console.log(`- Name: ${p.firstName} ${p.lastName}`);
        console.log(`  ID: ${p._id}`);
        console.log(`  isOnline: ${p.isOnline}`);
        console.log(`  onlineCount: ${p.onlineCount}`);
      }
    }
  } catch (err) {
    console.error(err);
  } finally {
    await client.close();
  }
}

run();
