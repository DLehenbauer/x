#ifndef LTC16XX_H_
#define LTC16XX_H_

#include "../spi.h"

template<PinId csPin>
class Ltc16xx final {
	private:
		Spi<csPin> _spi;
	
	public:
		void setup() { _spi.setup(); }
	
		void sendHiByte(uint8_t hi) { 
			_spi.begin();
			_spi.unsafe_send(hi);
		}
		
		void sendLoByte(uint8_t lo) {
			_spi.unsafe_send(lo);
		}

		void end() {
			_spi.end();
			_spi.unsafe_clearEndOfTransmissionFlag();
		}
};

#endif /* LTC16XX_H_ */