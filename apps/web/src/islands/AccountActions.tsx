import { useState } from 'react';
export default function AccountActions() {
  const [confirming, setConfirming] = useState(false);
  async function remove() {
    const response = await fetch('/api/me', { method: 'DELETE' });
    if (response.ok) location.href = '/';
  }
  return <div className="mt-10 border-t border-border pt-6">
    {!confirming ? <button type="button" onClick={() => setConfirming(true)} className="text-sm text-danger underline underline-offset-4">Hapus akun</button> : <div><p className="max-w-[52ch] text-sm leading-6 text-muted">Progress, submission, dan seluruh sesi akan dihapus permanen.</p><div className="mt-3 flex gap-2"><button type="button" onClick={remove} className="rounded-base bg-danger px-4 py-2 text-sm font-medium text-bg">Hapus permanen</button><button type="button" onClick={() => setConfirming(false)} className="rounded-base border border-border px-4 py-2 text-sm">Batal</button></div></div>}
  </div>;
}
