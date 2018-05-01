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
    
      // Note: We must set the default CS pin as an output, even if we're using a different
      //       pin to select the device.  (TODO: Verify?)
      DDRB |= _BV(DDB5) | _BV(DDB3) | _BV(DDB2);	// Set MOSI, SCK, and CS as outputs after enabling SPI.
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
    #ifdef __EMSCRIPTEN__
      #pragma clang diagnostic push
      #pragma clang diagnostic ignored "-Wunused-value"
    #endif
      SPSR;
    #ifdef __EMSCRIPTEN__
      #pragma clang diagnostic pop
    #endif
    }
  
    void unsafe_send(uint8_t data) __attribute__((always_inline)) {
      SPDR = data;
    }
  
    void send(const uint8_t data) __attribute__((always_inline)) {
      unsafe_send(data);
      flush();
    }
};

#endif /* SPI_H_ */