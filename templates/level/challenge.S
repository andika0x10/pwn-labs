# Template GNU assembler x86-32. Isi kerentanan, penanda sukses, dan simbol.
.intel_syntax noprefix
.section .text
.global _start, win
_start:
  mov eax, 1
  mov ebx, 1
  int 0x80
win:
  # TODO: tulis penanda sukses via syscall write sebelum exit.
  mov eax, 1
  xor ebx, ebx
  int 0x80
