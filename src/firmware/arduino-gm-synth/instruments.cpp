#include <avr/pgmspace.h>
#include "instruments.h"
#include "instruments_generated.h"

constexpr static PercussiveInstrument drums[] PROGMEM = {
    /* 35:        Bass Drum 2 */ { /* note: */ 0x00 },
    /* 36:        Bass Drum 1 */ { /* note: */ 0x13 },
    /* 37: Side Stick/Rimshot */ { /* note: */ 0x13 },
    /* 38:       Snare Drum 1 */ { /* note: */ 0x1F },
    /* 39:          Hand Clap */ { /* note: */ 0x13 },
    /* 40:       Snare Drum 2 */ { /* note: */ 0x1F },
    /* 41:          Low Tom 2 */ { /* note: */ 0x0C },
    /* 42:      Closed Hi-hat */ { /* note: */ 0x3C },
    /* 43:          Low Tom 1 */ { /* note: */ 0x0C },
    /* 44:       Pedal Hi-hat */ { /* note: */ 0x3C },
    /* 45:          Mid Tom 2 */ { /* note: */ 0x0C },
    /* 46:        Open Hi-hat */ { /* note: */ 0x3C },
    /* 47:          Mid Tom 1 */ { /* note: */ 0x0C },
    /* 48:         High Tom 2 */ { /* note: */ 0x0C },
    /* 49:     Crash Cymbal 1 */ { /* note: */ 0x3C },
    /* 50:         High Tom 1 */ { /* note: */ 0x0C },
    /* 51:      Ride Cymbal 1 */ { /* note: */ 0x3C },
    /* 52:     Chinese Cymbal */ { /* note: */ 0x3C },
    /* 53:          Ride Bell */ { /* note: */ 0x0C },
    /* 54:         Tambourine */ { /* note: */ 0x3C },
    /* 55:      Splash Cymbal */ { /* note: */ 0x3C },
    /* 56:            Cowbell */ { /* note: */ 0x0C },
    /* 57:     Crash Cymbal 2 */ { /* note: */ 0x3C },
    /* 58:         Vibra Slap */ { /* note: */ 0x0C },
    /* 59:      Ride Cymbal 2 */ { /* note: */ 0x3C },
    /* 60:         High Bongo */ { /* note: */ 0x0C },
    /* 61:          Low Bongo */ { /* note: */ 0x0C },
    /* 62:    Mute High Conga */ { /* note: */ 0x0C },
    /* 63:    Open High Conga */ { /* note: */ 0x0C },
    /* 64:          Low Conga */ { /* note: */ 0x0C },
    /* 65:       High Timbale */ { /* note: */ 0x0C },
    /* 66:        Low Timbale */ { /* note: */ 0x0C },
    /* 67:         High Agogô */ { /* note: */ 0x0C },
    /* 68:          Low Agogô */ { /* note: */ 0x0C },
    /* 69:             Cabasa */ { /* note: */ 0x0C },
    /* 70:            Maracas */ { /* note: */ 0x0C },
    /* 71:      Short Whistle */ { /* note: */ 0x0C },
    /* 72:       Long Whistle */ { /* note: */ 0x0C },
    /* 73:        Short Güiro */ { /* note: */ 0x0C },
    /* 74:         Long Güiro */ { /* note: */ 0x0C },
    /* 75:             Claves */ { /* note: */ 0x0C },
    /* 76:    High Wood Block */ { /* note: */ 0x0C },
    /* 77:     Low Wood Block */ { /* note: */ 0x0C },
    /* 78:         Mute Cuíca */ { /* note: */ 0x0C },
    /* 79:         Open Cuíca */ { /* note: */ 0x0C },
    /* 80:      Mute Triangle */ { /* note: */ 0x0C },
    /* 81:      Open Triangle */ { /* note: */ 0x0C }
};

template <typename T> void PROGMEM_readAnything(const T* src, T& dest) {
    memcpy_P(&dest, src, sizeof(T));
}

void Instruments::getInstrument(uint8_t index, Instrument& instrument) {
    PROGMEM_readAnything(&instruments[index], instrument);
}

void Instruments::getDrum(uint8_t index, PercussiveInstrument& drum) {
    PROGMEM_readAnything(&drums[index], drum);
}

const int8_t* Instruments::getWavetableAddress(uint16_t offset) {
    return &Waveforms[offset];
}

uint16_t Instruments::getWavetableByteLength() {
	return sizeof(Waveforms);
}