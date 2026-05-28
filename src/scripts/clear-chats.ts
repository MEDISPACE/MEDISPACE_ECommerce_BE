import { MongoClient } from 'mongodb'
import { config } from 'dotenv'

config()

const uri = `mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@medispacedb.35qkwso.mongodb.net/?retryWrites=true&w=majority&appName=MediSpaceDB`

async function clearActiveConversations() {
  const client = new MongoClient(uri)
  try {
    await client.connect()
    const db = client.db(process.env.DB_NAME)
    const conversations = db.collection('conversations')
    
    const result = await conversations.updateMany(
      { status: 'active' },
      { $set: { status: 'closed', updatedAt: new Date() } }
    )
    console.log(`[OK] Đã đóng thành công ${result.modifiedCount} cuộc trò chuyện.`)
  } catch (err) {
    console.error('Lỗi:', err)
  } finally {
    await client.close()
  }
}

clearActiveConversations()
