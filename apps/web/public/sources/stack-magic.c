/* Representasi konsep C, bukan source hasil kompilasi.
 * Binary sebenarnya dibangun dari challenge.S (GNU x86-32).
 * Layout frame ditetapkan assembly; compiler C bebas memilih layout berbeda.
 * read/write/exit disediakan emulator melalui int 0x80.
 */
void vuln(void) {
  struct {
    char buffer[36];
    unsigned int key;
  } frame;
  frame.key = 0;
  read(0, frame.buffer, 40); /* sengaja melewati buffer */
  if (frame.key == 0x6b657931) {
    write(1, "STACK_MAGIC_OK\n", 15);
    exit(0);
  }
  exit(1);
}
void _start(void) {
  vuln();
  exit(1);
}
