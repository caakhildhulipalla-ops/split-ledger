export const metadata = { title: 'Terms of use' };

/**
 * DRAFT — fill in the operator details and have it reviewed before publishing.
 */
export default function TermsPage() {
  return (
    <div className="wrap" style={{ maxWidth: 760 }}>
      <div className="sheet">
        <div className="sheet-head">
          <h2>Terms of use</h2>
          <span className="sub">Split Ledger</span>
        </div>
        <div className="sheet-body" style={{ lineHeight: 1.65 }}>
          <p className="hint bad" style={{ marginTop: 0 }}>
            Operator: fill in the bracketed details and have this reviewed before you
            publish. Not legal advice.
          </p>

          <p>
            These terms govern your use of Split Ledger, operated by{' '}
            <strong>[LEGAL NAME]</strong>. By signing in you accept them. Last updated{' '}
            <strong>[DATE]</strong>.
          </p>

          <h3 style={{ marginTop: 22 }}>What Split Ledger is</h3>
          <p>
            A record-keeping tool. It tracks what a group of people have spent and what
            that implies they owe each other. <strong>It does not move money.</strong> It
            is not a payment service, a wallet, a lending service or a financial
            institution, and recording a payment in the app does not make a payment.
          </p>

          <h3 style={{ marginTop: 22 }}>The numbers are yours</h3>
          <p>
            Balances are computed from what you and your group enter. We take care that
            the arithmetic is correct — splits always account for every unit and balances
            always sum to zero — but we cannot know whether the underlying entries are
            accurate, complete, or agreed between you. Settling a debt in real life is
            between you and the other person. Use the app as a record, not as a
            determination of who owes what.
          </p>

          <h3 style={{ marginTop: 22 }}>Your account</h3>
          <p>
            Keep access to your sign-in method secure. You are responsible for what is
            entered from your account. Anyone you invite to a group can see and edit that
            group&rsquo;s entries, so invite carefully and revoke links you no longer
            need.
          </p>

          <h3 style={{ marginTop: 22 }}>Acceptable use</h3>
          <p>
            Do not use Split Ledger for anything unlawful, do not enter other
            people&rsquo;s personal information beyond what a shared ledger needs, and do
            not attempt to access groups you have not been invited to.
          </p>

          <h3 style={{ marginTop: 22 }}>Availability</h3>
          <p>
            The service is provided as-is. We do not promise it will always be available
            or error-free, and we may change or discontinue it. Keep your own record of
            anything you cannot afford to lose.
          </p>

          <h3 style={{ marginTop: 22 }}>Liability</h3>
          <p>
            To the extent permitted by law, <strong>[LEGAL NAME]</strong> is not liable
            for indirect or consequential loss, or for disputes between members of a group
            about what is owed. Nothing here limits liability that cannot lawfully be
            limited.
          </p>

          <h3 style={{ marginTop: 22 }}>Ending it</h3>
          <p>
            You may stop using the service at any time and ask us to delete your account
            (see the <a href="/privacy">privacy policy</a>). We may suspend an account
            that breaches these terms.
          </p>

          <h3 style={{ marginTop: 22 }}>Governing law</h3>
          <p>
            These terms are governed by the laws of <strong>[JURISDICTION]</strong>.
          </p>

          <p style={{ marginTop: 22 }}>
            Questions: <strong>[CONTACT EMAIL]</strong>.
          </p>
        </div>
      </div>
    </div>
  );
}
