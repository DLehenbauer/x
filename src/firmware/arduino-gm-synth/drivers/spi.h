#ifndef SPI_H_
#define SPI_H_

class Spi final {
	public:
		void flush() __attribute__((always_inline)) {
			while (!(SPSR & _BV(SPIF)));
		}
		
		void unsafe_clearEndOfTransmissionFlag() __attribute__((always_inline)) {
			SPSR &= ~_BV(SPIF);
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