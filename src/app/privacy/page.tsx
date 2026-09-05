export const metadata = { title: 'Privacy policy' };

/**
 * DRAFT. Accurate to what this codebase actually does, but the operator's
 * legal details must be filled in and a lawyer should review it before the
 * app is published. Play requires a reachable privacy policy URL and its
 * Data safety form must agree with what this page says.
 */
export default function PrivacyPage() {
  return (
    <div className="wrap" style={{ maxWidth: 760 }}>
      <div className="sheet">
        <div className="sheet-head">
          <h2>Privacy policy</h2>
          <span className="sub">Split Ledger</span>
        </div>
        <div className="sheet-body" style={{ lineHeight: 1.65 }}>
          <p className="hint bad" style={{ marginTop: 0 }}>
            Operator: fill in the bracketed details and have this reviewed before you
            publish. It describes what the code does; it is not legal advice.
          </p>

          <p>
            Split Ledger is operated by <strong>[LEGAL NAME]</strong>,{' '}
            <strong>[ADDRESS]</strong>. Questions and requests:{' '}
            <strong>[CONTACT EMAIL]</strong>. Last updated <strong>[DATE]</strong>.
          </p>

          <h3 style={{ marginTop: 22 }}>What we collect</h3>
          <ul>
            <li>
              <strong>Account identifier.</strong> Whichever you sign in with — a Google
              account, an email address, or a mobile number. We store the address or
              number and a user ID.
            </li>
            <li>
              <strong>Your display name</strong>, taken from your Google profile or the
              first part of your email, and editable by you.
            </li>
            <li>
              <strong>What you enter.</strong> Group names, member names you type,
              expense descriptions, amounts, dates, categories, notes, and payments you
              record.
            </li>
          </ul>
          <p>
            We do <strong>not</strong> collect location, contacts, photos, device
            identifiers for advertising, or any bank or card details. Split Ledger records
            that a payment happened; it never moves money and is not connected to any
            payment network.
          </p>

          <h3 style={{ marginTop: 22 }}>Who can see it</h3>
          <p>
            Everything you enter in a group is visible to the other members of that
            group. That is the purpose of a shared ledger. It is not visible to anyone
            else: access is enforced in the database itself, per row, so a person who is
            not a member of your group cannot read it even if they know its address.
          </p>
          <p>
            Names you type for people who have not signed up are visible to that
            group&rsquo;s members only. If you add someone by name, you are entering
            their name into our service — only add people who would expect to be in that
            ledger.
          </p>

          <h3 style={{ marginTop: 22 }}>Why we hold it</h3>
          <p>
            To provide the service you asked for: keeping a shared ledger and computing
            balances. We do not sell your data, we do not share it with advertisers, and
            we do not use it to train anything.
          </p>

          <h3 style={{ marginTop: 22 }}>Where it lives</h3>
          <p>
            Data is stored with our infrastructure providers,{' '}
            <strong>[Supabase — region]</strong> for the database and authentication and{' '}
            <strong>[Vercel]</strong> for application hosting. They process it on our
            instructions. Transport is encrypted; the database is encrypted at rest.
          </p>

          <h3 style={{ marginTop: 22 }}>How long</h3>
          <p>
            For as long as your account exists. Deleting a group removes its expenses and
            balances for everyone in it. To delete your account and the data attached to
            it, email <strong>[CONTACT EMAIL]</strong> and we will do so within 30 days.
            Note that expenses you entered in a shared group remain part of that
            group&rsquo;s ledger for its other members, because removing them would
            silently change what other people owe each other; your name is detached from
            them.
          </p>

          <h3 style={{ marginTop: 22 }}>Your rights</h3>
          <p>
            You may ask for a copy of your data, ask us to correct it, or ask us to
            delete it, by writing to <strong>[CONTACT EMAIL]</strong>. If you are in
            India, the Digital Personal Data Protection Act, 2023 applies and{' '}
            <strong>[NAME]</strong> is the point of contact for grievances. If you are in
            the UK or EU, the UK GDPR / GDPR applies and our lawful basis is performance
            of a contract with you.
          </p>

          <h3 style={{ marginTop: 22 }}>Children</h3>
          <p>
            Split Ledger is not directed at children under 13 and we do not knowingly
            collect their data.
          </p>

          <h3 style={{ marginTop: 22 }}>Changes</h3>
          <p>
            If this policy changes materially we will say so in the app before the change
            takes effect.
          </p>
        </div>
      </div>
    </div>
  );
}
