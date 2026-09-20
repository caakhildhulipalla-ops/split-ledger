'use client';

/**
 * Shed daily entry.
 *
 * The design target is under two minutes per shed, so the screen opens with
 * everything already decided that can be: the shed a supervisor is responsible
 * for, today's date, and the session that has not been recorded yet. What is
 * left is six numbers.
 *
 * It computes hen-day % and feed per bird live as the numbers are typed. A
 * supervisor who has mistyped 85,000 eggs instead of 8,500 sees 850% before
 * they save, which catches more errors than any amount of validation after
 * the fact.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import {
  Banner, Card, DayInput, Field, Icon, Item, NumberInput, Pill, SectionTitle,
  Sheet, TextArea, TopBar, num, ratio,
} from '@/components/ui';
import { addDays, formatDay, formatDayShort, today, type DayKey } from '@/domain/dates';
import { feedPerBirdPerDayGrams, henDayPercent, totalEggs } from '@/domain/production';
import { gramsFromKg, kg } from '@/domain/units';
import { canEdit, canEnterFor, dailyEntryKey, entryRefusal } from '@/lib/merge';
import { useMasters, usePermissions, useRecentLedger } from '@/lib/hooks';
import { useData } from '@/lib/store';
import { tap } from '@/lib/native';
import type { DailyEntry, Session } from '@/lib/types';

export default function EntryPage() {
  return <AppShell><Entry /></AppShell>;
}

function Entry() {
  const router = useRouter();
  const { list, session } = useData();
  const { sheds, flockIn, farmOf } = useMasters();
  const permissions = usePermissions();

  const day = today();
  const ledger = useRecentLedger(3, day);

  const mine = useMemo(
    () => sheds.filter((s) => permissions.allows(s.id)),
    [sheds, permissions],
  );

  const entries = list('daily-entry');
  const [editing, setEditing] = useState<{ shedId: string; day: DayKey; session: Session; existing: DailyEntry | null } | null>(null);

  if (mine.length === 0) {
    return (
      <>
        <TopBar title="Daily entry" />
        <div className="page">
          <div className="empty" style={{ marginTop: 40 }}>
            <h3>No shed assigned to you</h3>
            <p>Ask the owner to add a shed and put you on it.</p>
            {permissions.masters && (
              <div className="mt">
                <button className="btn primary" onClick={() => router.push('/setup')}>Set up a shed</button>
              </div>
            )}
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <TopBar title="Daily entry" sub={formatDay(day)} />
      <div className="page">
        <SectionTitle>Today</SectionTitle>
        <div className="stack-sm">
          {mine.map((shed) => {
            const flock = flockIn(shed.id);
            const sessions: Session[] = shed.sessionsPerDay === 2 ? ['morning', 'evening'] : ['day'];
            const done = sessions.filter((s) =>
              entries.some((e) => e.shedId === shed.id && e.day === day && e.session === s));

            return (
              <Card key={shed.id} pad={false}>
                <div className="card-pad row-between">
                  <div className="grow">
                    <div className="strong">{shed.name}</div>
                    <div className="small muted">
                      {flock ? `${flock.name} · ${num(ledger.birds.byFlock.get(flock.id)?.get(day) ?? 0)} birds` : 'No flock placed'}
                    </div>
                  </div>
                  {done.length === sessions.length
                    ? <Pill tone="good"><Icon.check size={13} /> Done</Pill>
                    : <Pill tone="warn">{done.length}/{sessions.length}</Pill>}
                </div>

                <div className="list">
                  {sessions.map((s) => {
                    const existing = entries.find((e) => e.shedId === shed.id && e.day === day && e.session === s) ?? null;
                    return (
                      <Item
                        key={s}
                        title={s === 'day' ? 'Record the day' : s === 'morning' ? 'Morning collection' : 'Evening collection'}
                        meta={existing
                          ? `${num(totalEggs(existing.eggs))} eggs · ${num(kg(existing.feedGrams))} kg feed`
                          : 'Not recorded'}
                        value={existing ? <Icon.check size={17} /> : <Icon.plus size={17} />}
                        onClick={() => {
                          if (!flock) return;
                          setEditing({ shedId: shed.id, day, session: s, existing });
                        }}
                      />
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </div>

        <SectionTitle>Earlier</SectionTitle>
        <div className="card list" style={{ padding: 0 }}>
          {entries
            .filter((e) => e.day < day && permissions.allows(e.shedId))
            .sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0))
            .slice(0, 12)
            .map((entry) => {
              const shed = sheds.find((s) => s.id === entry.shedId);
              return (
                <Item
                  key={entry.id}
                  title={`${shed?.name ?? 'Shed'} · ${formatDayShort(entry.day, day)}`}
                  meta={`${entry.session === 'day' ? 'Full day' : entry.session} · ${num(entry.died)} died`}
                  value={num(totalEggs(entry.eggs))}
                  sub="eggs"
                  onClick={() => setEditing({ shedId: entry.shedId, day: entry.day, session: entry.session, existing: entry })}
                />
              );
            })}
          {entries.filter((e) => e.day < day).length === 0 && (
            <div className="item muted small">Nothing recorded before today.</div>
          )}
        </div>
      </div>

      {editing && (
        <EntrySheet
          shedId={editing.shedId}
          day={editing.day}
          session={editing.session}
          existing={editing.existing}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------- the form */

function EntrySheet({ shedId, day: initialDay, session: initialSession, existing, onClose }: {
  shedId: string;
  day: DayKey;
  session: Session;
  existing: DailyEntry | null;
  onClose: () => void;
}) {
  const { list, create, update, session: who } = useData();
  const { shedOf, flockIn } = useMasters();
  const permissions = usePermissions();
  const shed = shedOf(shedId);
  const flock = flockIn(shedId);
  const items = list('item').filter((i) => i.category === 'feed' && i.active);
  const entries = list('daily-entry');

  const [day, setDay] = useState(initialDay);
  const [session, setSession] = useState<Session>(initialSession);
  const [gradeA, setGradeA] = useState(existing ? String(existing.eggs.gradeA) : '');
  const [gradeB, setGradeB] = useState(existing ? String(existing.eggs.gradeB) : '');
  const [broken, setBroken] = useState(existing ? String(existing.eggs.broken) : '');
  const [died, setDied] = useState(existing ? String(existing.died) : '');
  const [culled, setCulled] = useState(existing ? String(existing.culled) : '');
  const [feedKg, setFeedKg] = useState(existing ? String(kg(existing.feedGrams)) : '');
  const [feedItemId, setFeedItemId] = useState(existing?.feedItemId ?? items[0]?.id ?? '');
  const [remarks, setRemarks] = useState(existing?.remarks ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ledger = useRecentLedger(3, day);
  const liveAtStart = flock ? ledger.birds.byFlock.get(flock.id)?.get(day) ?? 0 : 0;

  const n = (s: string) => Math.max(0, Math.round(Number(s) || 0));
  const eggs = { gradeA: n(gradeA), gradeB: n(gradeB), broken: n(broken) };
  const feedGrams = gramsFromKg(Number(feedKg) || 0);

  const henDay = henDayPercent(eggs, liveAtStart);
  const perBird = feedPerBirdPerDayGrams(feedGrams, liveAtStart);

  const ctx = { role: permissions.role, now: Date.now() };
  const dayRefusal = entryRefusal(day, ctx);
  const locked = existing ? !canEdit(existing, existing.day, ctx) : false;

  // One entry per shed, per date, per session.
  const clash = useMemo(() => {
    const key = dailyEntryKey(shedId, day, session);
    return entries.find((e) => e.id !== existing?.id && dailyEntryKey(e.shedId, e.day, e.session) === key) ?? null;
  }, [entries, shedId, day, session, existing]);

  const henDayWarning = henDay !== null && henDay > 110
    ? `That is ${henDay.toFixed(0)}% of the flock — check the egg count.`
    : null;
  const feedWarning = perBird !== null && perBird > 200
    ? `That is ${perBird.toFixed(0)} g per bird — check the feed figure.`
    : null;

  const save = async () => {
    if (!flock || !shed || !who) return;
    if (dayRefusal) { setError(dayRefusal); return; }
    if (clash) { setError('That session is already recorded. Open the existing entry to change it.'); return; }
    setBusy(true);
    setError(null);
    try {
      const payload = {
        farmId: shed.farmId,
        shedId,
        flockId: flock.id,
        day,
        session,
        eggs,
        died: n(died),
        culled: n(culled),
        feedGrams,
        feedItemId: feedItemId || null,
        remarks: remarks.trim(),
      };
      if (existing) await update(existing.id, payload);
      else await create('daily-entry', payload);
      void tap();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
      setBusy(false);
    }
  };

  const sessions: Session[] = shed?.sessionsPerDay === 2 ? ['morning', 'evening'] : ['day'];

  return (
    <Sheet
      open
      onClose={onClose}
      title={shed?.name ?? 'Shed'}
      sub={flock ? `${flock.name} · ${num(liveAtStart)} birds` : undefined}
      actions={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy || locked} onClick={() => void save()}>
            {busy ? 'Saving…' : existing ? 'Update entry' : 'Save entry'}
          </button>
        </>
      }
    >
      {locked && (
        <Banner tone="warn" title="This entry is locked">
          Entries can be changed on the day they were made. Ask the owner to correct it.
        </Banner>
      )}
      {dayRefusal && <Banner tone="bad">{dayRefusal}</Banner>}
      {clash && !existing && (
        <Banner tone="warn" title="Already recorded">
          {shed?.name} has a {session} entry for {formatDay(day)} with {num(totalEggs(clash.eggs))} eggs.
        </Banner>
      )}

      <div className="stack" style={{ marginTop: 4 }}>
        {(permissions.role !== 'supervisor' || day !== today()) && (
          <div className="grid-2">
            <Field label="Date">
              <DayInput value={day} onChange={(v) => setDay(v)} max={today()} />
            </Field>
            {sessions.length > 1 && (
              <Field label="Session">
                <select className="select" value={session} onChange={(e) => setSession(e.target.value as Session)}>
                  {sessions.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
            )}
          </div>
        )}

        <SectionTitle>Eggs collected</SectionTitle>
        <div className="grid-3">
          <Field label="50 g +">
            <NumberInput value={gradeA} onChange={setGradeA} decimal={false} autoFocus />
          </Field>
          <Field label="Under 50 g">
            <NumberInput value={gradeB} onChange={setGradeB} decimal={false} />
          </Field>
          <Field label="Broken">
            <NumberInput value={broken} onChange={setBroken} decimal={false} />
          </Field>
        </div>

        {henDayWarning && <Banner tone="warn">{henDayWarning}</Banner>}

        <SectionTitle>Birds lost</SectionTitle>
        <div className="grid-2">
          <Field label="Died">
            <NumberInput value={died} onChange={setDied} decimal={false} />
          </Field>
          <Field label="Culled">
            <NumberInput value={culled} onChange={setCulled} decimal={false} />
          </Field>
        </div>

        <SectionTitle>Feed used</SectionTitle>
        <Field label="Quantity" hint={items.length > 1 ? undefined : 'Drawn from what this shed has been issued.'}>
          <div className="qty">
            <input
              className="input num"
              inputMode="decimal"
              value={feedKg}
              placeholder="0"
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => setFeedKg(e.target.value.replace(/[^\d.]/g, ''))}
            />
            <select className="select" value={feedItemId} onChange={(e) => setFeedItemId(e.target.value)} aria-label="Feed">
              {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </div>
        </Field>
        {feedWarning && <Banner tone="warn">{feedWarning}</Banner>}

        <Field label="Remarks" hint="Anything the owner should know.">
          <TextArea value={remarks} onChange={setRemarks} placeholder="Optional" />
        </Field>

        {/* Live feedback: the strongest check against a mistyped figure. */}
        <Card className="mt-sm">
          <div className="row-between small">
            <span className="dim">Hen-day</span>
            <span className="num strong">{ratio(henDay, 1, '%')}</span>
          </div>
          <div className="row-between small" style={{ marginTop: 6 }}>
            <span className="dim">Feed per bird</span>
            <span className="num strong">{ratio(perBird, 0, ' g')}</span>
          </div>
          <div className="row-between small" style={{ marginTop: 6 }}>
            <span className="dim">Eggs in total</span>
            <span className="num strong">{num(totalEggs(eggs))}</span>
          </div>
        </Card>

        {error && <Banner tone="bad">{error}</Banner>}
      </div>
    </Sheet>
  );
}
