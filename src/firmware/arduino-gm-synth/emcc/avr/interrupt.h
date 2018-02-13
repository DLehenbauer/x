/*
 * interrupt.h
 *
 * Created: 2/10/2018 3:39:31 PM
 *  Author: danlehen
 */ 


#ifndef INTERRUPT_H_
#define INTERRUPT_H_

#include <stdint.h>

void cli();
void sei();

extern uint8_t TIMSK1;
#define TOIE1 0
#define OCIE1A 1
#define OCIE1B 2
#define ICIE1 5

extern uint8_t TIMSK2;
#define OCIE2A 1

#define SIGNAL(vector) \
void vector()

#define ISR(vector) \
void vector()

#endif /* INTERRUPT_H_ */