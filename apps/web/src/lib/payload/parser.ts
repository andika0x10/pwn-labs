export class PayloadSyntaxError extends Error {
  constructor(message: string, public position: number) {
    super(`${message} pada kolom ${position + 1}`);
    this.name = 'PayloadSyntaxError';
  }
}

const encoder = new TextEncoder();
const MAX_PAYLOAD = 4096;

function concat(left: Uint8Array, right: Uint8Array) {
  if (left.length + right.length > MAX_PAYLOAD) throw new PayloadSyntaxError('Payload melebihi 4 KiB', 0);
  const output = new Uint8Array(left.length + right.length);
  output.set(left);
  output.set(right, left.length);
  return output;
}

function cyclic(length: number) {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz';
  let value = '';
  outer: for (const a of alphabet) for (const b of alphabet) for (const c of alphabet) {
    for (const char of [a, b, c]) { value += char; if (value.length >= length) break outer; }
  }
  return encoder.encode(value);
}

export function parsePayload(input: string, symbols: Record<string, Uint8Array> = {}) {
  let position = 0;
  const skip = () => { while (/\s/.test(input[position] ?? '')) position++; };
  const error = (message: string): never => { throw new PayloadSyntaxError(message, position); };
  const number = () => {
    skip();
    const match = input.slice(position).match(/^(?:0x[0-9a-fA-F]+|\d+)/);
    if (!match) return error('Angka diharapkan');
    const token = match[0]!;
    position += token.length;
    return Number.parseInt(token, token.startsWith('0x') ? 16 : 10);
  };
  const bytes = (width: number, value: number) => {
    const output = new Uint8Array(width);
    const view = new DataView(output.buffer);
    if (width === 4) view.setUint32(0, value >>> 0, true);
    else view.setBigUint64(0, BigInt(value), true);
    return output;
  };
  const string = () => {
    const quote = input[position++];
    const output = [];
    while (position < input.length && input[position] !== quote) {
      if (input[position] === '\\') {
        position++;
        const escape = input[position++];
        if (escape === 'x') {
          const hex = input.slice(position, position + 2);
          if (!/^[0-9a-fA-F]{2}$/.test(hex)) error('Escape hex tidak valid');
          output.push(Number.parseInt(hex, 16)); position += 2;
        } else output.push({ n: 10, r: 13, t: 9, '\\': 92, '"': 34, "'": 39 }[escape] ?? escape.charCodeAt(0));
      } else output.push(input.charCodeAt(position++));
    }
    if (input[position] !== quote) error('String belum ditutup');
    position++;
    return Uint8Array.from(output);
  };
  const primary = (): Uint8Array => {
    skip();
    if (input[position] === 'b' && ['"', "'"].includes(input[position + 1])) position++;
    if (['"', "'"].includes(input[position])) return string();
    const ident = input.slice(position).match(/^[a-zA-Z_][a-zA-Z0-9_]*/)?.[0];
    if (!ident) return error('Literal atau fungsi diharapkan');
    position += ident.length; skip();
    if (input[position] !== '(') {
      if (ident === 'nop') return Uint8Array.of(0x90);
      if (symbols[ident]) return symbols[ident]!;
      return error(`Simbol ${ident} tidak dikenal`);
    }
    position++; const value = number(); skip();
    if (input[position++] !== ')') error('Tanda ) diharapkan');
    if (ident === 'p32') return bytes(4, value);
    if (ident === 'p64') return bytes(8, value);
    if (ident === 'cyclic') return cyclic(value);
    if (ident === 'cyclic_find') return bytes(4, Math.max(0, new TextDecoder().decode(cyclic(MAX_PAYLOAD)).indexOf(new TextDecoder().decode(bytes(4, value)))));
    return error(`Fungsi ${ident} tidak dikenal`);
  };
  const product = () => {
    let value = primary(); skip();
    while (input[position] === '*') {
      position++; const count = number();
      if (!Number.isInteger(count) || count < 0 || value.length * count > MAX_PAYLOAD) error('Ukuran pengulangan tidak valid');
      const repeated = new Uint8Array(value.length * count);
      for (let i = 0; i < count; i++) repeated.set(value, i * value.length);
      value = repeated; skip();
    }
    return value;
  };
  let value = product(); skip();
  while (input[position] === '+') { position++; value = concat(value, product()); skip(); }
  if (position !== input.length) error('Token tidak dikenal');
  return value;
}

export function toHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(' ');
}
