import { html } from '../lib/view'
import { shell } from './shell'

type Props = { error?: string }

export function login(props: Props) {
  return shell({
    title: 'Log in',
    content: content(props),
  })
}

function content({ error }: Props) {
  return html`<div id="root">
    <div id="header">
      <h1>Sweatosphere</h1>
      <p>Upload your activity to the Atmosphere.</p>
    </div>
    <div class="container">
      <form action="/login" method="post" class="login-form">
        <input
          type="text"
          name="handle"
          placeholder="Enter your handle (eg alice.bsky.social)"
          value="${process.env.DEFAULT_SOCIAL_HANDLE}"
          required
        />
        <button type="submit">Log in</button>
        ${error ? html`<p>Error: <i>${error}</i></p>` : undefined}
      </form>
      <div class="signup-cta">
        Don't have an account on the Atmosphere?
        <a href="https://bsky.app">Sign up for Bluesky</a> to create one now!
      </div>
    </div>
  </div>`
}
