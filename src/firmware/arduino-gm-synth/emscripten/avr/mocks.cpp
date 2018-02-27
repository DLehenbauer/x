/*
 * pgmspace.cpp
 *
 * Created: 2/10/2018 6:39:53 PM
 *  Author: danlehen
 */ 

#include "common.h"
#include "pgmspace.h"

uint8_t DDRB;
uint8_t DDRD;
uint8_t OCR2A;
uint8_t PORTD;
uint8_t SPCR;
uint8_t TCCR2A;
uint8_t TCCR2B;
uint8_t UBRR0H;
uint8_t UBRR0L;
uint8_t UCSR0B;
uint8_t UCSR0C;

uint8_t PORTB;
uint8_t SPDR;
uint8_t SPSR = 1 << SPIF;
uint8_t TIMSK2;

void cli() {}
void sei() {}

uint8_t pgm_read_byte(const volatile void* ptr) { return *(reinterpret_cast<const volatile uint8_t*>(ptr)); }
uint16_t pgm_read_word(const volatile void* ptr) { return *(reinterpret_cast<const volatile uint16_t*>(ptr)); }
