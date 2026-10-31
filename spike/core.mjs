// Inti spike: dipakai Node, Web Worker browser, dan Cloudflare Worker.
// Menerima module `uc` (hasil MUnicorn()) supaya pemuatan WASM bisa beda per lingkungan.

export const BASE = 0x08048000;
export const STACK_TOP = 0xbffff000;
export const STACK_SIZE = 0x10000;
export const MAX_INSNS = 100_000;

// Blob x86-32 buatan tangan: _start -> vuln() (read 0x100 byte ke buffer 0x40) ; win() mencetak "WIN\n".
export function buildBlob() {
  const code = [];
  const emit = (...b) => code.push(...b);
  const imm32 = (v) => [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255];
  // _start: call vuln ; mov eax,1 ; mov ebx,1 ; int 0x80
  emit(0xe8, 0, 0, 0, 0); // call rel32 (patch)
  emit(0xb8, ...imm32(1), 0xbb, ...imm32(1), 0xcd, 0x80);
  const vuln = code.length;
  code.splice(1, 4, ...imm32(vuln - 5));
  emit(0x55, 0x89, 0xe5, 0x83, 0xec, 0x40); // push ebp; mov ebp,esp; sub esp,0x40
  emit(0xb8, ...imm32(3), 0xbb, ...imm32(0)); // mov eax,3 ; mov ebx,0
  emit(0x8d, 0x4d, 0xc0); // lea ecx,[ebp-0x40]
  emit(0xba, ...imm32(0x100), 0xcd, 0x80); // mov edx,0x100 ; int 0x80
  emit(0xc9, 0xc3); // leave ; ret
  const win = code.length;
  const msgOff = win + 5 + 5 + 5 + 5 + 2 + 5 + 5 + 2;
  emit(0xb8, ...imm32(4), 0xbb, ...imm32(1)); // write(1,
  emit(0xb9, ...imm32(BASE + msgOff), 0xba, ...imm32(4), 0xcd, 0x80);
  emit(0xb8, ...imm32(1), 0xbb, ...imm32(0), 0xcd, 0x80); // exit(0)
  emit(...new TextEncoder().encode("WIN\n"));
  return { blob: Uint8Array.from(code), symbols: { _start: BASE, vuln: BASE + vuln, win: BASE + win } };
}

// Payload: 64 byte buffer + 4 byte saved ebp + return address = win.
export function buildPayload(winAddr) {
  const p = new Uint8Array(64 + 4 + 4);
  p.fill(0x41, 0, 68);
  new DataView(p.buffer).setUint32(68, winAddr, true);
  return p;
}

// Varian hemat CPU untuk Worker: satu instance Unicorn dipakai ulang, tanpa hook per instruksi
// (batas instruksi lewat argumen count emu_start). State di-reset penuh sebelum tiap run.
export function createRunner(uc, { blob, symbols }, { maxInsns = MAX_INSNS } = {}) {
  const e = new uc.Unicorn(uc.ARCH_X86, uc.MODE_32);
  e.mem_map(BASE, 0x1000, uc.PROT_ALL);
  e.mem_map(STACK_TOP - STACK_SIZE, STACK_SIZE, uc.PROT_ALL);
  const zeroPage = new Uint8Array(0x1000);
  const zeroStack = new Uint8Array(STACK_SIZE);
  const regs = ["EAX", "EBX", "ECX", "EDX", "ESI", "EDI", "EBP"].map((r) => uc["X86_REG_" + r]);
  let payload = new Uint8Array(0);
  let readPos = 0;
  let out = [];
  let reason = "halt";
  e.hook_add(uc.HOOK_INTR, (_h, intno) => {
    if (intno !== 0x80) return;
    const eax = e.reg_read_i32(uc.X86_REG_EAX) >>> 0;
    const ebx = e.reg_read_i32(uc.X86_REG_EBX) >>> 0;
    const ecx = e.reg_read_i32(uc.X86_REG_ECX) >>> 0;
    const edx = e.reg_read_i32(uc.X86_REG_EDX) >>> 0;
    if (eax === 3 && ebx === 0) {
      const n = Math.min(edx, payload.length - readPos);
      if (n > 0) e.mem_write(ecx, payload.subarray(readPos, readPos + n));
      readPos += n;
      e.reg_write_i32(uc.X86_REG_EAX, n);
    } else if (eax === 4 && (ebx === 1 || ebx === 2)) {
      out.push(...e.mem_read(ecx, edx));
      e.reg_write_i32(uc.X86_REG_EAX, edx);
    } else if (eax === 1) {
      reason = "exit";
      e.emu_stop();
    } else {
      reason = "bad-syscall";
      e.emu_stop();
    }
  }, 0, 1, 0);
  return {
    run(p) {
      payload = p;
      readPos = 0;
      out = [];
      reason = "halt";
      e.mem_write(BASE, zeroPage);
      e.mem_write(BASE, blob);
      e.mem_write(STACK_TOP - STACK_SIZE, zeroStack);
      for (const r of regs) e.reg_write_i32(r, 0);
      e.reg_write_i32(uc.X86_REG_ESP, STACK_TOP - 0x100);
      try {
        e.emu_start(BASE, BASE + blob.length, 0, maxInsns);
      } catch (err) {
        reason = "fault:" + (err?.message ?? err);
      }
      const stdout = new TextDecoder().decode(Uint8Array.from(out));
      return {
        reason,
        eip: "0x" + (e.reg_read_i32(uc.X86_REG_EIP) >>> 0).toString(16),
        reachedWin: stdout === "WIN\n",
        stdout,
      };
    },
  };
}

export function runBlob(uc, { blob, symbols }, payload, { maxInsns = MAX_INSNS } = {}) {
  const e = new uc.Unicorn(uc.ARCH_X86, uc.MODE_32);
  const out = [];
  let insns = 0;
  let reason = "halt";
  let readPos = 0;
  try {
    e.mem_map(BASE, 0x1000, uc.PROT_ALL);
    e.mem_write(BASE, blob);
    e.mem_map(STACK_TOP - STACK_SIZE, STACK_SIZE, uc.PROT_ALL);
    e.reg_write_i32(uc.X86_REG_ESP, STACK_TOP - 0x100);
    e.reg_write_i32(uc.X86_REG_EBP, 0);

    e.hook_add(uc.HOOK_CODE, () => {
      if (++insns >= maxInsns) {
        reason = "max-insns";
        e.emu_stop();
      }
    }, 0, 1, 0);

    e.hook_add(uc.HOOK_INTR, (_h, intno) => {
      if (intno !== 0x80) return;
      const eax = e.reg_read_i32(uc.X86_REG_EAX) >>> 0;
      const ebx = e.reg_read_i32(uc.X86_REG_EBX) >>> 0;
      const ecx = e.reg_read_i32(uc.X86_REG_ECX) >>> 0;
      const edx = e.reg_read_i32(uc.X86_REG_EDX) >>> 0;
      if (eax === 3 && ebx === 0) {
        const n = Math.min(edx, payload.length - readPos);
        if (n > 0) e.mem_write(ecx, payload.subarray(readPos, readPos + n));
        readPos += n;
        e.reg_write_i32(uc.X86_REG_EAX, n);
      } else if (eax === 4 && (ebx === 1 || ebx === 2)) {
        out.push(...e.mem_read(ecx, edx));
        e.reg_write_i32(uc.X86_REG_EAX, edx);
      } else if (eax === 1) {
        reason = "exit";
        e.emu_stop();
      } else {
        reason = "bad-syscall";
        e.emu_stop();
      }
    }, 0, 1, 0);

    try {
      e.emu_start(BASE, BASE + blob.length, 0, 0);
    } catch (err) {
      reason = "fault:" + (err?.message ?? err);
    }
    const eip = e.reg_read_i32(uc.X86_REG_EIP) >>> 0;
    const stdout = new TextDecoder().decode(Uint8Array.from(out));
    return {
      reason,
      insns,
      eip: "0x" + eip.toString(16),
      reachedWin: stdout === "WIN\n",
      stdout,
    };
  } finally {
    e.close();
  }
}
