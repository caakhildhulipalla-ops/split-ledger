'use client';

import { useRouter } from 'next/navigation';

export default function GroupSwitcher({
  groups,
  current,
}: {
  groups: { id: string; name: string }[];
  current: string;
}) {
  const router = useRouter();

  return (
    <label className="picker">
      <span className="lbl">Group</span>
      <select
        aria-label="Choose group"
        value={current}
        onChange={(e) => {
          if (e.target.value === '__all') router.push('/groups');
          else router.push(`/g?id=${e.target.value}`);
        }}
      >
        {groups.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
        <option value="__all">All groups…</option>
      </select>
    </label>
  );
}
