#ifndef __RINGBUFFER_H__
#define __RINGBUFFER_H__

#include <stdint.h>

template<class T, uint8_t Log2Capacity> class RingBuffer {
    private:
        static constexpr uint8_t length = (1 << Log2Capacity);
        static constexpr uint8_t lengthModMask = length - 1;
    
        volatile uint8_t _head;
        volatile uint8_t _tail;
        T _buffer[length];
    
    public:
        void enqueue(T data) volatile {
            uint8_t newHead = (_head + 1) & lengthModMask;
            if (newHead != _tail) {
                _buffer[_head] = data;
                _head = newHead;
            }
        }
    
        bool dequeue(T& value) volatile {
            if (_head == _tail) {
                return false;
            } else {
                value = _buffer[_tail];
                _tail = (_tail + 1) & lengthModMask;
                return true;
            }
        }
};

#endif //__RINGBUFFER_H__
