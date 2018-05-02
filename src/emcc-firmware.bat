setlocal

set SrcPath=%CD%\firmware\arduino-gm-synth

emcc --bind -o %CD%\firmware\firmware.js -O0 -g -std=c++11 -DF_CPU=16000000 -I%SrcPath%\emscripten %SrcPath%\emscripten\avr\mocks.cpp %SrcPath%\emscripten\bindings.cpp

endlocal
