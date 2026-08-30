/**
 * Ready-made quest packs so a parent can fill a kid's list in one tap instead of
 * typing eight chores. `doneMeans` matters: it is what the AI photo check and
 * the parent both read when deciding whether a submission counts.
 */

export const CATEGORIES = [
  { id: 'bedroom', label: 'Bedroom', icon: '🛏️' },
  { id: 'kitchen', label: 'Kitchen', icon: '🍽️' },
  { id: 'bathroom', label: 'Bathroom', icon: '🛁' },
  { id: 'laundry', label: 'Laundry', icon: '🧺' },
  { id: 'outdoor', label: 'Outdoor', icon: '🌳' },
  { id: 'pets', label: 'Pets', icon: '🐾' },
  { id: 'school', label: 'School', icon: '📚' },
  { id: 'selfcare', label: 'Self care', icon: '🪥' },
  { id: 'kindness', label: 'Kindness', icon: '💛' },
]

export const CATEGORY_MAP = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]))

export const QUEST_PACKS = [
  {
    id: 'kid',
    label: 'Kid pack',
    ages: '6–11',
    blurb: 'Multi-step chores with a clear finished state.',
    quests: [
      { title: 'Make your bed', category: 'bedroom', difficulty: 'easy', requiresPhoto: true, doneMeans: 'Duvet pulled up flat, pillows at the top, nothing on the floor beside the bed.', why: 'Starting the day with one finished thing makes the rest easier.' },
      { title: 'Load the dishwasher', category: 'kitchen', difficulty: 'medium', requiresPhoto: true, doneMeans: 'Sink is empty and the dishwasher racks are loaded, not just stacked.', why: 'The kitchen is shared, so the cleanup is shared too.' },
      { title: 'Take the bins out', category: 'outdoor', difficulty: 'medium', requiresPhoto: true, doneMeans: 'Bin is at the kerb with the lid shut and a fresh bag is in the kitchen bin.', why: 'Nobody enjoys it. That is exactly why it counts.' },
      { title: 'Tidy your desk', category: 'bedroom', difficulty: 'medium', requiresPhoto: true, doneMeans: 'Desk surface is clear enough to write on.', why: 'A clear desk makes homework take less time.' },
      { title: 'Vacuum the living room', category: 'outdoor', difficulty: 'hard', requiresPhoto: true, doneMeans: 'Visible crumbs gone, including under the coffee table.', why: 'Doing the bit nobody checks is what makes it real.' },
      { title: 'Read for 20 minutes', category: 'school', difficulty: 'medium', requiresPhoto: false, timerSeconds: 1200, doneMeans: 'Timer ran the full 20 minutes with the book open.', why: 'Twenty minutes a day is about a million words a year.' },
      { title: 'Homework done and checked', category: 'school', difficulty: 'hard', requiresPhoto: true, doneMeans: 'All set questions attempted and the page photographed.', why: 'Finishing is a skill you practise, not a talent you have.' },
    ],
  },
  {
    id: 'teen',
    label: 'Teen pack',
    ages: '12+',
    blurb: 'Longer chores and independent responsibilities.',
    quests: [
      { title: 'Cook one family meal', category: 'kitchen', difficulty: 'boss', requiresPhoto: true, doneMeans: 'A finished meal on the table that other people ate.', why: 'Feeding yourself well is the single most useful adult skill.' },
      { title: 'Wash, dry and put away one load', category: 'laundry', difficulty: 'hard', requiresPhoto: true, doneMeans: 'Drawer or wardrobe photo showing the clothes actually put away.', why: 'Half-done laundry is not laundry.' },
      { title: 'Clean the bathroom', category: 'bathroom', difficulty: 'hard', requiresPhoto: true, doneMeans: 'Sink, mirror and toilet all wiped, floor clear.', why: 'The rooms nobody wants are the ones that show real effort.' },
      { title: 'Mow the lawn', category: 'outdoor', difficulty: 'boss', requiresPhoto: true, doneMeans: 'Whole lawn cut at an even height and clippings cleared.', why: 'Big jobs teach you to pace yourself.' },
      { title: 'Score 80%+ on a practice test', category: 'school', difficulty: 'hard', requiresPhoto: false, testScore: true, doneMeans: 'Enter your real percentage — 80% or higher earns the bonus.', why: 'Testing yourself beats re-reading notes every time.' },
      { title: 'Plan and shop for one meal', category: 'kitchen', difficulty: 'boss', requiresPhoto: true, doneMeans: 'Photo of the ingredients bought within the budget agreed.', why: 'Money and food are the two things you will manage forever.' },
    ],
  },
  {
    id: 'adaptive',
    label: 'Adaptive starter pack',
    ages: 'Any',
    adaptive: true,
    blurb: 'Built around what a specific kid can do, not a fixed standard.',
    quests: [
      { title: 'Put three things where they belong', category: 'bedroom', difficulty: 'easy', adaptive: true, requiresPhoto: true, doneMeans: 'Three items moved to their spot. Which three is up to you.', why: 'A countable, finishable target beats "tidy your room".', supports: ['Countable target', 'No time limit'] },
      { title: 'Wipe one surface you choose', category: 'kitchen', difficulty: 'easy', adaptive: true, requiresPhoto: true, doneMeans: 'Any one surface looks cleaner than before. Partial counts.', why: 'Choice removes the standoff before it starts.', supports: ['Kid picks the target', 'Partial credit'] },
      { title: 'Set the table your way', category: 'kitchen', difficulty: 'easy', adaptive: true, requiresPhoto: true, doneMeans: 'Everyone has something to eat with. Layout does not matter.', why: 'Contributing to the meal is the point, not the placement.', supports: ['No fixed layout'] },
      { title: 'Ten minutes of tidying, timer stops when you do', category: 'bedroom', difficulty: 'medium', adaptive: true, requiresPhoto: true, timerSeconds: 600, doneMeans: 'You worked until the timer ended or until you needed to stop. Both count.', why: 'Effort over outcome, on the days that is the honest measure.', supports: ['Effort-based', 'Stop any time'] },
      { title: 'Ask for help with one step', category: 'kindness', difficulty: 'easy', adaptive: true, requiresPhoto: false, doneMeans: 'You told someone which part you needed help with.', why: 'Asking for help is a skill worth rewarding, not a failure.', supports: ['Communication goal', 'No photo needed'] },
      { title: 'Follow the picture checklist', category: 'selfcare', difficulty: 'medium', adaptive: true, requiresPhoto: true, doneMeans: 'Each step on the checklist attempted, in any order.', why: 'Order-free routines cause far fewer meltdowns.', supports: ['Any order', 'Visual checklist'] },
    ],
  },
]

/** The support tags a parent can attach when writing a custom adaptive task. */
export const ADAPTIVE_SUPPORTS = [
  'Kid picks the target',
  'Countable target',
  'Partial credit',
  'Effort-based',
  'No time limit',
  'Stop any time',
  'Any order',
  'Visual checklist',
  'Communication goal',
  'No photo needed',
  'Seated task',
  'One-handed friendly',
  'Low sensory load',
  'Help from an adult allowed',
]
