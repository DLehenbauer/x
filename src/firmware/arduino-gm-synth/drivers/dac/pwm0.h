#ifndef PWM0_H_
#define PWM0_H_

class Pwm0 final {
	private:
	Spi<csPin> _spi;
	
	public:
		void setup() { _spi.setup(); }

		void begin(uint16_t wavOut) {
			OCR0A = wavOut >> 8;			OCR0B = wavOut & 0xFF;
		}
	
		void sendHiByte(uint8_t hi) { }
		void sendLoByte(uint8_t lo) { }
		void end() { }
};

#endif /* PWM0_H_ */