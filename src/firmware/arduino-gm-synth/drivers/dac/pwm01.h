#ifndef PWM01_H_
#define PWM01_H_

class Pwm01 final {
  private:
    uint16_t out;
  
  public:
    void setup() {
      GTCCR = _BV(TSM) | _BV(PSRSYNC);
    
      // Setup Timer0 for PWM
      TCCR0A = _BV(COM0A1) | _BV(COM0B1) | _BV(WGM01) | _BV(WGM00);   // Fast PWM (non-inverting), Top 0xFF
      TCCR0B = _BV(CS10);												// Prescale None
      DDRD |= _BV(DDD5) | _BV(DDD6);									// Output PWM to DDD5 / DDD6
    
      // Setup Timer1 for PWM
      TCCR1A = _BV(COM1A1) | _BV(COM1B1) | _BV(WGM11);    // Toggle OC1A/OC1B on Compare Match, Fast PWM (non-inverting)
      TCCR1B = _BV(WGM13) | _BV(WGM12) | _BV(CS10);		// Fast PWM, Top ICR1H/L, Prescale None
      ICR1H = 0;
      ICR1L = 0xFF;                                       // Top = 255 (8-bit PWM per output), 62.5khz carrier frequency
      DDRB |= _BV(DDB1) | _BV(DDB2);                      // Output PWM to DDB1 / DDB2
    
      TCNT0 = 0x80;
      TCNT1H = TCNT1L = 0;
      GTCCR = 0;
    }

    void begin() {
      OCR1B = OCR0A = out >> 8;      OCR1A = OCR0B = out & 0xFF;
    }
  
    void set(uint16_t value) {
      out = value;
    }
  
    void sendHiByte() { }
    void sendLoByte() { }
    void end() { }
};

#endif /* PWM01_H_ */