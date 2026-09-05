export const metadata = { title: 'Offline' };

export default function OfflinePage() {
  return (
    <div className="wrap-narrow">
      <div className="sheet">
        <div className="sheet-head">
          <h2>No connection</h2>
        </div>
        <div className="sheet-body">
          <p style={{ marginTop: 0 }}>
            Split Ledger needs a connection to show balances. It deliberately does not
            keep a copy offline — a balance from an unknown point in time is worse than
            no balance at all, especially when someone is about to pay it.
          </p>
          <p className="mini">This page will work again the moment you are back online.</p>
        </div>
        <div className="modal-foot">
          <a className="btn btn-primary" href="/groups">
            Try again
          </a>
        </div>
      </div>
    </div>
  );
}
