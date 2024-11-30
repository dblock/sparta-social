import assert from 'node:assert'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { OAuthResolverError } from '@atproto/oauth-client-node'
import { isValidHandle } from '@atproto/syntax'
import { TID } from '@atproto/common'
import { Agent, ComNS } from '@atproto/api'
import express from 'express'
import { getIronSession } from 'iron-session'
import type { AppContext } from '#/index'
import { home } from '#/pages/home'
import { login } from '#/pages/login'
import { env } from '#/lib/env'
import { page } from '#/lib/view'
import * as Activity from '#/lexicon/types/org/sparta-social/activity'
import * as Profile from '#/lexicon/types/app/bsky/actor/profile'
import FitParser from 'fit-file-parser'
import multer from 'multer'
import polyline from '@mapbox/polyline'

const upload = multer({ storage: multer.memoryStorage() })

type Session = { did: string }

// Helper function for defining routes
const handler =
  (fn: express.Handler) =>
  async (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    try {
      await fn(req, res, next)
    } catch (err) {
      next(err)
    }
  }

// Helper function to get the Atproto Agent for the active session
async function getSessionAgent(
  req: IncomingMessage,
  res: ServerResponse<IncomingMessage>,
  ctx: AppContext
) {
  const session = await getIronSession<Session>(req, res, {
    cookieName: 'sid',
    password: env.COOKIE_SECRET,
  })
  if (!session.did) return null
  try {
    const oauthSession = await ctx.oauthClient.restore(session.did)
    return oauthSession ? new Agent(oauthSession) : null
  } catch (err) {
    ctx.logger.warn({ err }, 'oauth restore failed')
    await session.destroy()
    return null
  }
}

export const createRouter = (ctx: AppContext) => {
  const router = express.Router()

  // Static assets
  router.use('/public', express.static(path.join(__dirname, 'pages', 'public')))

  // OAuth metadata
  router.get(
    '/client-metadata.json',
    handler((_req, res) => {
      return res.json(ctx.oauthClient.clientMetadata)
    })
  )

  // OAuth callback to complete session creation
  router.get(
    '/oauth/callback',
    handler(async (req, res) => {
      const params = new URLSearchParams(req.originalUrl.split('?')[1])
      try {
        const { session } = await ctx.oauthClient.callback(params)
        const clientSession = await getIronSession<Session>(req, res, {
          cookieName: 'sid',
          password: env.COOKIE_SECRET,
        })
        assert(!clientSession.did, 'session already exists')
        clientSession.did = session.did
        await clientSession.save()
      } catch (err) {
        ctx.logger.error({ err }, 'oauth callback failed')
        return res.redirect('/?error')
      }
      return res.redirect('/')
    })
  )

  // Login page
  router.get(
    '/login',
    handler(async (_req, res) => {
      return res.type('html').send(page(login({})))
    })
  )

  // Login handler
  router.post(
    '/login',
    handler(async (req, res) => {
      // Validate
      const handle = req.body?.handle
      if (typeof handle !== 'string' || !isValidHandle(handle)) {
        return res.type('html').send(page(login({ error: 'invalid handle' })))
      }

      // Initiate the OAuth flow
      try {
        const url = await ctx.oauthClient.authorize(handle, {
          scope: 'atproto transition:generic',
        })
        return res.redirect(url.toString())
      } catch (err) {
        ctx.logger.error({ err }, 'oauth authorize failed')
        return res.type('html').send(
          page(
            login({
              error:
                err instanceof OAuthResolverError
                  ? err.message
                  : "couldn't initiate login",
            })
          )
        )
      }
    })
  )

  // Logout handler
  router.post(
    '/logout',
    handler(async (req, res) => {
      const session = await getIronSession<Session>(req, res, {
        cookieName: 'sid',
        password: env.COOKIE_SECRET,
      })
      await session.destroy()
      return res.redirect('/')
    })
  )

  // Homepage
  router.get(
    '/',
    handler(async (req, res) => {
      // If the user is signed in, get an agent which communicates with their server
      const agent = await getSessionAgent(req, res, ctx)

      // Fetch data stored in our SQLite
      const activities = await ctx.db
        .selectFrom('activity')
        .selectAll()
        .orderBy('indexedAt', 'desc')
        .limit(10)
        .execute()

      // Map user DIDs to their domain-name handles
      const didHandleMap = await ctx.resolver.resolveDidsToHandles(
        activities.map((s) => s.authorDid)
      )

      if (!agent) {
        // Serve the logged-out view
        return res.type('html').send(page(home({ activities, didHandleMap })))
      }

      // Fetch additional information about the logged-in user
      const { data: profileRecord } = await agent.com.atproto.repo.getRecord({
        repo: agent.assertDid,
        collection: 'app.bsky.actor.profile',
        rkey: 'self',
      })
      const profile =
        Profile.isRecord(profileRecord.value) &&
        Profile.validateRecord(profileRecord.value).success
          ? profileRecord.value
          : {}

      // Serve the logged-in view
      return res.type('html').send(
        page(
          home({
            activities,
            didHandleMap,
            profile
          })
        )
      )
    })
  )

  // "Upload activity" handler
  router.post(
    '/activity',
    upload.single("activity"),
    handler(async (req, res) => {
      console.log(req.file)

      // If the user is signed in, get an agent which communicates with their server
      const agent = await getSessionAgent(req, res, ctx)
      if (!agent) {
        return res
          .status(401)
          .type('html')
          .send('<h1>Error: Session required</h1>')
      }

      new FitParser().parse(req.file.buffer, async function (error, data) {
        if (error) {
          return res
          .status(400)
          .type('html')
          .send('<h1>Error: Invalid activity file</h1>')
        }

        // Construct & validate their activity record
        const rkey = TID.nextStr()

        const record = {
          $type: 'org.sparta-social.activity',
          title: req.file.originalname,
          description: "",
          activityType: "Run",
          distanceInCm: data.sessions[0].total_distance * 100,
          movingTimeInMs: data.sessions[0].total_timer_time * 1000,
          elapsedTimeInMs: data.sessions[0].total_elapsed_time * 1000,
          totalElevationGainInCm: (data.sessions[0].total_ascent + data.sessions[0].total_descent) * 100,
          mapPolyline: polyline.encode(
            data.records
              .filter((pt) => pt.position_lat && pt.position_long )
              .map((pt) => [pt.position_lat, pt.position_long])
          ),
          startAtInUTC: data.sessions[0].start_time.toISOString(),
          startAtTimeZone: data.sessions[0].timestamp.toISOString(),
          createdAt: new Date().toISOString(),
        }   

        const validationResult = Activity.validateRecord(record)
        if (! validationResult.success) {
          console.log(validationResult)
          return res
            .status(400)
            .type('html')
            .send('<h1>Error: Invalid activity (' + validationResult.error + ')</h1>')
        }

        let uri
        try {
          // Write the activity record to the user's repository
          const res = await agent.com.atproto.repo.putRecord({
            repo: agent.assertDid,
            collection: 'org.sparta-social.activity',
            rkey,
            record,
            validate: false,
          })
          uri = res.data.uri
        } catch (err) {
          ctx.logger.warn({ err }, 'failed to write record')
          return res
            .status(500)
            .type('html')
            .send('<h1>Error: Failed to write record</h1>')
        }

        try {
          // Optimistically update our SQLite
          // This isn't strictly necessary because the write event will be
          // handled in #/firehose/ingestor.ts, but it ensures that future reads
          // will be up-to-date after this method finishes.
          await ctx.db
            .insertInto('activity')
            .values({
              uri,
              title: record.title,
              activityType: record.activityType,
              distanceInCm: record.distanceInCm,
              movingTimeInMs: record.movingTimeInMs,
              elapsedTimeInMs: record.elapsedTimeInMs,
              totalElevationGainInCm: record.totalElevationGainInCm,
              mapPolyline: record.mapPolyline,
              startAtInUTC: record.startAtInUTC,
              startAtTimeZone: record.startAtTimeZone,
              authorDid: agent.assertDid,
              createdAt: record.createdAt,
              indexedAt: new Date().toISOString(),
            })
            .execute()

            return res.redirect('/')
          } catch (err) {
          ctx.logger.warn(
            { err },
            'failed to update computed view; ignoring as it should be caught by the firehose'
          )
        }

        return res.redirect('/')
      })
    })
  )

  return router
}
