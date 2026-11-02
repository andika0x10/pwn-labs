import { useEffect, useMemo, useRef, useState } from 'react';
import { parsePayload, PayloadSyntaxError, toHex } from '../lib/payload/parser';
import type { ChallengeConfig, EmulatorRequest, EmulatorResponse, EmulatorSnapshot } from '../lib/emulator/types';

interface Props {
  levelId: string;
  source: string;
  challenge: ChallengeConfig;
  authenticated: boolean;
  hints: string[];
  nextLevel?: { href: string; title: string };
}

const tabs = [
  { id: 'source', label: 'Kode sumber', description: 'Representasi konsep C. Cari batas masukan dan kondisi sukses; layout sebenarnya mengikuti assembly latihan.' },
  { id: 'disassembly', label: 'Instruksi mesin', description: 'Bentuk instruksi yang dibaca CPU, beserta alamatnya dalam bilangan heksadesimal.' },
  { id: 'stack', label: 'Memori stack', description: 'Isi memori stack aktual sesudah uji terakhir, termasuk ketika program crash. Byte diurutkan dari alamat rendah ke tinggi.' },
  { id: 'registers', label: 'Register CPU', description: 'Nilai register CPU aktual sesudah uji terakhir. EIP menunjukkan posisi eksekusi atau alamat tujuan ketika program crash.' },
] as const;
const steps = ['Pahami', 'Susun', 'Uji', 'Kirim'];

export default function Workspace({ levelId, source, challenge, authenticated, hints, nextLevel }: Props) {
  const worker = useRef<Worker | undefined>(undefined);
  const sequence = useRef(0);
  const revision = useRef(0);
  const operation = useRef(false);
  const hintOperation = useRef(false);
  const pending = useRef(new Map<number, { resolve: (value: EmulatorSnapshot) => void; reject: (error: Error) => void }>());
  const [expression, setExpression] = useState('"A" * 8');
  const [snapshot, setSnapshot] = useState<EmulatorSnapshot>();
  const [active, setActive] = useState<(typeof tabs)[number]['id']>('source');
  const [step, setStep] = useState(0);
  const [status, setStatus] = useState('Emulator sedang dimuat…');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [testedRevision, setTestedRevision] = useState<number>();
  const [revealed, setRevealed] = useState(0);
  const [hintBusy, setHintBusy] = useState(false);
  const [hintError, setHintError] = useState('');
  const [flag, setFlag] = useState('');
  const [instructions, setInstructions] = useState<Array<[number, string]>>([]);
  const [instructionError, setInstructionError] = useState('');
  const draftKey = `pwn-labs:payload:${levelId}`;

  const parsed = useMemo(() => {
    try { return { bytes: parsePayload(expression), error: '' }; }
    catch (error) { return { bytes: new Uint8Array(), error: error instanceof PayloadSyntaxError ? error.message : String(error) }; }
  }, [expression]);
  const canSubmit = testedRevision !== undefined && testedRevision === revision.current && !parsed.error;

  const send = (command: EmulatorRequest['command'], payload?: Uint8Array) => new Promise<EmulatorSnapshot>((resolve, reject) => {
    if (!worker.current) { reject(new Error('Emulator belum tersedia. Muat ulang halaman.')); return; }
    const id = ++sequence.current;
    const timer = window.setTimeout(() => {
      pending.current.delete(id);
      reject(new Error('Emulator tidak merespons. Muat ulang halaman lalu uji kembali.'));
    }, 30_000);
    pending.current.set(id, {
      resolve: (value) => { window.clearTimeout(timer); resolve(value); },
      reject: (error) => { window.clearTimeout(timer); reject(error); },
    });
    worker.current.postMessage({ id, command, payload: payload ? Array.from(payload) : undefined, challenge: command === 'load' ? challenge : undefined } satisfies EmulatorRequest);
  });

  useEffect(() => {
    try {
      const draft = sessionStorage.getItem(draftKey);
      if (draft !== null) { revision.current++; setExpression(draft); }
    } catch { /* Editor tetap tersedia saat penyimpanan browser dibatasi. */ }
    const instance = new Worker('/emulator/worker.js');
    worker.current = instance;
    let disposed = false;
    instance.onerror = () => {
      const error = new Error('Emulator gagal dimuat. Periksa koneksi lalu muat ulang halaman.');
      setReady(false);
      setStatus(error.message);
      for (const request of pending.current.values()) request.reject(error);
      pending.current.clear();
    };
    instance.onmessage = (event: MessageEvent<EmulatorResponse>) => {
      const response = event.data;
      const request = pending.current.get(response.id);
      if (response.ok) request?.resolve(response.data);
      else request?.reject(new Error(response.error.message));
      pending.current.delete(response.id);
    };
    send('load').then((value) => {
      if (!disposed) { setSnapshot(value); setReady(true); setStatus('Siap diuji. Baca kode sumber, lalu periksa payload Anda.'); }
    }).catch((error: Error) => { if (!disposed) setStatus(error.message); });
    return () => {
      disposed = true;
      instance.terminate();
      worker.current = undefined;
      for (const request of pending.current.values()) request.reject(new Error('Workspace ditutup.'));
      pending.current.clear();
    };
  }, [draftKey]);

  useEffect(() => {
    if (active !== 'disassembly' || instructions.length) return;
    let cancelled = false;
    Promise.all([import('capstone-wasm'), fetch(challenge.binary).then((response) => {
      if (!response.ok) throw new Error('Binary tidak tersedia.');
      return response.arrayBuffer();
    })]).then(async ([capstone, binary]) => {
      await capstone.loadCapstone();
      const engine = new capstone.Capstone(capstone.Const.CS_ARCH_X86, capstone.Const.CS_MODE_32);
      try {
        const rows = engine.disasm(new Uint8Array(binary), { address: 0x08048000, count: 200 }).map((item: { address: number | bigint; mnemonic: string; opStr: string }) => [Number(item.address), `${item.mnemonic} ${item.opStr}`] as [number, string]);
        if (!cancelled) setInstructions(rows);
      } finally { engine.close(); }
    }).catch(() => {
      if (!cancelled) setInstructionError('Instruksi mesin gagal dimuat. Periksa koneksi lalu muat ulang halaman; kode sumber tetap dapat dibaca.');
    });
    return () => { cancelled = true; };
  }, [active, instructions.length, levelId, challenge.binary]);

  function changeExpression(value: string) {
    revision.current++;
    setExpression(value);
    setTestedRevision(undefined);
    setSnapshot(undefined);
    setStep(1);
    setStatus('Payload berubah. Uji kembali sebelum mengirim jawaban.');
    try { sessionStorage.setItem(draftKey, value); } catch { /* Penyimpanan bersifat opsional. */ }
  }

  async function execute() {
    if (operation.current || !ready || parsed.error) return;
    operation.current = true;
    setBusy(true);
    setTestedRevision(undefined);
    const currentRevision = revision.current;
    setStep(2);
    setStatus('Sedang menguji payload di browser…');
    try {
      const value = await send('run', parsed.bytes);
      if (revision.current !== currentRevision) return;
      setSnapshot(value);
      if (value.reachedWin) {
        setTestedRevision(currentRevision);
        setStep(3);
        setStatus('Uji berhasil: kondisi sukses terpenuhi. Kirim jawaban untuk diperiksa server dan menyimpan poin.');
      } else setStatus('Uji belum berhasil: kondisi sukses belum terpenuhi. Periksa payload atau lihat petunjuk, lalu uji kembali.');
    } catch (error) {
      if (revision.current === currentRevision) setStatus(`Uji gagal. ${error instanceof Error ? error.message : 'Coba uji kembali.'}`);
    } finally { operation.current = false; setBusy(false); }
  }

  async function revealHint() {
    if (hintOperation.current || revealed >= hints.length) return;
    hintOperation.current = true;
    setHintBusy(true);
    setHintError('');
    try {
      if (authenticated) {
        const response = await fetch(`/api/levels/${levelId}/hint`, { method: 'POST', signal: AbortSignal.timeout(15_000) });
        if (!response.ok) throw new Error('Petunjuk belum dapat dibuka. Coba kembali.');
      }
      setRevealed((count) => Math.min(count + 1, hints.length));
    } catch { setHintError('Petunjuk belum dapat dibuka. Periksa koneksi lalu coba kembali.'); }
    finally { hintOperation.current = false; setHintBusy(false); }
  }

  async function submit() {
    if (operation.current || !canSubmit || flag) return;
    if (!authenticated) {
      try { sessionStorage.setItem(draftKey, expression); }
      catch { setStatus('Payload belum dapat disimpan di browser. Salin payload sebelum masuk, lalu izinkan penyimpanan browser dan coba kembali.'); return; }
      window.location.href = `/auth/github?next=${encodeURIComponent(window.location.pathname)}`;
      return;
    }
    operation.current = true;
    setBusy(true);
    setSubmitting(true);
    setStatus('Sedang memeriksa jawaban di server…');
    try {
      const response = await fetch(`/api/levels/${levelId}/submit`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ payload: Array.from(parsed.bytes) }), signal: AbortSignal.timeout(30_000),
      });
      const body = await response.json() as { data?: { flag: string }; error?: { message: string } };
      if (!response.ok) { setStatus(`Jawaban belum diterima. ${body.error?.message ?? 'Coba kirim kembali.'}`); return; }
      if (!body.data?.flag) throw new Error('Hasil pemeriksaan tidak lengkap.');
      setFlag(body.data.flag);
      setStatus('Jawaban diterima server. Level selesai; flag dan poin sudah disimpan.');
    } catch { setStatus('Hasil pengiriman belum dapat dikonfirmasi. Periksa koneksi lalu kirim kembali; poin tidak akan digandakan.'); }
    finally { operation.current = false; setBusy(false); setSubmitting(false); }
  }

  return <section className="overflow-hidden rounded-base border border-border bg-bg pb-24 lg:pb-0" aria-label="Workspace challenge">
    <nav aria-label="Langkah belajar" className="border-b border-border p-4">
      <ol className="grid grid-cols-4 gap-1">
        {steps.map((label, index) => <li key={label}><button type="button" aria-current={step === index ? 'step' : undefined} onClick={() => setStep(index)} className={`min-h-12 w-full rounded-base px-1 text-sm ${step === index ? 'bg-accent/5 font-semibold text-accent' : 'text-muted hover:bg-surface'}`}><span className="block text-xs" aria-hidden="true">{index + 1}</span>{label}</button></li>)}
      </ol>
      <p className="mt-3 text-sm leading-6 text-muted">{[
        'Mulai dari kode sumber. Temukan fungsi win dan tempat program menerima masukan.',
        'Susun payload: data masukan yang Anda buat untuk mengubah perilaku program.',
        'Pilih Uji payload untuk menjalankan masukan di browser dan melihat hasilnya.',
        flag ? 'Jawaban sudah diterima. Anda dapat melanjutkan ke level berikutnya.' : 'Setelah uji berhasil, kirim payload yang sama. Server akan memeriksa jawaban dan menyimpan poin.',
      ][step]}</p>
    </nav>
    <div className="border-b border-border bg-surface p-3">
      <div className="grid grid-cols-2 gap-1" role="tablist" aria-label="Panel workspace">
        {tabs.map((tab, index) => <button key={tab.id} id={`debug-tab-${tab.id}`} type="button" role="tab" aria-controls="debug-panel" tabIndex={active === tab.id ? 0 : -1} aria-selected={active === tab.id} onClick={() => setActive(tab.id)} onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
          setActive(tabs[next].id);
          document.getElementById(`debug-tab-${tabs[next].id}`)?.focus();
        }} className={`min-h-11 rounded-base px-2 py-2 text-sm ${active === tab.id ? 'bg-bg font-medium text-fg' : 'text-muted hover:text-fg'}`}>{tab.label}</button>)}
      </div>
    </div>
    <div id="debug-panel" role="tabpanel" aria-labelledby={`debug-tab-${active}`} tabIndex={0} className="p-4">
      <p className="mb-4 text-sm leading-6 text-muted">{tabs.find((tab) => tab.id === active)?.description}</p>
      <div className="max-h-72 overflow-auto overscroll-contain font-mono text-sm">
        {active === 'source' && <pre className="whitespace-pre-wrap break-words leading-6">{source}</pre>}
        {active === 'disassembly' && (instructions.length ? <table className="w-full border-collapse"><tbody>{instructions.map(([address, instruction]) => <tr key={address}><td className="px-2 py-2 text-muted">0x{address.toString(16)}</td><td className="whitespace-nowrap px-2 py-2">{instruction}{address === challenge.symbols.win ? ' ; fungsi win' : ''}</td></tr>)}</tbody></table> : <p>{instructionError || 'Memuat instruksi mesin…'}</p>)}
        {active === 'stack' && <table className="w-full border-collapse"><tbody>{(snapshot?.stack ?? []).map((row) => <tr key={row.address}><td className="border-b border-border px-2 py-2 text-muted">0x{row.address.toString(16)}</td><td className="whitespace-nowrap border-b border-border px-2 py-2">{row.bytes}</td><td className="border-b border-border px-2 py-2 text-muted">{row.role === 'return address' ? 'Alamat kembali' : row.role}</td></tr>)}</tbody></table>}
        {active === 'registers' && <dl className="grid grid-cols-2 gap-px overflow-hidden border border-border bg-border sm:grid-cols-4">{Object.entries(snapshot?.registers ?? {}).map(([name, value]) => <div key={name} className="bg-bg p-2"><dt className="text-muted">{name}</dt><dd className="mt-1">0x{value.toString(16).padStart(8, '0')}</dd></div>)}</dl>}
        {(active === 'stack' || active === 'registers') && !snapshot && <p>Uji payload untuk menampilkan isi memori dan register aktual.</p>}
      </div>
    </div>
    <div className="border-t border-border p-4">
      <label htmlFor="payload" className="text-base font-semibold">Payload</label>
      <p id="payload-help" className="mt-1 text-sm leading-6 text-muted">Data masukan yang akan diterima program. Susun masukan sesuai petunjuk tantangan.</p>
      <textarea id="payload" aria-describedby="payload-help payload-feedback" aria-invalid={!!parsed.error} value={expression} disabled={submitting} onFocus={() => { if (!canSubmit) setStep(1); }} onChange={(event) => changeExpression(event.target.value)} spellCheck={false} autoCapitalize="off" autoCorrect="off" className="mt-3 min-h-28 w-full resize-y rounded-base border border-border bg-surface p-3 font-mono text-base leading-6 disabled:opacity-60 sm:text-sm" />
      <p id="payload-feedback" className={`mt-2 text-sm ${parsed.error ? 'text-danger' : 'text-muted'}`}>{parsed.error ? `Perbaiki format payload: ${parsed.error}` : `${parsed.bytes.length} byte siap diuji.`}</p>
      {!parsed.error && <details className="mt-2 text-sm text-muted"><summary className="cursor-pointer py-2">Lihat byte heksadesimal</summary><p className="mt-1 break-all font-mono text-xs leading-6">{toHex(parsed.bytes)}</p></details>}
      <div className="mt-4 border-l-2 border-accent pl-3">
        <p role="status" aria-live="polite" className="text-sm leading-6">{status}</p>
        <p id="submit-help" className="mt-2 text-sm leading-6 text-muted">{!canSubmit ? 'Kirim jawaban tersedia setelah payload ini berhasil diuji.' : 'Uji browser berhasil. Server tetap akan memeriksa jawaban Anda.'} {!authenticated && 'Masuk dengan GitHub saat mengirim. Payload disimpan di tab ini; uji ulang setelah kembali.'}</p>
      </div>
      <div className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-2 gap-3 border-t border-border bg-bg px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:static lg:mt-4 lg:border-0 lg:p-0">
        <button type="button" disabled={!ready || busy || !!parsed.error} onClick={execute} className="min-h-12 rounded-base bg-accent px-3 py-2.5 text-sm font-medium text-bg disabled:opacity-50">Uji payload</button>
        <button type="button" aria-describedby="submit-help" disabled={!canSubmit || busy || !!flag} onClick={submit} className="min-h-12 rounded-base border border-accent px-3 py-2.5 text-sm font-medium text-accent hover:bg-accent/5 disabled:opacity-50">Kirim jawaban</button>
      </div>
      <p className="mt-3 text-sm text-muted">Uji payload menjalankan masukan di browser. Kirim jawaban meminta pemeriksaan server dan menyimpan poin jika berhasil.</p>
      {snapshot?.stdout && <div className="mt-4"><h2 className="text-sm font-medium">Keluaran program</h2><pre className="mt-2 overflow-x-auto rounded-base bg-surface p-3 font-mono text-sm" aria-label="Output terminal">{snapshot.stdout}</pre></div>}
      {hints.length > 0 && <div className="mt-5 border-t border-border pt-4">
        {revealed < hints.length && <button type="button" disabled={hintBusy} onClick={revealHint} className="min-h-11 py-2 text-sm text-accent underline underline-offset-4 disabled:opacity-50">Lihat petunjuk {revealed + 1}</button>}
        {hintError && <p role="alert" className="text-sm text-danger">{hintError}</p>}
        {hints.slice(0, revealed).map((hint, index) => <p key={hint} className="mt-3 text-sm leading-6 text-muted"><span className="text-fg">Petunjuk {index + 1}:</span> {hint}</p>)}
      </div>}
      {flag && <div className="mt-4 rounded-base border border-success/30 bg-success/5 p-3"><p className="text-sm font-medium text-success">Level selesai. Ini flag bukti keberhasilan Anda:</p><p className="mt-2 break-all font-mono text-sm text-success">{flag}</p>{nextLevel && <a href={nextLevel.href} className="mt-3 inline-block py-3 text-sm text-accent underline underline-offset-4">Level berikutnya: {nextLevel.title}</a>}</div>}
    </div>
  </section>;
}
