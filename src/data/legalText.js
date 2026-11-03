/**
 * The privacy policy, the terms, and the consent notice.
 *
 * Kept as content rather than a linked PDF so it ships with the app, is
 * versioned with the code, and can be read on a phone. `CONSENT_VERSION` must
 * be the newest row in the database's `consent_notices` table, with the same
 * words: the database refuses a new consent to any other version. Change the
 * notice by publishing a new version in both places, never by editing one.
 *
 * THIS IS NOT LEGAL ADVICE AND HAS NOT BEEN REVIEWED BY A LAWYER. It is a
 * complete, honest starting draft written from what the app actually does, so
 * that a solicitor is reviewing something concrete rather than drafting from
 * scratch. Do not launch on it unread.
 */

import { TIERS } from '../state/initialState.js'
import { priceWords } from '../lib/plans.js'
import { SCHOOL_PRICES, SCHOOL_TRIAL_DAYS, SCHOOL_CHAMPION_TRIAL_DAYS, SCHOOL_YEAR_MONTHS, dollars } from '../lib/schools.js'

export const CONSENT_VERSION = '2026-11'
export const LAST_UPDATED = 'November 2026'
/*
 * 2026-11 is the notice below, word for word as supabase/consent.sql stores
 * it (tests/consent.mjs checks). 2026-01, the first version, still described
 * photographs and an AI photo check that RankUp no longer has. Removing data
 * collection does not need anyone to consent again, so parents who signed
 * 2026-01 stay signed; only new parents see and sign 2026-11. A version that
 * collects MORE would need every parent asked again; see docs/LEGAL.md.
 *
 * The policy and terms were updated for the School League without a new
 * consent version: joining a school is a
 * separate, explicit choice a parent makes on the School League screen, which
 * says there exactly what the school will see, in the same way a guild needs
 * a parent's yes before a child joins one.
 */

/**
 * Who runs RankUp. RankUp is a product of MTRX Horizyn, the company, and
 * lives on a subdomain of its domain (rankup.<your domain>). The contact
 * email and postal address are the company's, filled in once the domain and
 * the registered address exist; the app shows a warning banner until then.
 * The company's details only, never a person's.
 *
 * The consent notice below does not name the operator, so naming the company
 * here needed no new consent version.
 */
export const OPERATOR = {
  name: 'MTRX Horizyn',
  email: '[YOUR CONTACT EMAIL]',
  address: '[YOUR POSTAL ADDRESS]',
}

/** One sentence, used wherever RankUp says who is behind it. */
export const PRODUCT_OF = `RankUp is a product of ${OPERATOR.name}.`

/** "$29 a month up to 300, $59 up to 800, … and $149 above that", from the school price list. */
function schoolPriceList() {
  const bands = SCHOOL_PRICES.map((p, i) => {
    const price = dollars(p.monthlyCents)
    if (i === SCHOOL_PRICES.length - 1) return `and ${price} above that`
    return `${price}${i === 0 ? ' a month' : ''} up to ${p.upTo.toLocaleString('en-US')}`
  })
  return bands.join(', ')
}

/** The fields of OPERATOR still holding a placeholder. */
export const UNFILLED = Object.entries(OPERATOR).filter(([, v]) => v.startsWith('[')).map(([k]) => k)

export const CONSENT_NOTICE = {
  version: CONSENT_VERSION,
  title: 'What RankUp collects about your child',
  sections: [
    {
      heading: 'What we collect',
      body: [
        'The first name you enter for your child. Nothing else identifying — no surname, no birthday, no email address, no home address.',
        'The chores you assign, and whether they were completed.',
        'The theme they choose, and their XP, level and in-app currency.',
      ],
    },
    {
      heading: 'No photographs',
      body: [
        'RankUp never takes, sends or keeps photographs. If you want to see that a chore is done, your child can send you a picture from their own phone\'s camera app, the way you already message each other. It never passes through RankUp.',
      ],
    },
    {
      heading: 'What we never do',
      body: [
        'We do not sell your data or your child\'s data. To anyone. Ever.',
        'We show no advertising to children.',
        'Your child is never asked for an email address, a password or a phone number.',
        'We do not track your child across other websites or apps.',
      ],
    },
    {
      heading: 'Guilds, if you use them',
      body: [
        'A guild lets your child see other children\'s first names, levels and weekly XP, and exchange short messages with them.',
        'Nobody joins a guild until a parent on each side has agreed — yours, and the other child\'s.',
        'Phone numbers, email addresses and links are blocked in guild chat. Any child can report a message, which hides it immediately and shows it to both parents.',
        'You can remove your child from a guild at any moment.',
      ],
    },
    {
      heading: 'Your rights, at any time',
      body: [
        'See everything held about your child — Settings → Download my data.',
        'Delete all of it — Settings → Delete account. It is immediate and permanent.',
        'Withdraw this consent, which deletes your children\'s data with it.',
      ],
    },
  ],
  affirmation:
    'I confirm I am the parent or legal guardian of the children I add to this account, and I consent to RankUp collecting the information described above.',
}

export const PRIVACY_POLICY = {
  title: 'Privacy Policy',
  intro: `RankUp is a chore app for families. This policy explains what we collect, why, and what you can do about it. It is written to be read by a parent, not a lawyer. Last updated ${LAST_UPDATED}.`,
  sections: [
    {
      heading: 'Who we are',
      body: [
        `${PRODUCT_OF} ${OPERATOR.name} operates it, and is who "we" means here. You can reach us at ${OPERATOR.email}.`,
      ],
    },
    {
      heading: 'What we collect from parents',
      body: [
        'Your email address, so you can sign in and we can reach you about your account.',
        'Your name, as you enter it.',
        'Payment details if you subscribe. These are handled entirely by Stripe — we never see or store your card number.',
      ],
    },
    {
      heading: 'What we collect from children',
      body: [
        'A first name, chosen by you. Chore and progress history. Nothing more. No photographs.',
        'Children do not have their own accounts, email addresses or passwords. A child\'s device joins your account with a six-digit code that you type in.',
        'We collect nothing at all about a child until you have given verifiable parental consent. This is enforced by our database, not just by the app.',
      ],
    },
    {
      heading: 'The School League, if you join it',
      body: [
        'If your child\'s school takes part, you can add your child to it with a code the school gives you. Only a parent can do this; a school can never add a child.',
        'Your child\'s approved chores then count towards the school\'s monthly score. The school, and other schools, see the school\'s total and its average per student, never your child\'s chores or anything else.',
        'Each month the school sees its ten highest-scoring students. A child is shown there by first name only if you turned that on; otherwise they appear as "A student". You can change this at any time, and taking your child out of the school removes them from every list, past months included.',
        'A school sees no names at all until we have checked that it is a real school. Schools never see a list of their students, and nothing about any child is shown to another school.',
        'For school staff we collect the name and email address they sign in with, and the school\'s name, district, town and size.',
      ],
    },
    {
      heading: 'How long we keep it',
      body: [
        'Everything: until you delete your account, which removes it immediately and permanently.',
        'If you pay for a plan, deleting your account also cancels the subscription at once, so nothing more is charged. Stripe keeps its record of the payments you made (invoices and receipts), because payment records have to be kept for tax and are needed if a refund is due. We keep only Stripe\'s reference to your billing, and only until the cancellation is confirmed and 30 days have passed.',
      ],
    },
    {
      heading: 'Who we share it with',
      body: [
        'Nobody, except the services that make the app work: Supabase (hosting and database), Stripe (payments, only if you subscribe), a push notification service if you enable notifications, and an email service that sends your account emails (your email address only, never anything about your children).',
        'If you add your child to a school\'s league, that school sees what is described under "The School League" above, and nothing more.',
        'We do not sell data. We do not share it for advertising. We show children no advertising.',
      ],
    },
    {
      heading: 'Children\'s privacy',
      body: [
        'RankUp is designed for children and is subject to COPPA in the United States, the UK\'s Age Appropriate Design Code, and GDPR where it applies.',
        'We ask for verifiable parental consent before collecting anything from a child, we collect the minimum needed for the app to work, and we give parents access, deletion and withdrawal rights.',
      ],
    },
    {
      heading: 'Your choices',
      body: [
        'Download everything we hold: Settings → Download my data.',
        'Delete everything: Settings → Delete account.',
        'Turn off notifications or guilds independently. The app works without either.',
        'Take your child out of a school\'s league, or stop their first name being shown to the school, from the School League screen.',
      ],
    },
    {
      heading: 'Security',
      body: [
        'Data is encrypted in transit and at rest by our hosting provider. Access rules are enforced by the database itself, so one family cannot read another\'s data even if the app has a bug.',
        'No system is perfectly secure. If we ever have a breach affecting your family, we will tell you.',
      ],
    },
    {
      heading: 'Changes',
      body: [
        'If we change what we collect, we will publish a new version and ask for your consent again. We keep a record of exactly which version you agreed to and when.',
      ],
    },
  ],
}

export const TERMS = {
  title: 'Terms of Use',
  intro: `The rules for using RankUp. ${PRODUCT_OF} "We" means ${OPERATOR.name}. Last updated ${LAST_UPDATED}.`,
  sections: [
    {
      heading: 'Who may use RankUp',
      body: [
        'You must be 18 or older and the parent or legal guardian of any child you add.',
        'Children use RankUp through your account, on a device you have linked. They never create their own account.',
      ],
    },
    {
      heading: 'Subscriptions',
      body: [
        `${TIERS.starter.name} is free. ${TIERS.standard.name} is ${priceWords(TIERS.standard)} or ${priceWords(TIERS.standard, 'year')}, and ${TIERS.elite.name} is ${priceWords(TIERS.elite)} or ${priceWords(TIERS.elite, 'year')}, billed monthly or yearly until you cancel.`,
        'You can cancel at any time from Settings. Your subscription runs to the end of the period you have paid for, and is not renewed.',
        'Deleting your account cancels your subscription straight away rather than at the end of the period, so you are not charged again.',
        `If a payment fails we will retry, and your account moves to ${TIERS.starter.name} while it is failing. Nothing your child has earned is ever removed.`,
      ],
    },
    {
      heading: 'What is yours',
      body: [
        'Your family\'s data is yours. Download it or delete it whenever you like.',
        'In-app currency and XP have no monetary value, cannot be bought, and cannot be exchanged for anything outside the app.',
      ],
    },
    {
      heading: 'Fair use',
      body: [
        'Do not use RankUp to harass, harm or deceive anyone, and do not attempt to access another family\'s data.',
        'Guild chat is for children. We may remove content and suspend accounts that put children at risk.',
      ],
    },
    {
      heading: 'Schools',
      body: [
        'Whoever signs a school up must work there and be allowed to sign it up. We check every school before it joins a league, and we may suspend one that is not genuine or that misuses the league.',
        `A school's plan is priced by its number of students: ${schoolPriceList()}. A year costs ${SCHOOL_YEAR_MONTHS === 10 ? 'ten' : SCHOOL_YEAR_MONTHS} months. The first ${SCHOOL_TRIAL_DAYS} days are free, and nothing is charged until they end.`,
        'A school can cancel at any time from its School League page. Its plan runs to the end of the period paid for. If a payment keeps failing, or the plan ends, the school stops being ranked until it is renewed.',
        `Each month the best school in each district is named District Champion and its next month is free (or, during the free trial, the trial is extended by ${SCHOOL_CHAMPION_TRIAL_DAYS} days). This needs at least two ranked schools in the district.`,
        'Any prize a school gives its students is the school\'s own. A school must not use the league to identify, contact or single out any child outside the school\'s normal care of its students.',
      ],
    },
    {
      heading: 'No warranty',
      body: [
        'RankUp is provided as-is. We work hard to keep it running and your data safe, but we cannot promise it will never be unavailable or never lose data. Keep anything you truly cannot lose somewhere else too.',
      ],
    },
  ],
}
