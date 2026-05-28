import { MongoClient } from 'mongodb'
import dotenv from 'dotenv'

dotenv.config()

const MONGODB_URI = `mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@medispacedb.35qkwso.mongodb.net/?retryWrites=true&w=majority&appName=MediSpaceDB`
const DB_NAME = process.env.DB_NAME || 'medispace'

async function checkChat() {
  const client = new MongoClient(MONGODB_URI)
  try {
    await client.connect()
    const db = client.db(DB_NAME)
    const conversationsColl = db.collection('conversations')
    const messagesColl = db.collection('messages')

    console.log('--- CONVERSATIONS ---')
    const conversations = await conversationsColl.find({}).sort({ updatedAt: -1 }).limit(5).toArray()
    for (const c of conversations) {
      console.log(`Conv ID: ${c._id}, Type: ${c.type}, Status: ${c.status}, Customer: ${c.customerId}, Pharmacist: ${c.pharmacistId}, Last Msg: "${c.lastMessage}"`)
      console.log('  Messages:')
      const messages = await messagesColl.find({ conversationId: c._id }).sort({ createdAt: 1 }).toArray()
      for (const m of messages) {
        console.log(`    [${m.createdAt.toISOString()}] [${m.senderRole}]${m.isAI ? ' [AI]' : ''}: ${m.content}`)
      }
      console.log('------------------')
    }
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await client.close()
  }
}

checkChat()
