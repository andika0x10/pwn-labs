// Runtime bersama untuk browser, Node, dan Cloudflare. Tidak mengandung solution.
export const BASE = 0x08048000;
export const STACK_TOP = 0xbffff000;
export const STACK_SIZE = 0x10000;
export const MAX_INSNS = 100_000;

export function createRunner(uc, challenge) {
  const e = new uc.Unicorn(uc.ARCH_X86, uc.MODE_32);
  e.mem_map(BASE, 0x1000, uc.PROT_READ | uc.PROT_EXEC);
  e.mem_map(STACK_TOP - STACK_SIZE, STACK_SIZE, uc.PROT_READ | uc.PROT_WRITE);
  // Kode read-only ditulis sekali; cache translasi Unicorn dapat dipakai ulang.
  e.mem_write(BASE, Uint8Array.from(challenge.blob));
  const zeroStack = new Uint8Array(STACK_SIZE);
  const names = ['EAX', 'EBX', 'ECX', 'EDX', 'ESI', 'EDI', 'ESP', 'EBP', 'EIP'];
  let payload, position, output, reason, frame;
  e.hook_add(uc.HOOK_INTR, (_handle, number) => {
    if (number !== 0x80) { reason = 'bad-interrupt'; e.emu_stop(); return; }
    const [eax, ebx, ecx, edx] = names.slice(0, 4).map((name) => e.reg_read_i32(uc['X86_REG_' + name]) >>> 0);
    if (eax === 3 && ebx === 0) {
      const count = Math.min(edx, payload.length - position, 4096);
      frame = { buffer: ecx, ebp: e.reg_read_i32(uc.X86_REG_EBP) >>> 0 };
      if (count && (ecx < STACK_TOP - STACK_SIZE || ecx > STACK_TOP - count)) {
        reason = 'bad-read-address'; e.emu_stop(); return;
      }
      if (count) e.mem_write(ecx, payload.subarray(position, position + count));
      position += count;
      e.reg_write_i32(uc.X86_REG_EAX, count);
    } else if (eax === 4 && (ebx === 1 || ebx === 2) && edx <= 4096 && output.length + edx <= 8192) {
      output.push(...e.mem_read(ecx, edx));
      e.reg_write_i32(uc.X86_REG_EAX, edx);
    } else if (eax === 1) {
      reason = 'exit'; e.emu_stop();
    } else { reason = 'bad-syscall'; e.emu_stop(); }
  }, 0, 1, 0);
  function snapshot(includeMemory = true) {
    const registers = Object.fromEntries(names.map((name) => [name.toLowerCase(), e.reg_read_i32(uc['X86_REG_' + name]) >>> 0]));
    const stdout = new TextDecoder().decode(Uint8Array.from(output));
    const success = challenge.success;
    const reachedWin = success.type === 'output-contains'
      ? stdout.includes(success.value)
      : registers.eip === challenge.symbols[success.symbol];
    const stack = [];
    if (includeMemory && frame && frame.buffer >= STACK_TOP - STACK_SIZE && frame.buffer < STACK_TOP) {
      // EBP dapat dikendalikan payload; batasi pembacaan ke stack dan maksimal 256 byte.
      const end = Math.min(STACK_TOP, frame.buffer + 256, Math.max(frame.buffer + 96, frame.ebp + 24));
      for (let address = frame.buffer; address < end; address += 4) {
        stack.push({
          address,
          bytes: Array.from(e.mem_read(address, Math.min(4, end - address)), (byte) => byte.toString(16).padStart(2, '0')).join(' '),
          role: address === frame.buffer ? 'buffer' : address === frame.ebp ? 'saved EBP' : address === frame.ebp + 4 ? 'return address' : '',
        });
      }
    }
    return { registers, stdout, reachedWin, reason, eip: '0x' + registers.eip.toString(16), stack };
  }
  function reset() {
    payload = new Uint8Array(); position = 0; output = []; reason = 'ready'; frame = undefined;
    e.mem_write(STACK_TOP - STACK_SIZE, zeroStack);
    for (const name of names) e.reg_write_i32(uc['X86_REG_' + name], 0);
    e.reg_write_i32(uc.X86_REG_EFLAGS, 2);
    e.reg_write_i32(uc.X86_REG_ESP, STACK_TOP - 0x100);
    e.reg_write_i32(uc.X86_REG_EIP, challenge.symbols._start);
  }
  reset();
  return {
    initial: () => snapshot(),
    run(bytes, { includeMemory = true } = {}) {
      reset(); payload = bytes; reason = 'limit-or-halt';
      try {
        const until = challenge.success.type === 'eip-reaches' ? challenge.symbols[challenge.success.symbol] : BASE + challenge.blob.length;
        e.emu_start(challenge.symbols._start, until, 0, MAX_INSNS);
      } catch (error) { reason = 'fault:' + (error?.message ?? error); }
      return snapshot(includeMemory);
    },
    close: () => e.close(),
  };
}
