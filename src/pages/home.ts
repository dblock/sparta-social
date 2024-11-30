import type { Activity } from '#/db'
import { decode } from 'multiformats/dist/src/varint'
import { html } from '../lib/view'
import { shell } from './shell'
import polyline from '@mapbox/polyline'
import { duration } from 'duration-pretty'

const TODAY = new Date().toDateString()

type Props = {
  activities: Activity[]
  didHandleMap: Record<string, string>
  profile?: { displayName?: string }
}

export function home(props: Props) {
  return shell({
    title: 'Home',
    content: content(props),
  })
}

function content({ activities, didHandleMap, profile }: Props) {
  return html`<div id="root">
    <div class="error"></div>
    <div id="header">
      <h1>Sparta Social</h1>
    </div>
    <div class="container">
      <div class="card">
        ${profile
          ? html`<form action="/logout" method="post" class="session-form">
              <div>
                Hi, <strong>${profile.displayName || 'friend'}</strong>. 
                Upload a .FIT file.
              </div>
              <div>
                <button type="submit">Log out</button>
              </div>
            </form>
            <form action="/activity" method="post" class="activity-form" enctype="multipart/form-data">
              <input type="file" id="file" name="activity" />
              <input type="submit">
            </form>`
          : html`<div class="session-form">
              <div><a href="/login">Log in</a> to upload an activity!</div>
              <div>
                <a href="/login" class="button">Log in</a>
              </div>
            </div>`}
      </div>
      ${activities.map((activity, i) => {
        const handle = didHandleMap[activity.authorDid] || activity.authorDid
        const date = ts(activity)
        const map = mapUrl(activity)
        return html`
          <div class=${i === 0 ? 'activity-line no-line' : 'activity-line'}>
            <div>
              <div class="title">${activity.activityType}</div>
            </div>
            <div class="desc">
              <a class="author" href=${toBskyLink(handle)}>@${handle}</a>
              <div class="distance"><b>Distance:</b> ${distanceInMeters(activity)}mi</div>
              <div class="time"><b>Time:</b> ${timeInSeconds(activity)}</div>
              <div class="time"><b>Start:</b> ${activity.startAtInUTC}</div>             
            </div>
            <div class="map">
              <img src=${map}></img>
            </div>
          </div>
        `
      })}
    </div>
  </div>`
}

function toBskyLink(did: string) {
  return `https://bsky.app/profile/${did}`
}

function ts(activity: Activity) {
  const createdAt = new Date(activity.createdAt)
  const indexedAt = new Date(activity.indexedAt)
  if (createdAt < indexedAt) return createdAt.toDateString()
  return indexedAt.toDateString()
}

function mapUrl(activity: Activity) {
  if (process.env.GOOGLE_STATIC_MAPS_API_KEY && activity.mapPolyline) {
    const decodedPolyline = polyline.decode(activity.mapPolyline)
    if (decodedPolyline.length > 0) {
      const startAt = decodedPolyline[0]
      const endAt = decodedPolyline[decodedPolyline.length - 1]

      return "https://maps.googleapis.com/maps/api/staticmap?maptype=roadmap&path=enc:" + activity.mapPolyline + 
        "&key=" + process.env.GOOGLE_STATIC_MAPS_API_KEY + 
        "&size=800x800" +
        "&markers=color:yellow|label:S|" + startAt[0] + "," + startAt[1] +
        "&markers=color:green|label:F|" + endAt[0] + "," + endAt[1]
    }
  }
}

function distanceInMeters(activity: Activity) {
  return (activity.distanceInCm / 100 * 0.00062137).toFixed(2)
}

function timeInSeconds(activity: Activity) {
  return duration(activity.movingTimeInMs, 'milliseconds').format('H:mm:ss')
}