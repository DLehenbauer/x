export default class Util {
    /** Return the given number as an 8-bit/2-digit hexadecimal string. */
    static hex8(value) {
        const hex = (value & 0xFF).toString(16);
        return "00".substr(hex.length) + hex;
    }
}