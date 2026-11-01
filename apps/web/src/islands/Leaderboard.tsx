import { useEffect, useState } from 'react';

interface Row { username: string; avatarUrl: string | null; points: number; solved: number }
export default function Leaderboard({ initial, currentUser }: { initial: Row[]; currentUser?: string }) {
  const [rows, setRows] = useState(initial);
  useEffect(() => {
    let timer: number | undefined;
    const poll = () => { timer = window.setInterval(async () => {
      const response = await fetch('/api/leaderboard');
      if (response.ok) setRows(((await response.json()) as { data: Row[] }).data);
    }, 15_000); };
    try {
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const socket = new WebSocket(`${protocol}//${location.host}/api/leaderboard/live`);
      socket.onmessage = (event) => setRows(JSON.parse(event.data));
      socket.onerror = () => { socket.close(); poll(); };
      return () => { socket.close(); if (timer) clearInterval(timer); };
    } catch { poll(); return () => { if (timer) clearInterval(timer); }; }
  }, []);
  if (!rows.length) return <p className="border-t border-border py-8 text-muted">Belum ada penyelesaian. Selesaikan level pertama untuk mengisi peringkat.</p>;
  return <div className="overflow-x-auto border-t border-border">
    <table className="w-full border-collapse text-left text-sm sm:text-base">
      <thead className="text-sm text-muted"><tr><th className="py-4 pr-4 font-normal">Posisi</th><th className="py-4 pr-4 font-normal">Pemain</th><th className="py-4 pr-4 text-right font-normal">Level</th><th className="py-4 text-right font-normal">Poin</th></tr></thead>
      <tbody>{rows.map((row, index) => <tr key={row.username} className={`border-t border-border ${row.username === currentUser ? 'bg-accent/5' : ''}`}><td className="py-4 pr-4 font-mono text-sm text-muted">{index + 1}</td><td className="py-4 pr-4"><a className="flex min-h-11 items-center gap-2 font-medium break-all hover:text-accent sm:gap-3" href={`/u/${row.username}`}>{row.avatarUrl && <img src={row.avatarUrl} alt="" className="hidden h-8 w-8 shrink-0 rounded-full sm:block" />}{row.username}</a></td><td className="py-4 pr-4 text-right text-muted">{row.solved}</td><td className="py-4 text-right font-mono">{row.points}</td></tr>)}</tbody>
    </table>
  </div>;
}
