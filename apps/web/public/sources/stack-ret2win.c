/* Representasi konsep C, bukan source hasil kompilasi.
 * Binary sebenarnya dibangun dari challenge.S (GNU x86-32).
 * Layout frame ditetapkan assembly; compiler C bebas memilih layout berbeda.
 * read/write/exit disediakan emulator melalui int 0x80.
 */
void win(void) {
  write(1, "STACK_RET2WIN_OK\n", 17);
  exit(0);
}
void vuln(void) {
  char buffer[56]; /* tepat di bawah saved EBP pada assembly ini */
  read(0, buffer, 256); /* overflow sampai alamat kembali */
}
void _start(void) {
  vuln();
  exit(1);
}
