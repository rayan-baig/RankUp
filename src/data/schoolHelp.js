import {
  SCHOOL_PRICES, SCHOOL_TRIAL_DAYS, SCHOOL_CHAMPION_TRIAL_DAYS, SCHOOL_YEAR_MONTHS, SCHOOL_MIN_STUDENTS,
  SCHOOL_DAILY_CHORES, SCHOOL_MAX_RIVALS, SCHOOL_STARS, dollars,
} from '../lib/schools.js'

/**
 * The School League's help page (/#/school/help), as data.
 *
 * The questions a principal or teacher asks before and after signing up,
 * answered from what the code does. Every number is read from the code that
 * decides it (lib/schools.js, whose copies of the SQL's rules
 * tests/schoolhelp.mjs holds to supabase/schools.sql): the prices from the
 * price list, the trial, the year, the daily cap, rivals and Stars.
 */

/** "Up to <n> students: $<month> a month, or $<year> a year", one per size, from the price list. */
export function schoolPriceLines() {
  return SCHOOL_PRICES.map((p, i) => {
    const size = i === 0 ? `Up to ${p.upTo} students`
      : i === SCHOOL_PRICES.length - 1 ? `${SCHOOL_PRICES[i - 1].upTo + 1} students or more`
        : `${SCHOOL_PRICES[i - 1].upTo + 1} to ${p.upTo} students`
    return `${size}: ${dollars(p.monthlyCents)} a month, or ${dollars(p.monthlyCents * SCHOOL_YEAR_MONTHS)} a year`
  })
}

export function schoolHelp() {
  const free = 12 - SCHOOL_YEAR_MONTHS
  return [
    {
      id: 'what',
      q: 'What is the School League?',
      a: [
        'Students earn points for their school by doing their chores at home, accepted by a parent in RankUp.',
        `Each month the school with the most points per student in its district is District Champion, schools take on their rivals head to head, and each school’s top ${SCHOOL_STARS} are its School Stars.`,
      ],
    },
    {
      id: 'price',
      q: 'How much does it cost?',
      a: [
        'The price depends on the size of the whole school, not how many students join:',
        ...schoolPriceLines(),
        `Paying for a year costs ${SCHOOL_YEAR_MONTHS} months, so ${free} months are free.`,
      ],
    },
    {
      id: 'trial',
      q: 'Is there a free trial?',
      a: [
        `Yes: ${SCHOOL_TRIAL_DAYS} days from signing up, with no card. Nothing is charged until the trial ends.`,
        'When you are ready, the admin chooses monthly or yearly on the school’s page and pays on Stripe’s own page. Card details never come near RankUp.',
      ],
    },
    {
      id: 'join',
      q: 'How do students join?',
      a: [
        'Your school’s page has a code for parents. A parent types it into RankUp to add their own child.',
        'Only a parent can put a child in a school. The school never adds anyone, and never sees a list of its students.',
      ],
    },
    {
      id: 'points',
      q: 'How are points counted, and is it fair to small schools?',
      a: [
        'Only chores a parent has accepted count, and a student counts for at most ' +
          `${SCHOOL_DAILY_CHORES} a day, so nobody can win by sending in fifty in one evening.`,
        'Points are averaged per student who joined, so a small school can beat a big one.',
        `A school needs at least ${SCHOOL_MIN_STUDENTS} students joined to be ranked in its district.`,
      ],
    },
    {
      id: 'see',
      q: 'What can the school see about students?',
      a: [
        `How many students joined, and each month its top ${SCHOOL_STARS}. A Star shows as “A student” unless their parent agreed to share their first name.`,
        'No lists of children, no chores, no photos and no messages. RankUp takes no photos at all.',
        'The admin checks the Stars before families see them, and can take out anyone who is not one of the school’s students.',
      ],
    },
    {
      id: 'verify',
      q: 'Why does our school have to be checked?',
      a: [
        'We check every school is real, and that the person who signed it up works there, before it joins a league.',
        'Until then the school is not ranked, cannot challenge rivals, and sees no student’s name. A school email address makes it quicker.',
      ],
    },
    {
      id: 'champion',
      q: 'What does the District Champion win?',
      a: [
        'Its next month free: a paying school is not charged for it, and a school still on its free trial gets ' +
          `${SCHOOL_CHAMPION_TRIAL_DAYS} more days of it.`,
        'Many schools add a certificate or a shout-out in assembly for their Stars too.',
      ],
    },
    {
      id: 'rivals',
      q: 'How do rivals work?',
      a: [
        `The admin can challenge another checked school in the same district, up to ${SCHOOL_MAX_RIVALS} rivalries at a time. The other school accepts or declines.`,
        'Each month the rivalry’s result is kept, and either school can end it.',
      ],
    },
    {
      id: 'staff',
      q: 'Can other teachers see the school’s page?',
      a: [
        'Yes. The admin’s page has a staff code. A teacher who signs up with it can see the page but not change it.',
        'The admin can remove a teacher, and if either code gets out, make new ones: the old ones stop working at once.',
      ],
    },
    {
      id: 'cancel',
      q: 'How do we cancel, or change our size?',
      a: [
        'A paying school’s admin opens “Card, invoices and cancelling” on the school’s page: that is Stripe’s own page for cards, invoices and cancelling.',
        'On the trial, the admin can change the number of students on the school’s page. Once paying, or to make a checked school smaller, contact us and we change it.',
      ],
    },
  ]
}
