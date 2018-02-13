/*
 * pgmspace.h
 *
 * Created: 2/10/20116 3:39:52 PM
 *  Author: danlehen
 */ 


#ifndef PGMSPACE_H_
#define PGMSPACE_H_

#include <stdint.h>
#include <string.h>

#define PROGMEM

uint8_t pgm_read_byte(const volatile int8_t* ptr);
uint16_t pgm_read_word(const volatile uint16_t* ptr);

#define memcpy_P memcpy

#endif /* PGMSPACE_H_ */