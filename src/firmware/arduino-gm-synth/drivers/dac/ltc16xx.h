#ifndef LTC16XX_H_
#define LTC16XX_H_

#include "../spi.h"

/*
    Driver for Ltc16xx serial DAC
    
    DANGER: This driver does not wait for the SPI end-of-transmission flag before selecting the slave
            device or transmitting.  The caller is responsible for ensuring that:
            
              1.  The bus is available before calling sendHiByte()
              2.  Sufficient clock cycles have passed for the prior transmission to complete before
                  calling sendLoByte() and end();
                  
            The sample/mix/output ISR in synth.h ensures this by strategically interleaving calls into
            the DAC to output the previous sample with work to calculate the next sample.
                  
    This driver has been tested with the LTC1655 and LTC1658.
    
        LTC1655 16-bit R2R SPI DAC
        http://www.analog.com/media/en/technical-documentation/data-sheets/16555lf.pdf
    
        LTC1658 14-bit R2R SPI DAC (uses VRef)
        http://www.analog.com/media/en/technical-documentation/data-sheets/1658f.pdf
  
    Connection to Arduino Uno (assuming using pin 10 for CS):
  
                       .------.
         pin 13 >----1-|      |-8----< +5v      3.9k      10uf**
         pin 11 >----2-|  U1  |-7---------------^v^v^--o---|(--------< audio out
         pin 10 >----3-|      |-6----< VRef*           |
                       |      |-5----< gnd            === 3.3nF***
                       '------'                        |
                                                      gnd
                                                                                                         
       * Note: For LTC1658, connect VRef to +5v.  For LTC1655, leave disconnected.
      ** Note: A/C coupling capacitor typically optional.
     *** Note: RC filtering capacitor can be adjusted to taste:
     
                2.2nf ~= 18.5 kHz
                3.3nf ~= 12.4 kHz 
                4.7nf ~=  8.7 kHz
*/
template<PinId csPin>
class Ltc16xx final {
  private:
    uint16_t out;
    Spi<csPin> _spi;
  
  public:
    void setup() { _spi.setup(); }
  
    void sendHiByte() {
      _spi.begin();
      _spi.unsafe_send(out >> 8);
    }
  
    void sendLoByte() {
      _spi.unsafe_send(out);
    }

    void set(uint16_t value) {
      out = value;
      _spi.end();
      _spi.unsafe_clearEndOfTransmissionFlag();
    }
};

#endif /* LTC16XX_H_ */