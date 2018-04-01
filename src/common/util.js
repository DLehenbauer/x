export default class Util {
    /** Return the given number as an 8-bit/2-digit hexadecimal string. */
    static hex8(value) {
        const hex = (value & 0xFF).toString(16);
        return "00".substr(hex.length) + hex;
    }

    /** Return the given number as an 16-bit/4-digit hexadecimal string. */
    static hex16(value) {
        const hex = (value & 0xFFFF).toString(16);
        return "0000".substr(hex.length) + hex;
    }
}