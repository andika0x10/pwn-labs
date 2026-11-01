export type EmulatorCommand = 'load' | 'run' | 'step' | 'continue';
export interface EmulatorRequest { id: number; command: EmulatorCommand; payload?: number[] }
export interface RegisterSnapshot { eax: number; ebx: number; ecx: number; edx: number; esp: number; ebp: number; eip: number }
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
