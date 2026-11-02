/* Representasi konsep C, bukan source hasil kompilasi.
 * Binary sebenarnya dibangun dari challenge.S (GNU x86-32).
 * Layout frame ditetapkan assembly; compiler C bebas memilih layout berbeda.
 * read/write/exit disediakan emulator melalui int 0x80.
 */
void win(unsigned int first, unsigned int second) {
  if (first != 0x13579bdf || second != 0x2468ace0) exit(1);
  write(1, "STACK_ARGUMENTS_OK\n", 19);
  exit(0);
}
void vuln(void) {
  char buffer[80]; /* tepat di bawah saved EBP pada assembly ini */
  read(0, buffer, 256); /* overflow sampai alamat kembali */
}
void _start(void) {
  vuln();
  exit(1);
}
