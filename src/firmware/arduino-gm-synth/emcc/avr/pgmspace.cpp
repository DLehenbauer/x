/*
 * pgmspace.cpp
 *
 * Created: 2/10/2018 6:39:53 PM
 *  Author: danlehen
 */ 

#include "pgmspace.h"

uint8_t TIMSK2;
void cli() {};
void sei() {};

uint8_t pgm_read_byte(const volatile int8_t* ptr) { return *ptr; }
uint16_t pgm_read_word(const volatile uint16_t* ptr) { return *ptr; }
