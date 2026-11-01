import { useEffect, useMemo, useRef, useState } from 'react';
import { parsePayload, PayloadSyntaxError, toHex } from '../lib/payload/parser';
import type { EmulatorRequest, EmulatorResponse, EmulatorSnapshot } from '../lib/emulator/types';

interface Props {
  levelId: string;
  source: string;
  winAddress: number;
  authenticated: boolean;
  hints: string[];
}

const initial = '"A" * 68 + p32(0x0804802d)';
const tabs = ['Disassembly', 'Stack', 'Registers', 'Source'] as const;

export default function Workspace({ levelId, source, winAddress, authenticated, hints }: Props) {
  const worker = useRef<Worker | undefined>(undefined);
  const sequence = useRef(0);
  const pending = useRef(new Map<number, (value: EmulatorSnapshot) => void>());
  const [expression, setExpression] = useState(initial);
  const [snapshot, setSnapshot] = useState<EmulatorSnapshot>();
  const [active, setActive] = useState<(typeof tabs)[number]>('Disassembly');
  const [status, setStatus] = useState('Emulator sedang dimuat…');
  const [revealed, setRevealed] = useState(0);
  const [flag, setFlag] = useState('');
  const [instructions, setInstructions] = useState<Array<[number, string]>>([]);

  const parsed = useMemo(() => {
    try { return { bytes: parsePayload(expression), error: '' }; }
    catch (error) { return { bytes: new Uint8Array(), error: error instanceof PayloadSyntaxError ? error.message : String(error) }; }
  }, [expression]);

  const send = (command: EmulatorRequest['command'], payload?: Uint8Array) => new Promise<EmulatorSnapshot>((resolve) => {
    const id = ++sequence.current;
    pending.current.set(id, resolve);
    worker.current?.postMessage({ id, command, payload: payload ? Array.from(payload) : undefined } satisfies EmulatorRequest);
  });

  useEffect(() => {
    const instance = new Worker('/emulator/worker.js');
    worker.current = instance;
    instance.onerror = () => {
      setStatus('Emulator gagal dimuat. Periksa koneksi lalu muat ulang halaman.');
      pending.current.clear();
    };
    instance.onmessage = (event: MessageEvent<EmulatorResponse>) => {
      const response = event.data;
      if (response.ok) pending.current.get(response.id)?.(response.data);
      else setStatus(response.error.message);
      pending.current.delete(response.id);
    };
    send('load').then((value) => { setSnapshot(value); setStatus('Siap dijalankan.'); });
    return () => instance.terminate();
  }, []);

  useEffect(() => {
    if (active !== 'Disassembly' || instructions.length) return;
    let cancelled = false;
    Promise.all([import('capstone-wasm'), fetch(`/binaries/${levelId}.bin`).then((response) => response.arrayBuffer())]).then(async ([capstone, binary]) => {
      await capstone.loadCapstone();
      const engine = new capstone.Capstone(capstone.Const.CS_ARCH_X86, capstone.Const.CS_MODE_32);
      const rows = engine.disasm(new Uint8Array(binary), { address: 0x08048000, count: 40 }).map((item: { address: number | bigint; mnemonic: string; opStr: string }) => [Number(item.address), `${item.mnemonic} ${item.opStr}`] as [number, string]);
      engine.close();
      if (!cancelled) setInstructions(rows);
    }).catch(() => {
      if (!cancelled) setInstructions([[0x08048000, 'call 0x08048011'], [0x08048011, 'push ebp'], [winAddress, 'mov eax, 4  ; win']]);
    });
    return () => { cancelled = true; };
  }, [active, instructions.length, levelId, winAddress]);

  async function execute(command: 'run' | 'step' | 'continue') {
    if (parsed.error) return;
    setStatus(command === 'step' ? 'Menjalankan satu instruksi…' : 'Menjalankan payload…');
    const value = await send(command, command === 'step' ? undefined : parsed.bytes);
    setSnapshot(value);
    setStatus(value.reachedWin ? 'Program mencapai fungsi win.' : command === 'step' ? 'Satu instruksi selesai.' : 'Program berhenti tanpa mencapai win.');
  }

  async function revealHint() {
    if (authenticated) await fetch(`/api/levels/${levelId}/hint`, { method: 'POST' });
    setRevealed((count) => Math.min(count + 1, hints.length));
  }

  async function submit() {
    if (!authenticated) { window.location.href = `/auth/github?next=${encodeURIComponent(window.location.pathname)}`; return; }
    setStatus('Memverifikasi payload di server…');
    const response = await fetch(`/api/levels/${levelId}/submit`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ payload: Array.from(parsed.bytes) }),
    });
    const body = await response.json() as { data?: { flag: string }; error?: { message: string } };
    if (!response.ok) { setStatus(body.error?.message ?? 'Payload ditolak.'); return; }
    setFlag(body.data!.flag); setStatus('Selesai. Flag dan poin sudah disimpan.');
  }

  return <section className="overflow-hidden rounded-base border border-border bg-bg pb-24 lg:pb-0" aria-label="Workspace challenge">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface px-4 py-3">
      <div className="grid w-full grid-cols-2 gap-1 sm:flex sm:w-auto" role="tablist" aria-label="Panel workspace">
        {tabs.map((tab, index) => <button key={tab} id={`debug-tab-${tab}`} type="button" role="tab" aria-controls="debug-panel" tabIndex={active === tab ? 0 : -1} aria-selected={active === tab} onClick={() => setActive(tab)} onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
          setActive(tabs[next]);
          document.getElementById(`debug-tab-${tabs[next]}`)?.focus();
        }} className={`min-h-11 rounded-base px-3 py-2 text-sm ${active === tab ? 'bg-bg font-medium text-fg' : 'text-muted hover:text-fg'}`}>{tab}</button>)}
      </div>
      <span className="text-sm text-muted" aria-live="polite">{status}</span>
    </div>
    <div id="debug-panel" role="tabpanel" aria-labelledby={`debug-tab-${active}`} tabIndex={0} className="h-64 overflow-auto overscroll-contain p-2 font-mono text-sm sm:h-[22rem] sm:p-4">
      {active === 'Disassembly' && (instructions.length ? <table className="w-full border-collapse"><tbody>{instructions.map(([address, instruction]) => <tr key={address} className={snapshot?.registers.eip === address ? 'bg-accent/5 text-accent' : ''}><td className="w-32 border-l-2 border-transparent px-3 py-2 text-muted">0x{address.toString(16)}</td><td className="px-3 py-2">{instruction}</td></tr>)}</tbody></table> : <p className="text-muted">Memuat Capstone…</p>)}
      {active === 'Stack' && <table className="w-full border-collapse"><tbody>{(snapshot?.stack ?? []).map((row) => <tr key={row.address} className={row.role === 'return address' ? 'bg-accent/5' : ''}><td className="border-b border-border px-3 py-2 text-muted">0x{row.address.toString(16)}</td><td className="border-b border-border px-3 py-2">{row.bytes}</td><td className="border-b border-border px-3 py-2 text-muted">{row.role}</td></tr>)}</tbody></table>}
      {active === 'Registers' && <dl className="grid grid-cols-2 gap-px overflow-hidden border border-border bg-border sm:grid-cols-4">{Object.entries(snapshot?.registers ?? {}).map(([name, value]) => <div key={name} className="bg-bg p-3"><dt className="text-muted">{name}</dt><dd className="mt-1">0x{value.toString(16).padStart(8, '0')}</dd></div>)}</dl>}
      {active === 'Source' && <pre className="whitespace-pre-wrap leading-6">{source}</pre>}
    </div>
    <div className="border-t border-border p-4">
      <label htmlFor="payload" className="text-sm font-medium">Payload</label>
      <textarea id="payload" value={expression} onChange={(event) => setExpression(event.target.value)} spellCheck={false} autoCapitalize="off" autoCorrect="off" className="mt-2 min-h-28 w-full resize-y rounded-base border border-border bg-surface p-3 font-mono text-base leading-6 sm:text-sm" />
      {parsed.error ? <p className="mt-2 text-sm text-danger">{parsed.error}</p> : <p className="mt-2 break-all font-mono text-xs leading-5 text-muted">{parsed.bytes.length} byte · {toHex(parsed.bytes)}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" disabled={!snapshot || !!parsed.error} onClick={() => execute('step')} className="min-h-11 rounded-base border border-border px-4 py-2.5 text-sm font-medium hover:bg-surface disabled:opacity-50">Step</button>
        <button type="button" disabled={!snapshot || !!parsed.error} onClick={() => execute('continue')} className="min-h-11 rounded-base border border-border px-4 py-2.5 text-sm font-medium hover:bg-surface disabled:opacity-50">Continue</button>
      </div>
      <div className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-2 gap-3 border-t border-border bg-bg px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:static lg:mt-4 lg:flex lg:border-0 lg:p-0">
        <button type="button" disabled={!snapshot || !!parsed.error} onClick={() => execute('run')} className="min-h-12 rounded-base bg-accent px-4 py-2.5 text-sm font-medium text-bg disabled:opacity-50">Jalankan</button>
        <button type="button" disabled={!snapshot || !!parsed.error} onClick={submit} className="min-h-12 rounded-base border border-accent px-4 py-2.5 text-sm font-medium text-accent hover:bg-accent/5 disabled:opacity-50 lg:ml-auto">Kirim jawaban</button>
      </div>
      <div className="mt-5 border-t border-border pt-4">
        {revealed < hints.length && <button type="button" onClick={revealHint} className="min-h-11 py-2 text-sm text-accent underline underline-offset-4">Buka hint {revealed + 1}</button>}
        {hints.slice(0, revealed).map((hint, index) => <p key={hint} className="mt-3 text-sm leading-6 text-muted"><span className="text-fg">Hint {index + 1}:</span> {hint}</p>)}
      </div>
      {snapshot?.stdout && <pre className="mt-4 overflow-x-auto rounded-base bg-surface p-3 font-mono text-sm" aria-label="Output terminal">{snapshot.stdout}</pre>}
      {flag && <p className="mt-4 break-all rounded-base border border-success/30 bg-success/5 p-3 font-mono text-sm text-success">{flag}</p>}
    </div>
  </section>;
}
