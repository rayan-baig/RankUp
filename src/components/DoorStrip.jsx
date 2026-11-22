import '../styles/doorstrip.css'

/**
 * A strip of RankUp's real screens under the front door, on a computer
 * (0.32.0).
 *
 * On a wide window the door's two columns filled the middle of the screen
 * and left the top and bottom empty. This fills the bottom with four of the
 * app's own screens, small, each drawn from the same pieces and words as the
 * real one rather than photographed (so it cannot go stale): the parent's
 * Review with Accept, a child's world screen, the rewards a child saves for,
 * and the parent's This week. The child is Noah in Pegasus Horizon, the same
 * pretend child as the demo phone above, with RankUp's own drawing of that
 * world. Never Block Craft: those pictures are the owner's, kept for the
 * children who pick that world.
 *
 * Fetched only on a computer window (960px wide, 700px tall), after the page
 * has loaded (screens/Welcome.jsx), so a phone never downloads a byte of it
 * and the first file is unchanged. Decoration: hidden from screen readers,
 * whose users have the same story in the four steps above.
 */
const WORLD_ART = `${import.meta.env.BASE_URL}drawn/avatar-pegasus.svg`

export default function DoorStrip() {
  return (
    <section className="door-strip" aria-hidden="true" data-testid="door-strip">
      <figure className="door-tile">
        <div className="door-screen door-screen-parent">
          <p className="ds-kicker">Review</p>
          <div className="ds-card">
            <div className="ds-row">
              <span className="ds-icon">🛏️</span>
              <span className="ds-grow">
                <b>Make your bed</b>
                <small>Noah · 10 minutes ago</small>
              </span>
              <span className="ds-xp">+15 XP</span>
            </div>
            <div className="ds-buttons">
              <span className="ds-btn ds-btn-go">Accept</span>
              <span className="ds-btn">Send back</span>
            </div>
          </div>
          <div className="ds-card ds-dim">
            <div className="ds-row">
              <span className="ds-icon">🍽️</span>
              <span className="ds-grow"><b>Set the table</b><small>Noah · 1 hour ago</small></span>
              <span className="ds-xp">+20 XP</span>
            </div>
          </div>
        </div>
        <figcaption>You accept on your phone</figcaption>
      </figure>

      <figure className="door-tile">
        <div className="door-screen door-screen-kid">
          <div className="ds-hero">
            <img src={WORLD_ART} alt="" width="38" height="38" loading="lazy" decoding="async" />
            <span className="ds-grow">
              <b>Noah</b>
              <small>Level 4 · Pegasus Horizon</small>
              <span className="ds-bar"><span /></span>
            </span>
          </div>
          <p className="ds-kicker">Do this next</p>
          <div className="ds-quest">
            <span className="ds-icon">🐱</span>
            <span className="ds-grow"><b>Feed the cat</b><small>+20 XP · ✨ +4</small></span>
          </div>
          <span className="ds-btn ds-btn-kid">Start this quest</span>
        </div>
        <figcaption>They level up in their world</figcaption>
      </figure>

      <figure className="door-tile">
        <div className="door-screen door-screen-kid">
          <p className="ds-kicker">Rewards · Noah has ✨ 62</p>
          {[['🎬', 'Pick Friday’s film', 60, 100], ['🌙', 'An hour later bedtime', 90, 69], ['🎢', 'Day out, you choose', 250, 25]].map(([icon, name, cost, pct]) => (
            <div key={name} className="ds-reward">
              <span className="ds-icon">{icon}</span>
              <span className="ds-grow">
                <b>{name}</b>
                <span className={`ds-bar ds-bar-${pct}`}><span /></span>
              </span>
              <span className="ds-cost">✨ {cost}</span>
            </div>
          ))}
        </div>
        <figcaption>Rewards you choose, saved up for</figcaption>
      </figure>

      <figure className="door-tile">
        <div className="door-screen door-screen-parent">
          <p className="ds-kicker">This week · against last week</p>
          <div className="ds-week">
            <span><b>6</b><small>Chores</small><i>▲ 3</i></span>
            <span><b>369</b><small>XP</small><i>▲ 278</i></span>
            <span><b>3</b><small>In a row</small><i>▲ 1</i></span>
          </div>
          <p className="ds-note">⚡ The 1.5× XP boost gave Noah 60 extra XP this week.</p>
        </div>
        <figcaption>You see what got done</figcaption>
      </figure>
    </section>
  )
}
