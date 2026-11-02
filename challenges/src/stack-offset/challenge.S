# Sumber binary sebenarnya: GNU assembler, sintaks Intel, x86-32.
.intel_syntax noprefix
.section .text
.global _start, vuln, target
_start:
  call vuln
failure:
  mov eax, 1
  mov ebx, 1
  int 0x80

vuln:
  push ebp
  mov ebp, esp
  sub esp, 40
  mov eax, 3
  xor ebx, ebx
  lea ecx, [ebp-40]
  mov edx, 256
  int 0x80
  leave
  ret
  .fill 3, 1, 0x90

target:
  mov eax, 4
  mov ebx, 1
  mov ecx, OFFSET FLAT:message
  mov edx, message_end-message
  int 0x80
  mov eax, 1
  xor ebx, ebx
  int 0x80
message:
  .ascii "STACK_OFFSET_OK\n"
message_end:
