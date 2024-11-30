import type { Activity } from '#/db'
import { html } from '../lib/view'
import { shell } from './shell'

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
      <h1>Sweatosphere</h1>
    </div>
    <div class="container">
      <div class="card">
        ${profile
          ? html`<form action="/logout" method="post" class="session-form">
              <div>
                Hi, <strong>${profile.displayName || 'friend'}</strong>. 
                Upload an activity.
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
        return html`
          <div class=${i === 0 ? 'activity-line no-line' : 'activity-line'}>
            <div>
              <div class="title">${activity.title}</div>
            </div>
            <div class="desc">
              <a class="author" href=${toBskyLink(handle)}>@${handle}</a>
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
