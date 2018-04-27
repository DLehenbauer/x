#ifndef SPI_H_
#define SPI_H_

#include "pin.h"

template<PinId csPin>
class Spi final {
	private:
		Pin<csPin> _csPin;
	
	public:
		void setup() {
			_csPin.high();
			_csPin.output();
			
			SPSR |= _BV(SPI2X);                 // SCK = F_CPU/2
			SPCR = _BV(SPE) | _BV(MSTR);        // Enable SPI, Master
			
			DDRB |= _BV(DDB5) | _BV(DDB3);      // Set MOSI and SCK as outputs after enabling SPI.
		}
	
		void begin() {
			_csPin.low();
		}
		
		void end() {
			_csPin.high();
		}
	
		void flush() __attribute__((always_inline)) {
			while (!(SPSR & _BV(SPIF)));
		}
		
		void unsafe_clearEndOfTransmissionFlag() __attribute__((always_inline)) {
			SPSR;
		}
	
		void unsafe_send(uint8_t data) __attribute__((always_inline)) {
			SPDR = data;
		}
	
		void send(const uint8_t data) __attribute__((always_inline)) {
			flush();
			unsafe_send(data);
		}
};

#endif /* SPI_H_ */