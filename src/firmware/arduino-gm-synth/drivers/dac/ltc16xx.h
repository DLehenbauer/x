#ifndef LTC16XX_H_
#define LTC16XX_H_

#include "../spi.h"

template<PinId csPin>
class Ltc16xx final {
	private:
		uint16_t out;
		Spi<csPin> _spi;
	
	public:
		void setup() { _spi.setup(); }
	
		void set(uint16_t value) {
			out = value;
		}

		void begin() { }
	
		void sendHiByte() { 
			_spi.begin();
			_spi.unsafe_send(out >> 8);
		}
		
		void sendLoByte() {
			_spi.unsafe_send(out);
		}

		void end() {
			_spi.end();
			_spi.unsafe_clearEndOfTransmissionFlag();
		}
};

#endif /* LTC16XX_H_ */