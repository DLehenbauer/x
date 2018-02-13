#ifndef __SSD1306_H__
#define __SSD1306_H__

#include <stdint.h>
#include <avr/common.h>
#include <avr/interrupt.h>
#include <avr/io.h>

// A specialized driver for SSD1306-based OLED display used to concurrently update the real-time bar
// graph in tiny time slices, interspersed with dispatching MIDI in the main loop.

class ssd1306 {
public:    
	ssd1306();
    void begin();
    void reset();
    void select(uint8_t minX, uint8_t maxX, uint8_t minPage, uint8_t maxPage);
    void setRegion(uint8_t minX, uint8_t maxX, uint8_t minPage, uint8_t maxPage, uint8_t value);
    void send7(uint8_t value);
    
private:
    static constexpr uint8_t _resPin = _BV(DDD2);
    static constexpr uint8_t  _dcPin = _BV(DDD3);
    static constexpr uint8_t  _csPin = _BV(DDD4);
    
    static constexpr uint8_t _cmdPins   = _csPin | _dcPin;
    static constexpr uint8_t _dataPins  = _csPin;

    void send(const uint8_t data) __attribute__((always_inline)) {
        SPDR = data;
        while (!(SPSR & _BV(SPIF)));
    }

    void beginCommand() __attribute__((always_inline)) {
        PORTD &= ~_cmdPins;         // Select SSD1306 for command/data.
    }
    
    void endCommand() __attribute__((always_inline)) {
        PORTD |= _cmdPins;          // Deselect SSD1306.
    }

    void beginData() __attribute__((always_inline)) {
        PORTD &= ~_dataPins;        // Select SSD1306 for command/data.
    }
    
    void endData() __attribute__((always_inline)) {
        PORTD |= _dataPins;         // Deselect SSD1306.
    }
};

#endif //__SSD1306_H__