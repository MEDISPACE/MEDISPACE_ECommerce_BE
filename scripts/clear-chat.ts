import { MongoClient } from 'mongodb'
import dotenv from 'dotenv'

dotenv.config()

const MONGODB_URI = `mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@medispacedb.35qkwso.mongodb.net/?retryWrites=true&w=majority&appName=MediSpaceDB`
const DB_NAME = process.env.DB_NAME || 'medispace'

async function clearChat() {
  const client = new MongoClient(MONGODB_URI)
  try {
    await client.connect()
    const db = client.db(DB_NAME)
    const conversationsColl = db.collection('conversations')
    const messagesColl = db.collection('messages')

    console.log('Clearing all conversations and messages...')
    await conversationsColl.deleteMany({})
    await messagesColl.deleteMany({})
    console.log('Successfully cleared all chat history!')
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await client.close()
  }
}

clearChat()
