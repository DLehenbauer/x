#ifndef PWM1_H_
#define PWM1_H_

class Pwm1 final {
  private:
    uint16_t out;
  
  public:
    void setup() {
      // Setup Timer1 for PWM
      TCCR1A = _BV(COM1A1) | _BV(COM1B1) | _BV(WGM11);    // Toggle OC1A/OC1B on Compare Match, Fast PWM (non-inverting)
      TCCR1B = _BV(WGM13) | _BV(WGM12) | _BV(CS10);       // Fast PWM, Top ICR1H/L, Prescale None
      ICR1H = 0;
      ICR1L = 0xFF;                                       // Top = 255 (8-bit PWM per output), 62.5khz carrier frequency
      DDRB |= _BV(DDB1) | _BV(DDB2);                      // Output PWM to DDB1 / DDB2
    }

    void begin() {
      OCR1B = out >> 8;      OCR1A = out & 0xFF;
    }
  
    void set(uint16_t value) {
      out = value;
    }
  
    void sendHiByte() { }
    void sendLoByte() { }
    void end() { }
};

#endif /* PWM1_H_ */