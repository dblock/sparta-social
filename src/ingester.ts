import pino from 'pino'
import { IdResolver } from '@atproto/identity'
import { Firehose } from '@atproto/sync'
import type { Database } from '#/db'
import * as Activity from '#/lexicon/types/org/sweatosphere/activity'

export function createIngester(db: Database, idResolver: IdResolver) {
  const logger = pino({ name: 'firehose ingestion' })
  return new Firehose({
    idResolver,
    handleEvent: async (evt) => {
      // Watch for write events
      if (evt.event === 'create' || evt.event === 'update') {
        const now = new Date()
        const record = evt.record

        // If the write is a valid activity update
        if (
          evt.collection === 'org.sweatosphere.activity' &&
          Activity.isRecord(record) &&
          Activity.validateRecord(record).success
        ) {
          // Store the activity in our SQLite
          await db
            .insertInto('activity')
            .values({
              uri: evt.uri.toString(),
              authorDid: evt.did,
              title: record.title,
              description: record.description,
              activityType: record.activityType,
              distanceInCm: record.distanceInCm,
              movingTimeInMs: record.movingTimeInMs,
              elapsedTimeInMs: record.elapsedTimeInMs,
              totalElevationGainInCm: record.totalElevationGainInCm,
              mapSummaryPolyline: record.mapSummaryPolyline,
              startAtInUTC: record.startAtInUTC,
              startAtTimeZone: record.startAtTimeZone,
              createdAt: record.createdAt,
              indexedAt: now.toISOString(),
            })
            .onConflict((oc) =>
              oc.column('uri').doUpdateSet({
                  title: record.title,
                  description: record.description,
                  activityType: record.activityType,
                  distanceInCm: record.distanceInCm,
                  movingTimeInMs: record.movingTimeInMs,
                  elapsedTimeInMs: record.elapsedTimeInMs,
                  totalElevationGainInCm: record.totalElevationGainInCm,
                  mapSummaryPolyline: record.mapSummaryPolyline,
                  startAtInUTC: record.startAtInUTC,
                  startAtTimeZone: record.startAtTimeZone,
                  indexedAt: now.toISOString(),
              })
            )
            .execute()
        }
      } else if (
        evt.event === 'delete' &&
        evt.collection === 'org.sweatosphere.activity'
      ) {
        // Remove the activity from our SQLite
        await db.deleteFrom('activity').where('uri', '=', evt.uri.toString()).execute()
      }
    },
    onError: (err) => {
      logger.error({ err }, 'error on firehose ingestion')
    },
    filterCollections: ['org.sweatosphere.activity'],
    excludeIdentity: true,
    excludeAccount: true,
  })
}
