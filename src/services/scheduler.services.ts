import { Agenda } from 'agenda'
import { MongoBackend } from '@agendajs/mongo-backend'
import databaseService from '~/services/database.services'
import communityVideoEventsService from '~/services/communityVideoEvents.services'

class SchedulerService {
  private agenda: InstanceType<typeof Agenda> | null = null
  private started = false

  async start() {
    if (this.started) return
    this.started = true

    this.agenda = new Agenda({
      backend: new MongoBackend({ mongo: databaseService.db, collection: process.env.AGENDA_JOB_COLLECTION || 'agendaJobs' }),
      processEvery: '30 seconds'
    })

    this.agenda.define('video-event-reminders', { lockLifetime: 4 * 60 * 1000, concurrency: 1 }, async () => {
      const startedAt = Date.now()
      console.info('[Scheduler] video-event-reminders started')
      try {
        const result = await communityVideoEventsService.sendDueReminders()
        console.info('[Scheduler] video-event-reminders completed', { ...result, durationMs: Date.now() - startedAt })
      } catch (error) {
        console.error('[Scheduler] video-event-reminders failed', { durationMs: Date.now() - startedAt, error })
        throw error
      }
    })

    await this.agenda.start()
    await this.agenda.every('5 minutes', 'video-event-reminders', undefined, { skipImmediate: true })
  }

  async stop() {
    await this.agenda?.stop()
    this.started = false
  }
}

const schedulerService = new SchedulerService()
export default schedulerService
