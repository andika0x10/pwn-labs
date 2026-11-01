type Runtime = import("@astrojs/cloudflare").Runtime;

interface Env {
	ASSETS: Fetcher;
	DB: D1Database;
	LEVEL_SESSION: DurableObjectNamespace;
	LEADERBOARD: DurableObjectNamespace;
	GITHUB_CLIENT_ID: string;
	GITHUB_CLIENT_SECRET: string;
	FLAG_SECRET: string;
}

declare namespace App {
	interface Locals extends Runtime {
		user: import('./lib/auth').PublicUser | null;
	}
}

declare module 'capstone-wasm' {
	export interface Insn { address: number | bigint; mnemonic: string; opStr: string }
	export class Capstone {
		constructor(arch: number, mode: number);
		disasm(data: Uint8Array, options?: { address?: number | bigint; count?: number }): Insn[];
		close(): void;
	}
	export const Const: { CS_ARCH_X86: number; CS_MODE_32: number };
	export function loadCapstone(args?: Record<string, unknown>): Promise<void>;
}
