#ifndef PWM01_H_
#define PWM01_H_

/*
    Driver for 16-bit PWM on Timers 0 and 1 with digital filter at 62.5khz 
    
    Connection to Arduino Uno
    
                    1M                     10uf*
        pin 5 >----^v^v^----o--------o------|(----> audio out
                            |        |
                   3.9k     |       === 4.7uf**
        pin 6 >----^v^v^----o        |
                            |       gnd
                            |
                            |
                    1M      |
        pin 9 >----^v^v^----o
                            |
                   3.9k     |
       pin 10 >----^v^v^----'

                                                                                                         
       * Note: A/C coupling capacitor typically optional.
      ** Note: RC filtering capacitor can be adjusted to taste:
*/
class Pwm01 final {
  public:
    void setup() {
      GTCCR = _BV(TSM) | _BV(PSRSYNC);                    // Halt timers 0 and 1
    
      // Setup Timer0 for PWM
      TCCR0A = _BV(COM0A1) | _BV(COM0B1) | _BV(WGM01) | _BV(WGM00);   // Fast PWM (non-inverting), Top 0xFF
      TCCR0B = _BV(CS10);												                      // Prescale None
      DDRD |= _BV(DDD5) | _BV(DDD6);									                // Output PWM to DDD5 / DDD6
    
      // Setup Timer1 for PWM
      TCCR1A = _BV(COM1A1) | _BV(COM1B1) | _BV(WGM11);    // Toggle OC1A/OC1B on Compare Match, Fast PWM (non-inverting)
      TCCR1B = _BV(WGM13) | _BV(WGM12) | _BV(CS10);		    // Fast PWM, Top ICR1H/L, Prescale None
      ICR1H = 0;
      ICR1L = 0xFF;                                       // Top = 255 (8-bit PWM per output), 62.5khz carrier frequency
      DDRB |= _BV(DDB1) | _BV(DDB2);                      // Output PWM to DDB1 / DDB2
    
      TCNT0 = 0x80;                                       // Set timer 0 and 1 counters so that they are 180 degrees out
      TCNT1H = TCNT1L = 0;                                // of phase, cancelling the 62.5kHz carrier wave.
      
      GTCCR = 0;                                          // Resume timers
    }

    void set(uint16_t out) {
      OCR0A = out >> 8;      OCR1B = out >> 8;            // Note: Setting OCR0B prior to OCR1A will save a couple of ops with AVR8/GNU C Compiler v5.4.0.      OCR0B = out & 0xFF;
      OCR1A = out & 0xFF;
    }
  
    void sendHiByte() { /* do nothing */ }
    void sendLoByte() { /* do nothing */ }
};

#endif /* PWM01_H_ */