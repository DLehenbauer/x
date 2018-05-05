#ifndef __ENVELOPE_H__
#define __ENVELOPE_H__

#include <stdint.h>
#include "instruments.h"

/*
    Envelope generator
*/
class Envelope {
  private:
    const EnvelopeStage* pStart = nullptr;
    uint8_t loopStart   = 0xFF;
    uint8_t loopEnd     = 0xFF;
    uint8_t stageIndex  = 0xFF;
    int16_t amp   = 0;
    int16_t slope = 0;
    int8_t  limit = -64;
  
    void loadStage() volatile {
      EnvelopeStage stage;
      Instruments::getEnvelopeStage(pStart, stageIndex, stage);
      slope = stage.slope;
      limit = stage.limit;
    }
  
  public:
    uint8_t sample() volatile {
      amp += slope;
      int8_t out = amp >> 8;

      const bool nextStage = (out < 0) ||
        (slope <= 0)
          ? out <= limit
          : out >= limit;
    
      if (nextStage) {
        out = limit;
        amp = limit << 8;
        stageIndex++;
        if (stageIndex == loopEnd) {
          stageIndex = loopStart;
        }
        loadStage();
      }
    
      return out;
    }
  
    void start(uint8_t programIndex) volatile {
      EnvelopeProgram program;
      Instruments::getEnvelopeProgram(programIndex, program);
    
      pStart = program.start;
      loopStart = program.loopStartAndEnd >> 4;
      loopEnd = program.loopStartAndEnd & 0x0F;
      amp = program.initialValue << 8;
      stageIndex = 0;
    
      loadStage();
    }

    void stop() volatile {
      if (stageIndex < loopEnd) {
        stageIndex = loopEnd;
        loadStage();
      }
    }

    friend class Synth;
  
  #ifdef __EMSCRIPTEN__
    uint8_t sampleEm()            { return sample(); }
    void startEm(uint8_t program) { start(program); }
    void stopEm()                 { stop(); }
    uint8_t getStageIndex()       { return stageIndex; }
  #endif // __EMSCRIPTEN__
};

#endif //__ENVELOPE_H__