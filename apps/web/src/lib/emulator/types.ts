export interface ChallengeConfig {
  binary: string;
  arch: 'x86-32' | 'x86-64';
  symbols: Record<string, number>;
  success: { type: 'output-contains'; value: string } | { type: 'eip-reaches'; symbol: string };
}
export type EmulatorCommand = 'load' | 'run';
export interface EmulatorRequest { id: number; command: EmulatorCommand; payload?: number[]; challenge?: ChallengeConfig }
export interface RegisterSnapshot { eax: number; ebx: number; ecx: number; edx: number; esi: number; edi: number; esp: number; ebp: number; eip: number }
export interface StackRow { address: number; bytes: string; role: string }
export interface EmulatorSnapshot {
  reason: string;
  stdout: string;
  reachedWin?: boolean;
  eip?: string;
  registers: RegisterSnapshot;
  stack: StackRow[];
}
export type EmulatorResponse =
  | { id: number; ok: true; data: EmulatorSnapshot }
  | { id: number; ok: false; error: { code: string; message: string } };
