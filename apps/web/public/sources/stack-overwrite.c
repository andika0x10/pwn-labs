/* Representasi konsep C, bukan source hasil kompilasi.
 * Binary sebenarnya dibangun dari challenge.S (GNU x86-32).
 * Layout frame ditetapkan assembly; compiler C bebas memilih layout berbeda.
 * read/write/exit disediakan emulator melalui int 0x80.
 */
void vuln(void) {
  struct {
    char buffer[24];
    unsigned int status;
  } frame;
  frame.status = 0;
  read(0, frame.buffer, 28); /* sengaja melewati buffer */
  if (frame.status != 0) {
    write(1, "STACK_STATUS_OK\n", 16);
    exit(0);
  }
  exit(1);
}
void _start(void) {
  vuln();
  exit(1);
}
