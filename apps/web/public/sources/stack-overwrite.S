# Sumber binary sebenarnya: GNU assembler, sintaks Intel, x86-32.
.intel_syntax noprefix
.section .text
.global _start, vuln, win
_start:
  call vuln
failure:
  mov eax, 1
  mov ebx, 1
  int 0x80

vuln:
  push ebp
  mov ebp, esp
  sub esp, 28
  mov DWORD PTR [ebp-4], 0
  mov eax, 3
  xor ebx, ebx
  lea ecx, [ebp-28]
  mov edx, 28
  int 0x80
  cmp DWORD PTR [ebp-4], 0
  je failure
  jmp win
  leave
  ret

win:
  mov eax, 4
  mov ebx, 1
  mov ecx, OFFSET FLAT:message
  mov edx, message_end-message
  int 0x80
  mov eax, 1
  xor ebx, ebx
  int 0x80
message:
  .ascii "STACK_STATUS_OK\n"
message_end:
