'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  updateGroup,
  deleteGroup,
  addMember,
  renameMember,
  removeMember,
  restoreMember,
  createInvite,
  revokeInvite,
} from '@/app/actions';
import { hueVar, whenLabel, plural } from '@/lib/format';
import { CURRENCIES, type GroupData, type GroupInvite } from '@/lib/types';

export default function SettingsView({
  data,
  invites,
  origin,
}: {
  data: GroupData;
  invites: GroupInvite[];
  origin: string;
}) {
  const { group, members } = data;
  const router = useRouter();
  const [pending, start] = useTransition();

  const [name, setName] = useState(group.name);
  const [currency, setCurrency] = useState(group.currency);
  const [newMember, setNewMember] = useState('');
  const [names, setNames] = useState<Record<string, string>>(
    Object.fromEntries(members.map((m) => [m.id, m.display_name])),
  );
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');

  const run = (fn: () => Promise<{ ok: boolean; error?: string } | void>) =>
    start(async () => {
      setError('');
      const res = await fn();
      if (res && 'ok' in res && !res.ok) {
        setError(res.error ?? 'Something went wrong.');
        return;
      }
      router.refresh();
    });

  const inviteLink = (code: string) => `${origin}/join/${code}`;

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(inviteLink(code));
      setCopied(code);
      setTimeout(() => setCopied(''), 2000);
    } catch {
      setError('Could not copy — select the link and copy it manually.');
    }
  };

  const liveInvites = invites.filter(
    (i) => !i.revoked_at && new Date(i.expires_at) > new Date() && i.uses < i.max_uses,
  );

  return (
    <>
      <div className="sheet">
        <div className="sheet-head">
          <h2>Group</h2>
        </div>
        <div className="sheet-body">
          <div className="row2">
            <div className="field">
              <label htmlFor="s-name">Group name</label>
              <input id="s-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="s-cur">Currency</label>
              <select
                id="s-cur"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
              >
                {Object.entries(CURRENCIES).map(([code, c]) => (
                  <option key={code} value={code}>
                    {code} {c.sym} — {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button
            className="btn btn-primary"
            disabled={pending || !name.trim()}
            onClick={() => run(() => updateGroup(group.id, name, currency))}
          >
            {pending ? 'Saving…' : 'Save changes'}
          </button>
          <p className="hint">
            Changing the currency relabels existing amounts — it does not convert them.
          </p>
        </div>
      </div>

      <div className="sheet">
        <div className="sheet-head">
          <h2>Members</h2>
          <span className="sub">
            {plural(members.filter((m) => !m.removed_at).length, 'active member')}
          </span>
        </div>

        <div className="tbl-scroll">
          <table className="ledger">
            <thead>
              <tr>
                <th>Name</th>
                <th>Account</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className={m.removed_at ? 'void' : undefined}>
                  <td>
                    <span
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
                    >
                      <span className="dot" style={{ background: hueVar(m.hue) }} />
                      <input
                        value={names[m.id] ?? ''}
                        onChange={(e) =>
                          setNames({ ...names, [m.id]: e.target.value })
                        }
                        onBlur={() => {
                          const v = (names[m.id] ?? '').trim();
                          if (v && v !== m.display_name)
                            run(() => renameMember(group.id, m.id, v));
                        }}
                        style={{
                          border: '1px solid var(--rule-strong)',
                          borderRadius: 5,
                          padding: '4px 8px',
                          background: 'var(--surface)',
                          fontSize: 14,
                          minWidth: 140,
                        }}
                      />
                    </span>
                  </td>
                  <td className="meta">
                    {m.user_id ? (
                      <span className="catchip on">signed in</span>
                    ) : (
                      <span className="catchip">not joined yet</span>
                    )}
                    {m.role === 'owner' && <> <span className="catchip">owner</span></>}
                  </td>
                  <td className="r" style={{ whiteSpace: 'nowrap' }}>
                    {!m.user_id && (
                      <button
                        className="btn btn-sm"
                        disabled={pending}
                        onClick={() => run(() => createInvite(group.id, m.id))}
                      >
                        Invite {m.display_name}
                      </button>
                    )}{' '}
                    {m.removed_at ? (
                      <button
                        className="btn btn-sm btn-ghost"
                        disabled={pending}
                        onClick={() => run(() => restoreMember(group.id, m.id))}
                      >
                        Restore
                      </button>
                    ) : (
                      <button
                        className="btn btn-sm btn-ghost btn-danger"
                        disabled={pending}
                        onClick={() => run(() => removeMember(group.id, m.id))}
                      >
                        Retire
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="sheet-body" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            placeholder="Add someone by name"
            value={newMember}
            onChange={(e) => setNewMember(e.target.value)}
            style={{
              border: '1px solid var(--rule-strong)',
              borderRadius: 6,
              padding: '7px 10px',
              background: 'var(--surface)',
              flex: '1 1 200px',
              fontSize: 14,
            }}
          />
          <button
            className="btn"
            disabled={pending || !newMember.trim()}
            onClick={() =>
              run(async () => {
                const res = await addMember(group.id, newMember);
                if (res.ok) setNewMember('');
                return res;
              })
            }
          >
            Add member
          </button>
        </div>

        <div className="recon">
          <span className="mini">
            Retiring keeps every past expense intact and only hides the person from new
            ones. Someone who appears in an expense can never be fully deleted — that is
            what stops balances drifting.
          </span>
        </div>
      </div>

      <div className="sheet">
        <div className="sheet-head">
          <h2>Invite links</h2>
          <span className="sub">anyone with the link joins this group</span>
          <span className="grow" />
          <button
            className="btn btn-sm btn-primary"
            disabled={pending}
            onClick={() => run(() => createInvite(group.id))}
          >
            New invite link
          </button>
        </div>

        {liveInvites.length ? (
          <div className="tbl-scroll">
            <table className="ledger">
              <thead>
                <tr>
                  <th>Link</th>
                  <th>For</th>
                  <th>Expires</th>
                  <th className="r">Uses</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {liveInvites.map((i) => {
                  const slot = members.find((m) => m.id === i.member_id);
                  return (
                    <tr key={i.id}>
                      <td>
                        <code style={{ fontSize: 12, wordBreak: 'break-all' }}>
                          {inviteLink(i.code)}
                        </code>
                      </td>
                      <td className="meta">
                        {slot ? slot.display_name : 'anyone'}
                      </td>
                      <td className="meta">{whenLabel(i.expires_at)}</td>
                      <td className="r money meta">
                        {i.uses}/{i.max_uses}
                      </td>
                      <td className="r" style={{ whiteSpace: 'nowrap' }}>
                        <button className="btn btn-sm" onClick={() => copy(i.code)}>
                          {copied === i.code ? 'Copied' : 'Copy'}
                        </button>{' '}
                        <button
                          className="btn btn-sm btn-ghost btn-danger"
                          disabled={pending}
                          onClick={() => run(() => revokeInvite(group.id, i.id))}
                        >
                          Revoke
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">
            No active invite links. Make one for a specific person from the members table
            above and their existing expenses come with them when they join.
          </div>
        )}

        <div className="recon">
          <span className="mini">
            Links expire after two weeks and stop working after 20 uses. Revoke one the
            moment it is somewhere you did not intend.
          </span>
        </div>
      </div>

      <div className="sheet">
        <div className="sheet-head">
          <h2>Danger zone</h2>
        </div>
        <div className="sheet-body">
          <p style={{ marginTop: 0 }}>
            Deleting <strong>{group.name}</strong> removes every expense, payment and
            balance in it for everyone. It cannot be undone.
          </p>
          <button
            className="btn btn-danger"
            disabled={pending}
            onClick={() => {
              if (
                confirm(
                  `Delete "${group.name}" and every expense in it? This cannot be undone.`,
                )
              )
                run(() => deleteGroup(group.id));
            }}
          >
            Delete this group
          </button>
        </div>
      </div>

      {error && (
        <div className="sheet" style={{ marginTop: 18 }}>
          <div className="sheet-body">
            <p className="hint bad" style={{ margin: 0 }}>
              {error}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
