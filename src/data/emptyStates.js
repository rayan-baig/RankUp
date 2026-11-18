/**
 * What a screen says when there is nothing on it yet.
 *
 * A new family opens most screens before anything has happened on them, and
 * a blank card, or "Nothing yet", tells them nothing. Each entry here is a
 * short title, one line on what will appear, and the one thing to do next.
 * A parent's next step is a button to the screen that does it. A child's
 * screens send them somewhere they can act, or say who can.
 *
 * In one place so the words stay short and plain, and so tests/firststeps.mjs
 * can check every action leads to a real screen.
 */
export const EMPTY_STATES = Object.freeze({
  // The parent's side.
  noKids: {
    icon: '👶',
    title: 'No children yet',
    body: 'Add your first child to start. It takes a minute.',
    action: { label: 'Add a child', to: '/parent/kids' },
  },
  review: {
    icon: '✨',
    title: 'Nothing to review',
    body: 'When a child taps “I did it!”, the chore lands here for you to accept.',
    action: { label: 'Add a chore', to: '/parent/assign' },
  },
  history: {
    icon: '📜',
    title: 'No chores done yet',
    body: 'Every chore a child sends in is listed here, with what you decided.',
    action: { label: 'Add a chore', to: '/parent/assign' },
  },
  money: {
    icon: '💷',
    title: 'No pocket money yet',
    body: 'Put a price on a chore when you add it. What it earns shows here.',
    action: { label: 'Add a paid chore', to: '/parent/assign' },
  },
  activity: {
    icon: '🌱',
    title: 'Nothing has happened yet',
    body: 'Chores, level-ups and rewards show here as they happen.',
    action: { label: 'Add a chore', to: '/parent/assign' },
  },
  rewards: {
    icon: '🎁',
    title: 'No rewards yet',
    body: 'Kids save up what they earn for these. Start with three; change them any time.',
    // Done right here, in one tap (lib/firstWeek.js, STARTER_REWARDS).
    action: { label: 'Add 3 starter rewards', to: '/parent/settings?open=rewards' },
  },

  // The child's side.
  kidQuests: {
    icon: '📭',
    title: 'No quests to do',
    // Nothing a child can do about it but ask, so no button that leads in a
    // circle (Rewards is empty too, for a new family).
    body: 'Ask your grown-up to add your first quest.',
    action: null,
  },
  kidRewards: {
    icon: '🎁',
    title: 'No rewards yet',
    body: 'Ask your grown-up to add some. Keep earning so you are ready!',
    action: { label: 'See my quests', to: '/kid/quests' },
  },
})

/** The longest a title or a line may be, so each fits a phone in a line or two. */
export const EMPTY_LIMITS = Object.freeze({ title: 32, body: 90, label: 24 })
