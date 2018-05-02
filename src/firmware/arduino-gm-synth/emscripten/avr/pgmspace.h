#ifndef PGMSPACE_H_
#define PGMSPACE_H_

#include <stdint.h>
#include <string.h>

#define PROGMEM

uint8_t pgm_read_byte(const volatile void* ptr);
uint16_t pgm_read_word(const volatile void* ptr);

#define memcpy_P memcpy

// Note: This is not mocking an AVR type.  It's used to share regions of PROGMEM
//       space with JavaScript for live editing.
template<typename T>
struct HeapRegion {
  size_t start;
  size_t end;
  size_t itemSize;

  HeapRegion() {}
  
  HeapRegion(const T* pStart, const size_t length) {
    start = reinterpret_cast<size_t>(pStart);
    end = start + length;
    itemSize = sizeof(T);
  }
};

#endif /* PGMSPACE_H_ */