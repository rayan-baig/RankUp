/**
 * The privacy policy, the terms, and the consent notice.
 *
 * Kept as content rather than a linked PDF so it ships with the app, is
 * versioned with the code, and can be read on a phone. `CONSENT_VERSION` must
 * match a row in the database's `consent_notices` table — if you change what
 * you collect, publish a new version in both places and ask every parent again.
 *
 * THIS IS NOT LEGAL ADVICE AND HAS NOT BEEN REVIEWED BY A LAWYER. It is a
 * complete, honest starting draft written from what the app actually does, so
 * that a solicitor is reviewing something concrete rather than drafting from
 * scratch. Do not launch on it unread.
 */

export const CONSENT_VERSION = '2026-01'
export const LAST_UPDATED = 'January 2026'

/** Fill these in before you publish anything. */
export const OPERATOR = {
  name: '[YOUR NAME OR COMPANY]',
  email: '[YOUR CONTACT EMAIL]',
  address: '[YOUR POSTAL ADDRESS]',
}

export const CONSENT_NOTICE = {
  version: CONSENT_VERSION,
  title: 'What RankUp collects about your child',
  sections: [
    {
      heading: 'What we collect',
      body: [
        'The first name you enter for your child. Nothing else identifying — no surname, no birthday, no email address, no home address.',
        'The chores you assign, and whether they were completed.',
        'Photographs your child takes in the app as proof a chore is done. These are usually pictures inside your home.',
        'The theme they choose, and their XP, level and in-app currency.',
      ],
    },
    {
      heading: 'About the photographs',
      body: [
        'Photographs are the most sensitive thing here, and we treat them that way.',
        'They are stored so you can review them, and are deleted automatically once you have — you choose how long to keep them in Settings, and you can set that to as little as a day.',
        'If you turn on the AI photo check, a photograph is sent to Anthropic to be assessed and a short opinion comes back. It is not used to train models. You can leave this off and the app works exactly the same, minus that opinion.',
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
        `RankUp is operated by ${OPERATOR.name}. You can reach us at ${OPERATOR.email}.`,
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
        'A first name, chosen by you. Photographs of completed chores. Chore and progress history. Nothing more.',
        'Children do not have their own accounts, email addresses or passwords. A child\'s device joins your account with a six-digit code that you type in.',
        'We collect nothing at all about a child until you have given verifiable parental consent. This is enforced by our database, not just by the app.',
      ],
    },
    {
      heading: 'How long we keep it',
      body: [
        'Chore photographs: until you have reviewed them, plus a retention window you choose in Settings (30 days by default, or as little as one day).',
        'Everything else: until you delete your account, which removes it immediately and permanently.',
      ],
    },
    {
      heading: 'Who we share it with',
      body: [
        'Nobody, except the services that make the app work: Supabase (hosting and database), Anthropic (the AI photo check, only if you turn it on), Stripe (payments, only if you subscribe), and a push notification service if you enable notifications.',
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
        'Turn off the AI photo check, notifications, or guilds independently. The app works without any of them.',
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
  intro: `The rules for using RankUp. Last updated ${LAST_UPDATED}.`,
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
        'Standard is $9.99 a month and Elite Pass is $15.99 a month, billed monthly until you cancel.',
        'You can cancel at any time from Settings. Your subscription runs to the end of the period you have paid for, and is not renewed.',
        'If a payment fails we will retry, and your account moves to Standard features if it keeps failing. Nothing your child has earned is ever removed.',
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
      heading: 'The AI photo check',
      body: [
        'The photo check produces an opinion to help you decide. It is not a verdict, it is sometimes wrong in both directions, and it never approves or rejects anything by itself. Every decision is yours.',
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
