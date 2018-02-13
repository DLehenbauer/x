#ifndef __ADSR_H__
#define __ADSR_H__

#include <stdint.h>

#define min(a,b) ((a)<(b)?(a):(b))
#define max(a,b) ((a)>(b)?(a):(b))

class ADSR;
class Synth;

enum ADSRStage : uint8_t {
    ADSRStage_Attack      = 0,
    ADSRStage_Decay       = 1,
    ADSRStage_Sustain     = 2,
    ADSRStage_Release     = 3,
    ADSRStage_Idle        = 4
};

struct ADSRStageParameters {
    uint8_t divider;
    int8_t slope;
    int8_t limit;
};

struct ADSRParameters {
    ADSRStageParameters stages[4];
    uint8_t idleDivider;
    
    void setDuration(ADSRStage stage, int8_t time) {
        int8_t previousLimit = stage == ADSRStage_Attack
            ? 0
            : stages[static_cast<ADSRStage>(stage - 1)].limit;
        
        int16_t delta = stages[stage].limit - previousLimit;
        if (time == 0) {
            stages[stage].slope = delta;
            return;
        }
        
        int8_t slope = delta / time;
        
        slope = max(min(slope, 63), -63);
        if (slope == 0) {
            stages[stage].slope = delta < 0 ? -1 : 1;
            stages[stage].divider = 1;
        } else {
            stages[stage].slope = slope;
            stages[stage].divider = 0xFF;
        }
    }
    
    void setLimit(ADSRStage stage, uint8_t value) {
        // MIDI provides a limit in the range 0..127.  We reduce this to 0..63 for our ADSR.
        stages[stage].limit = (value >> 1);
    }
};

static ADSRParameters defaultADSR = {
    //             divider   slope   limit
    /*  attack */ {{ 0x01,     31,    127 },
    /*   decay */  { 0x01,     -4,     96 },
    /* sustain */  { 0x00,      0,     32 },
    /* release */  { 0x01,     -1,      0 }},
    /*    idle */    0xFF
};

class ADSR {
    private:
        const ADSRParameters* parameters = &defaultADSR;
        uint8_t divider = 0;
        uint8_t dividerMask = 0;
        int8_t slope = 0;
        int8_t limit = 0;
        int8_t amp;
        ADSRStage stage = ADSRStage_Idle;
    
    public:
        uint8_t sample() volatile {
			// Divider is a 7-bit counter looping from 0x00..0x7F.  This allows us to use a mask of 0x80+
			// as an infinite hold.
			divider = (divider + 1) & 0x7F;
						
            if (divider < dividerMask) {
                return amp;
            }

            divider = 0;
            amp += slope;

            bool nextStage = amp < 0 || (
                (slope < 0)
                    ? amp < limit
                    : amp > limit);
                
            if (nextStage) {
                amp = limit;
                stage = static_cast<ADSRStage>(stage + 1);
                const ADSRStageParameters& s = parameters->stages[stage];
                dividerMask = s.divider;
                slope = s.slope;
                limit = s.limit;
            }
                
            return amp;
        }
        
        void noteOn() volatile {
            divider = 0;
            amp = 0;
            stage = ADSRStage_Attack;
            const ADSRStageParameters& s = parameters->stages[ADSRStage_Attack];
            dividerMask = s.divider;
            slope = s.slope;
            limit = s.limit;
        }

        void noteOff(bool damp) volatile {
            if (stage < ADSRStage_Release) {
                stage = ADSRStage_Release;
                const ADSRStageParameters& s = parameters->stages[ADSRStage_Release];
                dividerMask = s.divider;
                slope = s.slope;
                limit = s.limit;
            }
        }

        friend class Synth;
};

#endif