#ifndef PWM0_H_
#define PWM0_H_

class Pwm0 final {
  private:
    uint16_t out;
  
  public:
    void setup() {
      // Setup Timer0 for PWM
      TCCR0A = _BV(COM0A1) | _BV(COM0B1) | _BV(WGM01) | _BV(WGM00);   // Fast PWM (non-inverting), Top 0xFF
      TCCR0B = _BV(CS10);												// Prescale None
      DDRD |= _BV(DDD5) | _BV(DDD6);									// Output PWM to DDD5 / DDD6
    }

    void begin() {
      OCR0A = out >> 8;      OCR0B = out & 0xFF;
    }
  
    void set(uint16_t value) {
      out = value;
    }
  
    void sendHiByte() { }
    void sendLoByte() { }
    void end() { }
};

#endif /* PWM0_H_ */