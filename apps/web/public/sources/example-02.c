/* Fixture edukasi freestanding. Runtime menyediakan read/write/exit melalui int 0x80. */
void win(void) { /* menulis WIN\n lalu keluar */ }
void vuln(void) { char buffer[64]; /* read(0, buffer, 256) sengaja overflow */ }
void _start(void) { vuln(); }
