ENTRY(_start)
SECTIONS {
 . = 0x08048000;
 .text : { *(.text*) *(.rodata*) }
 /DISCARD/ : { *(.comment) *(.note*) *(.eh_frame*) }
}
