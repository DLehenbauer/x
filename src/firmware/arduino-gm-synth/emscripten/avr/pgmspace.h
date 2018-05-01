#ifndef PGMSPACE_H_
#define PGMSPACE_H_

#include <stdint.h>
#include <string.h>

#define PROGMEM

uint8_t pgm_read_byte(const volatile void* ptr);
uint16_t pgm_read_word(const volatile void* ptr);

#define memcpy_P memcpy

#endif /* PGMSPACE_H_ */