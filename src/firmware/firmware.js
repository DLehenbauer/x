// The Module object: Our interface to the outside world. We import
// and export values on it. There are various ways Module can be used:
// 1. Not defined. We create it here
// 2. A function parameter, function(Module) { ..generated code.. }
// 3. pre-run appended it, var Module = {}; ..generated code..
// 4. External script tag defines var Module.
// We need to check if Module already exists (e.g. case 3 above).
// Substitution will be replaced with actual code on later stage of the build,
// this way Closure Compiler will not mangle it (e.g. case 4. above).
// Note that if you want to run closure, and also to use Module
// after the generated code, you will need to define   var Module = {};
// before the code. Then that object will be used in the code, and you
// can continue to use Module afterwards as well.
var Module = typeof Module !== 'undefined' ? Module : {};

// --pre-jses are emitted after the Module integration code, so that they can
// refer to Module (if they choose; they can also define Module)
// {{PRE_JSES}}

// Sometimes an existing Module object exists with properties
// meant to overwrite the default module functionality. Here
// we collect those properties and reapply _after_ we configure
// the current environment's defaults to avoid having to be so
// defensive during initialization.
var moduleOverrides = {};
var key;
for (key in Module) {
  if (Module.hasOwnProperty(key)) {
    moduleOverrides[key] = Module[key];
  }
}

Module['arguments'] = [];
Module['thisProgram'] = './this.program';
Module['quit'] = function(status, toThrow) {
  throw toThrow;
};
Module['preRun'] = [];
Module['postRun'] = [];

// The environment setup code below is customized to use Module.
// *** Environment setup code ***
var ENVIRONMENT_IS_WEB = false;
var ENVIRONMENT_IS_WORKER = false;
var ENVIRONMENT_IS_NODE = false;
var ENVIRONMENT_IS_SHELL = false;

// Three configurations we can be running in:
// 1) We could be the application main() thread running in the main JS UI thread. (ENVIRONMENT_IS_WORKER == false and ENVIRONMENT_IS_PTHREAD == false)
// 2) We could be the application main() thread proxied to worker. (with Emscripten -s PROXY_TO_WORKER=1) (ENVIRONMENT_IS_WORKER == true, ENVIRONMENT_IS_PTHREAD == false)
// 3) We could be an application pthread running in a worker. (ENVIRONMENT_IS_WORKER == true and ENVIRONMENT_IS_PTHREAD == true)

if (Module['ENVIRONMENT']) {
  if (Module['ENVIRONMENT'] === 'WEB') {
    ENVIRONMENT_IS_WEB = true;
  } else if (Module['ENVIRONMENT'] === 'WORKER') {
    ENVIRONMENT_IS_WORKER = true;
  } else if (Module['ENVIRONMENT'] === 'NODE') {
    ENVIRONMENT_IS_NODE = true;
  } else if (Module['ENVIRONMENT'] === 'SHELL') {
    ENVIRONMENT_IS_SHELL = true;
  } else {
    throw new Error('Module[\'ENVIRONMENT\'] value is not valid. must be one of: WEB|WORKER|NODE|SHELL.');
  }
} else {
  ENVIRONMENT_IS_WEB = typeof window === 'object';
  ENVIRONMENT_IS_WORKER = typeof importScripts === 'function';
  ENVIRONMENT_IS_NODE = typeof process === 'object' && typeof require === 'function' && !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_WORKER;
  ENVIRONMENT_IS_SHELL = !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_NODE && !ENVIRONMENT_IS_WORKER;
}


if (ENVIRONMENT_IS_NODE) {
  // Expose functionality in the same simple way that the shells work
  // Note that we pollute the global namespace here, otherwise we break in node
  var nodeFS;
  var nodePath;

  Module['read'] = function shell_read(filename, binary) {
    var ret;
      if (!nodeFS) nodeFS = require('fs');
      if (!nodePath) nodePath = require('path');
      filename = nodePath['normalize'](filename);
      ret = nodeFS['readFileSync'](filename);
    return binary ? ret : ret.toString();
  };

  Module['readBinary'] = function readBinary(filename) {
    var ret = Module['read'](filename, true);
    if (!ret.buffer) {
      ret = new Uint8Array(ret);
    }
    assert(ret.buffer);
    return ret;
  };

  if (process['argv'].length > 1) {
    Module['thisProgram'] = process['argv'][1].replace(/\\/g, '/');
  }

  Module['arguments'] = process['argv'].slice(2);

  if (typeof module !== 'undefined') {
    module['exports'] = Module;
  }

  process['on']('uncaughtException', function(ex) {
    // suppress ExitStatus exceptions from showing an error
    if (!(ex instanceof ExitStatus)) {
      throw ex;
    }
  });
  // Currently node will swallow unhandled rejections, but this behavior is
  // deprecated, and in the future it will exit with error status.
  process['on']('unhandledRejection', function(reason, p) {
    Module['printErr']('node.js exiting due to unhandled promise rejection');
    process['exit'](1);
  });

  Module['inspect'] = function () { return '[Emscripten Module object]'; };
}
else if (ENVIRONMENT_IS_SHELL) {
  if (typeof read != 'undefined') {
    Module['read'] = function shell_read(f) {
      return read(f);
    };
  }

  Module['readBinary'] = function readBinary(f) {
    var data;
    if (typeof readbuffer === 'function') {
      return new Uint8Array(readbuffer(f));
    }
    data = read(f, 'binary');
    assert(typeof data === 'object');
    return data;
  };

  if (typeof scriptArgs != 'undefined') {
    Module['arguments'] = scriptArgs;
  } else if (typeof arguments != 'undefined') {
    Module['arguments'] = arguments;
  }

  if (typeof quit === 'function') {
    Module['quit'] = function(status, toThrow) {
      quit(status);
    }
  }
}
else if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
  Module['read'] = function shell_read(url) {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, false);
      xhr.send(null);
      return xhr.responseText;
  };

  if (ENVIRONMENT_IS_WORKER) {
    Module['readBinary'] = function readBinary(url) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, false);
        xhr.responseType = 'arraybuffer';
        xhr.send(null);
        return new Uint8Array(xhr.response);
    };
  }

  Module['readAsync'] = function readAsync(url, onload, onerror) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'arraybuffer';
    xhr.onload = function xhr_onload() {
      if (xhr.status == 200 || (xhr.status == 0 && xhr.response)) { // file URLs can return 0
        onload(xhr.response);
        return;
      }
      onerror();
    };
    xhr.onerror = onerror;
    xhr.send(null);
  };

  if (typeof arguments != 'undefined') {
    Module['arguments'] = arguments;
  }

  Module['setWindowTitle'] = function(title) { document.title = title };
}
else {
  // Unreachable because SHELL is dependent on the others
  throw new Error('unknown runtime environment');
}

// console.log is checked first, as 'print' on the web will open a print dialogue
// printErr is preferable to console.warn (works better in shells)
// bind(console) is necessary to fix IE/Edge closed dev tools panel behavior.
Module['print'] = typeof console !== 'undefined' ? console.log.bind(console) : (typeof print !== 'undefined' ? print : null);
Module['printErr'] = typeof printErr !== 'undefined' ? printErr : ((typeof console !== 'undefined' && console.warn.bind(console)) || Module['print']);

// *** Environment setup code ***

// Closure helpers
Module.print = Module['print'];
Module.printErr = Module['printErr'];

// Merge back in the overrides
for (key in moduleOverrides) {
  if (moduleOverrides.hasOwnProperty(key)) {
    Module[key] = moduleOverrides[key];
  }
}
// Free the object hierarchy contained in the overrides, this lets the GC
// reclaim data used e.g. in memoryInitializerRequest, which is a large typed array.
moduleOverrides = undefined;



// {{PREAMBLE_ADDITIONS}}

var STACK_ALIGN = 16;

// stack management, and other functionality that is provided by the compiled code,
// should not be used before it is ready
stackSave = stackRestore = stackAlloc = setTempRet0 = getTempRet0 = function() {
  abort('cannot use the stack before compiled code is ready to run, and has provided stack access');
};

function staticAlloc(size) {
  assert(!staticSealed);
  var ret = STATICTOP;
  STATICTOP = (STATICTOP + size + 15) & -16;
  return ret;
}

function dynamicAlloc(size) {
  assert(DYNAMICTOP_PTR);
  var ret = HEAP32[DYNAMICTOP_PTR>>2];
  var end = (ret + size + 15) & -16;
  HEAP32[DYNAMICTOP_PTR>>2] = end;
  if (end >= TOTAL_MEMORY) {
    var success = enlargeMemory();
    if (!success) {
      HEAP32[DYNAMICTOP_PTR>>2] = ret;
      return 0;
    }
  }
  return ret;
}

function alignMemory(size, factor) {
  if (!factor) factor = STACK_ALIGN; // stack alignment (16-byte) by default
  var ret = size = Math.ceil(size / factor) * factor;
  return ret;
}

function getNativeTypeSize(type) {
  switch (type) {
    case 'i1': case 'i8': return 1;
    case 'i16': return 2;
    case 'i32': return 4;
    case 'i64': return 8;
    case 'float': return 4;
    case 'double': return 8;
    default: {
      if (type[type.length-1] === '*') {
        return 4; // A pointer
      } else if (type[0] === 'i') {
        var bits = parseInt(type.substr(1));
        assert(bits % 8 === 0);
        return bits / 8;
      } else {
        return 0;
      }
    }
  }
}

function warnOnce(text) {
  if (!warnOnce.shown) warnOnce.shown = {};
  if (!warnOnce.shown[text]) {
    warnOnce.shown[text] = 1;
    Module.printErr(text);
  }
}



var jsCallStartIndex = 1;
var functionPointers = new Array(0);

// 'sig' parameter is only used on LLVM wasm backend
function addFunction(func, sig) {
  if (typeof sig === 'undefined') {
    Module.printErr('Warning: addFunction: Provide a wasm function signature ' +
                    'string as a second argument');
  }
  var base = 0;
  for (var i = base; i < base + 0; i++) {
    if (!functionPointers[i]) {
      functionPointers[i] = func;
      return jsCallStartIndex + i;
    }
  }
  throw 'Finished up all reserved function pointers. Use a higher value for RESERVED_FUNCTION_POINTERS.';
}

function removeFunction(index) {
  functionPointers[index-jsCallStartIndex] = null;
}

var funcWrappers = {};

function getFuncWrapper(func, sig) {
  if (!func) return; // on null pointer, return undefined
  assert(sig);
  if (!funcWrappers[sig]) {
    funcWrappers[sig] = {};
  }
  var sigCache = funcWrappers[sig];
  if (!sigCache[func]) {
    // optimize away arguments usage in common cases
    if (sig.length === 1) {
      sigCache[func] = function dynCall_wrapper() {
        return dynCall(sig, func);
      };
    } else if (sig.length === 2) {
      sigCache[func] = function dynCall_wrapper(arg) {
        return dynCall(sig, func, [arg]);
      };
    } else {
      // general case
      sigCache[func] = function dynCall_wrapper() {
        return dynCall(sig, func, Array.prototype.slice.call(arguments));
      };
    }
  }
  return sigCache[func];
}


function makeBigInt(low, high, unsigned) {
  return unsigned ? ((+((low>>>0)))+((+((high>>>0)))*4294967296.0)) : ((+((low>>>0)))+((+((high|0)))*4294967296.0));
}

function dynCall(sig, ptr, args) {
  if (args && args.length) {
    assert(args.length == sig.length-1);
    assert(('dynCall_' + sig) in Module, 'bad function pointer type - no table for sig \'' + sig + '\'');
    return Module['dynCall_' + sig].apply(null, [ptr].concat(args));
  } else {
    assert(sig.length == 1);
    assert(('dynCall_' + sig) in Module, 'bad function pointer type - no table for sig \'' + sig + '\'');
    return Module['dynCall_' + sig].call(null, ptr);
  }
}


function getCompilerSetting(name) {
  throw 'You must build with -s RETAIN_COMPILER_SETTINGS=1 for getCompilerSetting or emscripten_get_compiler_setting to work';
}

var Runtime = {
  // FIXME backwards compatibility layer for ports. Support some Runtime.*
  //       for now, fix it there, then remove it from here. That way we
  //       can minimize any period of breakage.
  dynCall: dynCall, // for SDL2 port
  // helpful errors
  getTempRet0: function() { abort('getTempRet0() is now a top-level function, after removing the Runtime object. Remove "Runtime."') },
  staticAlloc: function() { abort('staticAlloc() is now a top-level function, after removing the Runtime object. Remove "Runtime."') },
  stackAlloc: function() { abort('stackAlloc() is now a top-level function, after removing the Runtime object. Remove "Runtime."') },
};

// The address globals begin at. Very low in memory, for code size and optimization opportunities.
// Above 0 is static memory, starting with globals.
// Then the stack.
// Then 'dynamic' memory for sbrk.
var GLOBAL_BASE = 8;



// === Preamble library stuff ===

// Documentation for the public APIs defined in this file must be updated in:
//    site/source/docs/api_reference/preamble.js.rst
// A prebuilt local version of the documentation is available at:
//    site/build/text/docs/api_reference/preamble.js.txt
// You can also build docs locally as HTML or other formats in site/
// An online HTML version (which may be of a different version of Emscripten)
//    is up at http://kripken.github.io/emscripten-site/docs/api_reference/preamble.js.html



//========================================
// Runtime essentials
//========================================

var ABORT = 0; // whether we are quitting the application. no code should run after this. set in exit() and abort()
var EXITSTATUS = 0;

/** @type {function(*, string=)} */
function assert(condition, text) {
  if (!condition) {
    abort('Assertion failed: ' + text);
  }
}

var globalScope = this;

// Returns the C function with a specified identifier (for C++, you need to do manual name mangling)
function getCFunc(ident) {
  var func = Module['_' + ident]; // closure exported function
  assert(func, 'Cannot call unknown function ' + ident + ', make sure it is exported');
  return func;
}

var JSfuncs = {
  // Helpers for cwrap -- it can't refer to Runtime directly because it might
  // be renamed by closure, instead it calls JSfuncs['stackSave'].body to find
  // out what the minified function name is.
  'stackSave': function() {
    stackSave()
  },
  'stackRestore': function() {
    stackRestore()
  },
  // type conversion from js to c
  'arrayToC' : function(arr) {
    var ret = stackAlloc(arr.length);
    writeArrayToMemory(arr, ret);
    return ret;
  },
  'stringToC' : function(str) {
    var ret = 0;
    if (str !== null && str !== undefined && str !== 0) { // null string
      // at most 4 bytes per UTF-8 code point, +1 for the trailing '\0'
      var len = (str.length << 2) + 1;
      ret = stackAlloc(len);
      stringToUTF8(str, ret, len);
    }
    return ret;
  }
};
// For fast lookup of conversion functions
var toC = {'string' : JSfuncs['stringToC'], 'array' : JSfuncs['arrayToC']};

// C calling interface.
function ccall (ident, returnType, argTypes, args, opts) {
  var func = getCFunc(ident);
  var cArgs = [];
  var stack = 0;
  assert(returnType !== 'array', 'Return type should not be "array".');
  if (args) {
    for (var i = 0; i < args.length; i++) {
      var converter = toC[argTypes[i]];
      if (converter) {
        if (stack === 0) stack = stackSave();
        cArgs[i] = converter(args[i]);
      } else {
        cArgs[i] = args[i];
      }
    }
  }
  var ret = func.apply(null, cArgs);
  if (returnType === 'string') ret = Pointer_stringify(ret);
  if (stack !== 0) {
    stackRestore(stack);
  }
  return ret;
}

function cwrap (ident, returnType, argTypes) {
  argTypes = argTypes || [];
  var cfunc = getCFunc(ident);
  // When the function takes numbers and returns a number, we can just return
  // the original function
  var numericArgs = argTypes.every(function(type){ return type === 'number'});
  var numericRet = returnType !== 'string';
  if (numericRet && numericArgs) {
    return cfunc;
  }
  return function() {
    return ccall(ident, returnType, argTypes, arguments);
  }
}

/** @type {function(number, number, string, boolean=)} */
function setValue(ptr, value, type, noSafe) {
  type = type || 'i8';
  if (type.charAt(type.length-1) === '*') type = 'i32'; // pointers are 32-bit
    switch(type) {
      case 'i1': HEAP8[((ptr)>>0)]=value; break;
      case 'i8': HEAP8[((ptr)>>0)]=value; break;
      case 'i16': HEAP16[((ptr)>>1)]=value; break;
      case 'i32': HEAP32[((ptr)>>2)]=value; break;
      case 'i64': (tempI64 = [value>>>0,(tempDouble=value,(+(Math_abs(tempDouble))) >= 1.0 ? (tempDouble > 0.0 ? ((Math_min((+(Math_floor((tempDouble)/4294967296.0))), 4294967295.0))|0)>>>0 : (~~((+(Math_ceil((tempDouble - +(((~~(tempDouble)))>>>0))/4294967296.0)))))>>>0) : 0)],HEAP32[((ptr)>>2)]=tempI64[0],HEAP32[(((ptr)+(4))>>2)]=tempI64[1]); break;
      case 'float': HEAPF32[((ptr)>>2)]=value; break;
      case 'double': HEAPF64[((ptr)>>3)]=value; break;
      default: abort('invalid type for setValue: ' + type);
    }
}

/** @type {function(number, string, boolean=)} */
function getValue(ptr, type, noSafe) {
  type = type || 'i8';
  if (type.charAt(type.length-1) === '*') type = 'i32'; // pointers are 32-bit
    switch(type) {
      case 'i1': return HEAP8[((ptr)>>0)];
      case 'i8': return HEAP8[((ptr)>>0)];
      case 'i16': return HEAP16[((ptr)>>1)];
      case 'i32': return HEAP32[((ptr)>>2)];
      case 'i64': return HEAP32[((ptr)>>2)];
      case 'float': return HEAPF32[((ptr)>>2)];
      case 'double': return HEAPF64[((ptr)>>3)];
      default: abort('invalid type for getValue: ' + type);
    }
  return null;
}

var ALLOC_NORMAL = 0; // Tries to use _malloc()
var ALLOC_STACK = 1; // Lives for the duration of the current function call
var ALLOC_STATIC = 2; // Cannot be freed
var ALLOC_DYNAMIC = 3; // Cannot be freed except through sbrk
var ALLOC_NONE = 4; // Do not allocate

// allocate(): This is for internal use. You can use it yourself as well, but the interface
//             is a little tricky (see docs right below). The reason is that it is optimized
//             for multiple syntaxes to save space in generated code. So you should
//             normally not use allocate(), and instead allocate memory using _malloc(),
//             initialize it with setValue(), and so forth.
// @slab: An array of data, or a number. If a number, then the size of the block to allocate,
//        in *bytes* (note that this is sometimes confusing: the next parameter does not
//        affect this!)
// @types: Either an array of types, one for each byte (or 0 if no type at that position),
//         or a single type which is used for the entire block. This only matters if there
//         is initial data - if @slab is a number, then this does not matter at all and is
//         ignored.
// @allocator: How to allocate memory, see ALLOC_*
/** @type {function((TypedArray|Array<number>|number), string, number, number=)} */
function allocate(slab, types, allocator, ptr) {
  var zeroinit, size;
  if (typeof slab === 'number') {
    zeroinit = true;
    size = slab;
  } else {
    zeroinit = false;
    size = slab.length;
  }

  var singleType = typeof types === 'string' ? types : null;

  var ret;
  if (allocator == ALLOC_NONE) {
    ret = ptr;
  } else {
    ret = [typeof _malloc === 'function' ? _malloc : staticAlloc, stackAlloc, staticAlloc, dynamicAlloc][allocator === undefined ? ALLOC_STATIC : allocator](Math.max(size, singleType ? 1 : types.length));
  }

  if (zeroinit) {
    var stop;
    ptr = ret;
    assert((ret & 3) == 0);
    stop = ret + (size & ~3);
    for (; ptr < stop; ptr += 4) {
      HEAP32[((ptr)>>2)]=0;
    }
    stop = ret + size;
    while (ptr < stop) {
      HEAP8[((ptr++)>>0)]=0;
    }
    return ret;
  }

  if (singleType === 'i8') {
    if (slab.subarray || slab.slice) {
      HEAPU8.set(/** @type {!Uint8Array} */ (slab), ret);
    } else {
      HEAPU8.set(new Uint8Array(slab), ret);
    }
    return ret;
  }

  var i = 0, type, typeSize, previousType;
  while (i < size) {
    var curr = slab[i];

    type = singleType || types[i];
    if (type === 0) {
      i++;
      continue;
    }
    assert(type, 'Must know what type to store in allocate!');

    if (type == 'i64') type = 'i32'; // special case: we have one i32 here, and one i32 later

    setValue(ret+i, curr, type);

    // no need to look up size unless type changes, so cache it
    if (previousType !== type) {
      typeSize = getNativeTypeSize(type);
      previousType = type;
    }
    i += typeSize;
  }

  return ret;
}

// Allocate memory during any stage of startup - static memory early on, dynamic memory later, malloc when ready
function getMemory(size) {
  if (!staticSealed) return staticAlloc(size);
  if (!runtimeInitialized) return dynamicAlloc(size);
  return _malloc(size);
}

/** @type {function(number, number=)} */
function Pointer_stringify(ptr, length) {
  if (length === 0 || !ptr) return '';
  // TODO: use TextDecoder
  // Find the length, and check for UTF while doing so
  var hasUtf = 0;
  var t;
  var i = 0;
  while (1) {
    assert(ptr + i < TOTAL_MEMORY);
    t = HEAPU8[(((ptr)+(i))>>0)];
    hasUtf |= t;
    if (t == 0 && !length) break;
    i++;
    if (length && i == length) break;
  }
  if (!length) length = i;

  var ret = '';

  if (hasUtf < 128) {
    var MAX_CHUNK = 1024; // split up into chunks, because .apply on a huge string can overflow the stack
    var curr;
    while (length > 0) {
      curr = String.fromCharCode.apply(String, HEAPU8.subarray(ptr, ptr + Math.min(length, MAX_CHUNK)));
      ret = ret ? ret + curr : curr;
      ptr += MAX_CHUNK;
      length -= MAX_CHUNK;
    }
    return ret;
  }
  return UTF8ToString(ptr);
}

// Given a pointer 'ptr' to a null-terminated ASCII-encoded string in the emscripten HEAP, returns
// a copy of that string as a Javascript String object.

function AsciiToString(ptr) {
  var str = '';
  while (1) {
    var ch = HEAP8[((ptr++)>>0)];
    if (!ch) return str;
    str += String.fromCharCode(ch);
  }
}

// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in ASCII form. The copy will require at most str.length+1 bytes of space in the HEAP.

function stringToAscii(str, outPtr) {
  return writeAsciiToMemory(str, outPtr, false);
}

// Given a pointer 'ptr' to a null-terminated UTF8-encoded string in the given array that contains uint8 values, returns
// a copy of that string as a Javascript String object.

var UTF8Decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf8') : undefined;
function UTF8ArrayToString(u8Array, idx) {
  var endPtr = idx;
  // TextDecoder needs to know the byte length in advance, it doesn't stop on null terminator by itself.
  // Also, use the length info to avoid running tiny strings through TextDecoder, since .subarray() allocates garbage.
  while (u8Array[endPtr]) ++endPtr;

  if (endPtr - idx > 16 && u8Array.subarray && UTF8Decoder) {
    return UTF8Decoder.decode(u8Array.subarray(idx, endPtr));
  } else {
    var u0, u1, u2, u3, u4, u5;

    var str = '';
    while (1) {
      // For UTF8 byte structure, see http://en.wikipedia.org/wiki/UTF-8#Description and https://www.ietf.org/rfc/rfc2279.txt and https://tools.ietf.org/html/rfc3629
      u0 = u8Array[idx++];
      if (!u0) return str;
      if (!(u0 & 0x80)) { str += String.fromCharCode(u0); continue; }
      u1 = u8Array[idx++] & 63;
      if ((u0 & 0xE0) == 0xC0) { str += String.fromCharCode(((u0 & 31) << 6) | u1); continue; }
      u2 = u8Array[idx++] & 63;
      if ((u0 & 0xF0) == 0xE0) {
        u0 = ((u0 & 15) << 12) | (u1 << 6) | u2;
      } else {
        u3 = u8Array[idx++] & 63;
        if ((u0 & 0xF8) == 0xF0) {
          u0 = ((u0 & 7) << 18) | (u1 << 12) | (u2 << 6) | u3;
        } else {
          u4 = u8Array[idx++] & 63;
          if ((u0 & 0xFC) == 0xF8) {
            u0 = ((u0 & 3) << 24) | (u1 << 18) | (u2 << 12) | (u3 << 6) | u4;
          } else {
            u5 = u8Array[idx++] & 63;
            u0 = ((u0 & 1) << 30) | (u1 << 24) | (u2 << 18) | (u3 << 12) | (u4 << 6) | u5;
          }
        }
      }
      if (u0 < 0x10000) {
        str += String.fromCharCode(u0);
      } else {
        var ch = u0 - 0x10000;
        str += String.fromCharCode(0xD800 | (ch >> 10), 0xDC00 | (ch & 0x3FF));
      }
    }
  }
}

// Given a pointer 'ptr' to a null-terminated UTF8-encoded string in the emscripten HEAP, returns
// a copy of that string as a Javascript String object.

function UTF8ToString(ptr) {
  return UTF8ArrayToString(HEAPU8,ptr);
}

// Copies the given Javascript String object 'str' to the given byte array at address 'outIdx',
// encoded in UTF8 form and null-terminated. The copy will require at most str.length*4+1 bytes of space in the HEAP.
// Use the function lengthBytesUTF8 to compute the exact number of bytes (excluding null terminator) that this function will write.
// Parameters:
//   str: the Javascript string to copy.
//   outU8Array: the array to copy to. Each index in this array is assumed to be one 8-byte element.
//   outIdx: The starting offset in the array to begin the copying.
//   maxBytesToWrite: The maximum number of bytes this function can write to the array. This count should include the null
//                    terminator, i.e. if maxBytesToWrite=1, only the null terminator will be written and nothing else.
//                    maxBytesToWrite=0 does not write any bytes to the output, not even the null terminator.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF8Array(str, outU8Array, outIdx, maxBytesToWrite) {
  if (!(maxBytesToWrite > 0)) // Parameter maxBytesToWrite is not optional. Negative values, 0, null, undefined and false each don't write out any bytes.
    return 0;

  var startIdx = outIdx;
  var endIdx = outIdx + maxBytesToWrite - 1; // -1 for string null terminator.
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! So decode UTF16->UTF32->UTF8.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    // For UTF8 byte structure, see http://en.wikipedia.org/wiki/UTF-8#Description and https://www.ietf.org/rfc/rfc2279.txt and https://tools.ietf.org/html/rfc3629
    var u = str.charCodeAt(i); // possibly a lead surrogate
    if (u >= 0xD800 && u <= 0xDFFF) u = 0x10000 + ((u & 0x3FF) << 10) | (str.charCodeAt(++i) & 0x3FF);
    if (u <= 0x7F) {
      if (outIdx >= endIdx) break;
      outU8Array[outIdx++] = u;
    } else if (u <= 0x7FF) {
      if (outIdx + 1 >= endIdx) break;
      outU8Array[outIdx++] = 0xC0 | (u >> 6);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else if (u <= 0xFFFF) {
      if (outIdx + 2 >= endIdx) break;
      outU8Array[outIdx++] = 0xE0 | (u >> 12);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else if (u <= 0x1FFFFF) {
      if (outIdx + 3 >= endIdx) break;
      outU8Array[outIdx++] = 0xF0 | (u >> 18);
      outU8Array[outIdx++] = 0x80 | ((u >> 12) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else if (u <= 0x3FFFFFF) {
      if (outIdx + 4 >= endIdx) break;
      outU8Array[outIdx++] = 0xF8 | (u >> 24);
      outU8Array[outIdx++] = 0x80 | ((u >> 18) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 12) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else {
      if (outIdx + 5 >= endIdx) break;
      outU8Array[outIdx++] = 0xFC | (u >> 30);
      outU8Array[outIdx++] = 0x80 | ((u >> 24) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 18) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 12) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    }
  }
  // Null-terminate the pointer to the buffer.
  outU8Array[outIdx] = 0;
  return outIdx - startIdx;
}

// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in UTF8 form. The copy will require at most str.length*4+1 bytes of space in the HEAP.
// Use the function lengthBytesUTF8 to compute the exact number of bytes (excluding null terminator) that this function will write.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF8(str, outPtr, maxBytesToWrite) {
  assert(typeof maxBytesToWrite == 'number', 'stringToUTF8(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!');
  return stringToUTF8Array(str, HEAPU8,outPtr, maxBytesToWrite);
}

// Returns the number of bytes the given Javascript string takes if encoded as a UTF8 byte array, EXCLUDING the null terminator byte.

function lengthBytesUTF8(str) {
  var len = 0;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! So decode UTF16->UTF32->UTF8.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var u = str.charCodeAt(i); // possibly a lead surrogate
    if (u >= 0xD800 && u <= 0xDFFF) u = 0x10000 + ((u & 0x3FF) << 10) | (str.charCodeAt(++i) & 0x3FF);
    if (u <= 0x7F) {
      ++len;
    } else if (u <= 0x7FF) {
      len += 2;
    } else if (u <= 0xFFFF) {
      len += 3;
    } else if (u <= 0x1FFFFF) {
      len += 4;
    } else if (u <= 0x3FFFFFF) {
      len += 5;
    } else {
      len += 6;
    }
  }
  return len;
}

// Given a pointer 'ptr' to a null-terminated UTF16LE-encoded string in the emscripten HEAP, returns
// a copy of that string as a Javascript String object.

var UTF16Decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-16le') : undefined;
function UTF16ToString(ptr) {
  assert(ptr % 2 == 0, 'Pointer passed to UTF16ToString must be aligned to two bytes!');
  var endPtr = ptr;
  // TextDecoder needs to know the byte length in advance, it doesn't stop on null terminator by itself.
  // Also, use the length info to avoid running tiny strings through TextDecoder, since .subarray() allocates garbage.
  var idx = endPtr >> 1;
  while (HEAP16[idx]) ++idx;
  endPtr = idx << 1;

  if (endPtr - ptr > 32 && UTF16Decoder) {
    return UTF16Decoder.decode(HEAPU8.subarray(ptr, endPtr));
  } else {
    var i = 0;

    var str = '';
    while (1) {
      var codeUnit = HEAP16[(((ptr)+(i*2))>>1)];
      if (codeUnit == 0) return str;
      ++i;
      // fromCharCode constructs a character from a UTF-16 code unit, so we can pass the UTF16 string right through.
      str += String.fromCharCode(codeUnit);
    }
  }
}

// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in UTF16 form. The copy will require at most str.length*4+2 bytes of space in the HEAP.
// Use the function lengthBytesUTF16() to compute the exact number of bytes (excluding null terminator) that this function will write.
// Parameters:
//   str: the Javascript string to copy.
//   outPtr: Byte address in Emscripten HEAP where to write the string to.
//   maxBytesToWrite: The maximum number of bytes this function can write to the array. This count should include the null
//                    terminator, i.e. if maxBytesToWrite=2, only the null terminator will be written and nothing else.
//                    maxBytesToWrite<2 does not write any bytes to the output, not even the null terminator.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF16(str, outPtr, maxBytesToWrite) {
  assert(outPtr % 2 == 0, 'Pointer passed to stringToUTF16 must be aligned to two bytes!');
  assert(typeof maxBytesToWrite == 'number', 'stringToUTF16(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!');
  // Backwards compatibility: if max bytes is not specified, assume unsafe unbounded write is allowed.
  if (maxBytesToWrite === undefined) {
    maxBytesToWrite = 0x7FFFFFFF;
  }
  if (maxBytesToWrite < 2) return 0;
  maxBytesToWrite -= 2; // Null terminator.
  var startPtr = outPtr;
  var numCharsToWrite = (maxBytesToWrite < str.length*2) ? (maxBytesToWrite / 2) : str.length;
  for (var i = 0; i < numCharsToWrite; ++i) {
    // charCodeAt returns a UTF-16 encoded code unit, so it can be directly written to the HEAP.
    var codeUnit = str.charCodeAt(i); // possibly a lead surrogate
    HEAP16[((outPtr)>>1)]=codeUnit;
    outPtr += 2;
  }
  // Null-terminate the pointer to the HEAP.
  HEAP16[((outPtr)>>1)]=0;
  return outPtr - startPtr;
}

// Returns the number of bytes the given Javascript string takes if encoded as a UTF16 byte array, EXCLUDING the null terminator byte.

function lengthBytesUTF16(str) {
  return str.length*2;
}

function UTF32ToString(ptr) {
  assert(ptr % 4 == 0, 'Pointer passed to UTF32ToString must be aligned to four bytes!');
  var i = 0;

  var str = '';
  while (1) {
    var utf32 = HEAP32[(((ptr)+(i*4))>>2)];
    if (utf32 == 0)
      return str;
    ++i;
    // Gotcha: fromCharCode constructs a character from a UTF-16 encoded code (pair), not from a Unicode code point! So encode the code point to UTF-16 for constructing.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    if (utf32 >= 0x10000) {
      var ch = utf32 - 0x10000;
      str += String.fromCharCode(0xD800 | (ch >> 10), 0xDC00 | (ch & 0x3FF));
    } else {
      str += String.fromCharCode(utf32);
    }
  }
}

// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in UTF32 form. The copy will require at most str.length*4+4 bytes of space in the HEAP.
// Use the function lengthBytesUTF32() to compute the exact number of bytes (excluding null terminator) that this function will write.
// Parameters:
//   str: the Javascript string to copy.
//   outPtr: Byte address in Emscripten HEAP where to write the string to.
//   maxBytesToWrite: The maximum number of bytes this function can write to the array. This count should include the null
//                    terminator, i.e. if maxBytesToWrite=4, only the null terminator will be written and nothing else.
//                    maxBytesToWrite<4 does not write any bytes to the output, not even the null terminator.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF32(str, outPtr, maxBytesToWrite) {
  assert(outPtr % 4 == 0, 'Pointer passed to stringToUTF32 must be aligned to four bytes!');
  assert(typeof maxBytesToWrite == 'number', 'stringToUTF32(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!');
  // Backwards compatibility: if max bytes is not specified, assume unsafe unbounded write is allowed.
  if (maxBytesToWrite === undefined) {
    maxBytesToWrite = 0x7FFFFFFF;
  }
  if (maxBytesToWrite < 4) return 0;
  var startPtr = outPtr;
  var endPtr = startPtr + maxBytesToWrite - 4;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! We must decode the string to UTF-32 to the heap.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var codeUnit = str.charCodeAt(i); // possibly a lead surrogate
    if (codeUnit >= 0xD800 && codeUnit <= 0xDFFF) {
      var trailSurrogate = str.charCodeAt(++i);
      codeUnit = 0x10000 + ((codeUnit & 0x3FF) << 10) | (trailSurrogate & 0x3FF);
    }
    HEAP32[((outPtr)>>2)]=codeUnit;
    outPtr += 4;
    if (outPtr + 4 > endPtr) break;
  }
  // Null-terminate the pointer to the HEAP.
  HEAP32[((outPtr)>>2)]=0;
  return outPtr - startPtr;
}

// Returns the number of bytes the given Javascript string takes if encoded as a UTF16 byte array, EXCLUDING the null terminator byte.

function lengthBytesUTF32(str) {
  var len = 0;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! We must decode the string to UTF-32 to the heap.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var codeUnit = str.charCodeAt(i);
    if (codeUnit >= 0xD800 && codeUnit <= 0xDFFF) ++i; // possibly a lead surrogate, so skip over the tail surrogate.
    len += 4;
  }

  return len;
}

// Allocate heap space for a JS string, and write it there.
// It is the responsibility of the caller to free() that memory.
function allocateUTF8(str) {
  var size = lengthBytesUTF8(str) + 1;
  var ret = _malloc(size);
  if (ret) stringToUTF8Array(str, HEAP8, ret, size);
  return ret;
}

// Allocate stack space for a JS string, and write it there.
function allocateUTF8OnStack(str) {
  var size = lengthBytesUTF8(str) + 1;
  var ret = stackAlloc(size);
  stringToUTF8Array(str, HEAP8, ret, size);
  return ret;
}

function demangle(func) {
  warnOnce('warning: build with  -s DEMANGLE_SUPPORT=1  to link in libcxxabi demangling');
  return func;
}

function demangleAll(text) {
  var regex =
    /__Z[\w\d_]+/g;
  return text.replace(regex,
    function(x) {
      var y = demangle(x);
      return x === y ? x : (x + ' [' + y + ']');
    });
}

function jsStackTrace() {
  var err = new Error();
  if (!err.stack) {
    // IE10+ special cases: It does have callstack info, but it is only populated if an Error object is thrown,
    // so try that as a special-case.
    try {
      throw new Error(0);
    } catch(e) {
      err = e;
    }
    if (!err.stack) {
      return '(no stack trace available)';
    }
  }
  return err.stack.toString();
}

function stackTrace() {
  var js = jsStackTrace();
  if (Module['extraStackTrace']) js += '\n' + Module['extraStackTrace']();
  return demangleAll(js);
}

// Memory management

var PAGE_SIZE = 16384;
var WASM_PAGE_SIZE = 65536;
var ASMJS_PAGE_SIZE = 16777216;
var MIN_TOTAL_MEMORY = 16777216;

function alignUp(x, multiple) {
  if (x % multiple > 0) {
    x += multiple - (x % multiple);
  }
  return x;
}

var HEAP,
/** @type {ArrayBuffer} */
  buffer,
/** @type {Int8Array} */
  HEAP8,
/** @type {Uint8Array} */
  HEAPU8,
/** @type {Int16Array} */
  HEAP16,
/** @type {Uint16Array} */
  HEAPU16,
/** @type {Int32Array} */
  HEAP32,
/** @type {Uint32Array} */
  HEAPU32,
/** @type {Float32Array} */
  HEAPF32,
/** @type {Float64Array} */
  HEAPF64;

function updateGlobalBuffer(buf) {
  Module['buffer'] = buffer = buf;
}

function updateGlobalBufferViews() {
  Module['HEAP8'] = HEAP8 = new Int8Array(buffer);
  Module['HEAP16'] = HEAP16 = new Int16Array(buffer);
  Module['HEAP32'] = HEAP32 = new Int32Array(buffer);
  Module['HEAPU8'] = HEAPU8 = new Uint8Array(buffer);
  Module['HEAPU16'] = HEAPU16 = new Uint16Array(buffer);
  Module['HEAPU32'] = HEAPU32 = new Uint32Array(buffer);
  Module['HEAPF32'] = HEAPF32 = new Float32Array(buffer);
  Module['HEAPF64'] = HEAPF64 = new Float64Array(buffer);
}

var STATIC_BASE, STATICTOP, staticSealed; // static area
var STACK_BASE, STACKTOP, STACK_MAX; // stack area
var DYNAMIC_BASE, DYNAMICTOP_PTR; // dynamic area handled by sbrk

  STATIC_BASE = STATICTOP = STACK_BASE = STACKTOP = STACK_MAX = DYNAMIC_BASE = DYNAMICTOP_PTR = 0;
  staticSealed = false;


// Initializes the stack cookie. Called at the startup of main and at the startup of each thread in pthreads mode.
function writeStackCookie() {
  assert((STACK_MAX & 3) == 0);
  HEAPU32[(STACK_MAX >> 2)-1] = 0x02135467;
  HEAPU32[(STACK_MAX >> 2)-2] = 0x89BACDFE;
}

function checkStackCookie() {
  if (HEAPU32[(STACK_MAX >> 2)-1] != 0x02135467 || HEAPU32[(STACK_MAX >> 2)-2] != 0x89BACDFE) {
    abort('Stack overflow! Stack cookie has been overwritten, expected hex dwords 0x89BACDFE and 0x02135467, but received 0x' + HEAPU32[(STACK_MAX >> 2)-2].toString(16) + ' ' + HEAPU32[(STACK_MAX >> 2)-1].toString(16));
  }
  // Also test the global address 0 for integrity. This check is not compatible with SAFE_SPLIT_MEMORY though, since that mode already tests all address 0 accesses on its own.
  if (HEAP32[0] !== 0x63736d65 /* 'emsc' */) throw 'Runtime error: The application has corrupted its heap memory area (address zero)!';
}

function abortStackOverflow(allocSize) {
  abort('Stack overflow! Attempted to allocate ' + allocSize + ' bytes on the stack, but stack has only ' + (STACK_MAX - stackSave() + allocSize) + ' bytes available!');
}

function abortOnCannotGrowMemory() {
  abort('Cannot enlarge memory arrays. Either (1) compile with  -s TOTAL_MEMORY=X  with X higher than the current value ' + TOTAL_MEMORY + ', (2) compile with  -s ALLOW_MEMORY_GROWTH=1  which allows increasing the size at runtime but prevents some optimizations, (3) set Module.TOTAL_MEMORY to a higher value before the program runs, or (4) if you want malloc to return NULL (0) instead of this abort, compile with  -s ABORTING_MALLOC=0 ');
}


function enlargeMemory() {
  abortOnCannotGrowMemory();
}


var TOTAL_STACK = Module['TOTAL_STACK'] || 5242880;
var TOTAL_MEMORY = Module['TOTAL_MEMORY'] || 16777216;
if (TOTAL_MEMORY < TOTAL_STACK) Module.printErr('TOTAL_MEMORY should be larger than TOTAL_STACK, was ' + TOTAL_MEMORY + '! (TOTAL_STACK=' + TOTAL_STACK + ')');

// Initialize the runtime's memory
// check for full engine support (use string 'subarray' to avoid closure compiler confusion)
assert(typeof Int32Array !== 'undefined' && typeof Float64Array !== 'undefined' && Int32Array.prototype.subarray !== undefined && Int32Array.prototype.set !== undefined,
       'JS engine does not provide full typed array support');



// Use a provided buffer, if there is one, or else allocate a new one
if (Module['buffer']) {
  buffer = Module['buffer'];
  assert(buffer.byteLength === TOTAL_MEMORY, 'provided buffer should be ' + TOTAL_MEMORY + ' bytes, but it is ' + buffer.byteLength);
} else {
  // Use a WebAssembly memory where available
  {
    buffer = new ArrayBuffer(TOTAL_MEMORY);
  }
  assert(buffer.byteLength === TOTAL_MEMORY);
  Module['buffer'] = buffer;
}
updateGlobalBufferViews();


function getTotalMemory() {
  return TOTAL_MEMORY;
}

// Endianness check (note: assumes compiler arch was little-endian)
  HEAP32[0] = 0x63736d65; /* 'emsc' */
HEAP16[1] = 0x6373;
if (HEAPU8[2] !== 0x73 || HEAPU8[3] !== 0x63) throw 'Runtime error: expected the system to be little-endian!';

function callRuntimeCallbacks(callbacks) {
  while(callbacks.length > 0) {
    var callback = callbacks.shift();
    if (typeof callback == 'function') {
      callback();
      continue;
    }
    var func = callback.func;
    if (typeof func === 'number') {
      if (callback.arg === undefined) {
        Module['dynCall_v'](func);
      } else {
        Module['dynCall_vi'](func, callback.arg);
      }
    } else {
      func(callback.arg === undefined ? null : callback.arg);
    }
  }
}

var __ATPRERUN__  = []; // functions called before the runtime is initialized
var __ATINIT__    = []; // functions called during startup
var __ATMAIN__    = []; // functions called when main() is to be run
var __ATEXIT__    = []; // functions called during shutdown
var __ATPOSTRUN__ = []; // functions called after the runtime has exited

var runtimeInitialized = false;
var runtimeExited = false;


function preRun() {
  // compatibility - merge in anything from Module['preRun'] at this time
  if (Module['preRun']) {
    if (typeof Module['preRun'] == 'function') Module['preRun'] = [Module['preRun']];
    while (Module['preRun'].length) {
      addOnPreRun(Module['preRun'].shift());
    }
  }
  callRuntimeCallbacks(__ATPRERUN__);
}

function ensureInitRuntime() {
  checkStackCookie();
  if (runtimeInitialized) return;
  runtimeInitialized = true;
  callRuntimeCallbacks(__ATINIT__);
}

function preMain() {
  checkStackCookie();
  callRuntimeCallbacks(__ATMAIN__);
}

function exitRuntime() {
  checkStackCookie();
  callRuntimeCallbacks(__ATEXIT__);
  runtimeExited = true;
}

function postRun() {
  checkStackCookie();
  // compatibility - merge in anything from Module['postRun'] at this time
  if (Module['postRun']) {
    if (typeof Module['postRun'] == 'function') Module['postRun'] = [Module['postRun']];
    while (Module['postRun'].length) {
      addOnPostRun(Module['postRun'].shift());
    }
  }
  callRuntimeCallbacks(__ATPOSTRUN__);
}

function addOnPreRun(cb) {
  __ATPRERUN__.unshift(cb);
}

function addOnInit(cb) {
  __ATINIT__.unshift(cb);
}

function addOnPreMain(cb) {
  __ATMAIN__.unshift(cb);
}

function addOnExit(cb) {
  __ATEXIT__.unshift(cb);
}

function addOnPostRun(cb) {
  __ATPOSTRUN__.unshift(cb);
}

// Deprecated: This function should not be called because it is unsafe and does not provide
// a maximum length limit of how many bytes it is allowed to write. Prefer calling the
// function stringToUTF8Array() instead, which takes in a maximum length that can be used
// to be secure from out of bounds writes.
/** @deprecated */
function writeStringToMemory(string, buffer, dontAddNull) {
  warnOnce('writeStringToMemory is deprecated and should not be called! Use stringToUTF8() instead!');

  var /** @type {number} */ lastChar, /** @type {number} */ end;
  if (dontAddNull) {
    // stringToUTF8Array always appends null. If we don't want to do that, remember the
    // character that existed at the location where the null will be placed, and restore
    // that after the write (below).
    end = buffer + lengthBytesUTF8(string);
    lastChar = HEAP8[end];
  }
  stringToUTF8(string, buffer, Infinity);
  if (dontAddNull) HEAP8[end] = lastChar; // Restore the value under the null character.
}

function writeArrayToMemory(array, buffer) {
  assert(array.length >= 0, 'writeArrayToMemory array must have a length (should be an array or typed array)')
  HEAP8.set(array, buffer);
}

function writeAsciiToMemory(str, buffer, dontAddNull) {
  for (var i = 0; i < str.length; ++i) {
    assert(str.charCodeAt(i) === str.charCodeAt(i)&0xff);
    HEAP8[((buffer++)>>0)]=str.charCodeAt(i);
  }
  // Null-terminate the pointer to the HEAP.
  if (!dontAddNull) HEAP8[((buffer)>>0)]=0;
}

function unSign(value, bits, ignore) {
  if (value >= 0) {
    return value;
  }
  return bits <= 32 ? 2*Math.abs(1 << (bits-1)) + value // Need some trickery, since if bits == 32, we are right at the limit of the bits JS uses in bitshifts
                    : Math.pow(2, bits)         + value;
}
function reSign(value, bits, ignore) {
  if (value <= 0) {
    return value;
  }
  var half = bits <= 32 ? Math.abs(1 << (bits-1)) // abs is needed if bits == 32
                        : Math.pow(2, bits-1);
  if (value >= half && (bits <= 32 || value > half)) { // for huge values, we can hit the precision limit and always get true here. so don't do that
                                                       // but, in general there is no perfect solution here. With 64-bit ints, we get rounding and errors
                                                       // TODO: In i64 mode 1, resign the two parts separately and safely
    value = -2*half + value; // Cannot bitshift half, as it may be at the limit of the bits JS uses in bitshifts
  }
  return value;
}

assert(Math['imul'] && Math['fround'] && Math['clz32'] && Math['trunc'], 'this is a legacy browser, build with LEGACY_VM_SUPPORT');

var Math_abs = Math.abs;
var Math_cos = Math.cos;
var Math_sin = Math.sin;
var Math_tan = Math.tan;
var Math_acos = Math.acos;
var Math_asin = Math.asin;
var Math_atan = Math.atan;
var Math_atan2 = Math.atan2;
var Math_exp = Math.exp;
var Math_log = Math.log;
var Math_sqrt = Math.sqrt;
var Math_ceil = Math.ceil;
var Math_floor = Math.floor;
var Math_pow = Math.pow;
var Math_imul = Math.imul;
var Math_fround = Math.fround;
var Math_round = Math.round;
var Math_min = Math.min;
var Math_max = Math.max;
var Math_clz32 = Math.clz32;
var Math_trunc = Math.trunc;

// A counter of dependencies for calling run(). If we need to
// do asynchronous work before running, increment this and
// decrement it. Incrementing must happen in a place like
// PRE_RUN_ADDITIONS (used by emcc to add file preloading).
// Note that you can add dependencies in preRun, even though
// it happens right before run - run will be postponed until
// the dependencies are met.
var runDependencies = 0;
var runDependencyWatcher = null;
var dependenciesFulfilled = null; // overridden to take different actions when all run dependencies are fulfilled
var runDependencyTracking = {};

function getUniqueRunDependency(id) {
  var orig = id;
  while (1) {
    if (!runDependencyTracking[id]) return id;
    id = orig + Math.random();
  }
  return id;
}

function addRunDependency(id) {
  runDependencies++;
  if (Module['monitorRunDependencies']) {
    Module['monitorRunDependencies'](runDependencies);
  }
  if (id) {
    assert(!runDependencyTracking[id]);
    runDependencyTracking[id] = 1;
    if (runDependencyWatcher === null && typeof setInterval !== 'undefined') {
      // Check for missing dependencies every few seconds
      runDependencyWatcher = setInterval(function() {
        if (ABORT) {
          clearInterval(runDependencyWatcher);
          runDependencyWatcher = null;
          return;
        }
        var shown = false;
        for (var dep in runDependencyTracking) {
          if (!shown) {
            shown = true;
            Module.printErr('still waiting on run dependencies:');
          }
          Module.printErr('dependency: ' + dep);
        }
        if (shown) {
          Module.printErr('(end of list)');
        }
      }, 10000);
    }
  } else {
    Module.printErr('warning: run dependency added without ID');
  }
}

function removeRunDependency(id) {
  runDependencies--;
  if (Module['monitorRunDependencies']) {
    Module['monitorRunDependencies'](runDependencies);
  }
  if (id) {
    assert(runDependencyTracking[id]);
    delete runDependencyTracking[id];
  } else {
    Module.printErr('warning: run dependency removed without ID');
  }
  if (runDependencies == 0) {
    if (runDependencyWatcher !== null) {
      clearInterval(runDependencyWatcher);
      runDependencyWatcher = null;
    }
    if (dependenciesFulfilled) {
      var callback = dependenciesFulfilled;
      dependenciesFulfilled = null;
      callback(); // can add another dependenciesFulfilled
    }
  }
}

Module["preloadedImages"] = {}; // maps url to image data
Module["preloadedAudios"] = {}; // maps url to audio data



var memoryInitializer = null;



var /* show errors on likely calls to FS when it was not included */ FS = {
  error: function() {
    abort('Filesystem support (FS) was not included. The problem is that you are using files from JS, but files were not used from C/C++, so filesystem support was not auto-included. You can force-include filesystem support with  -s FORCE_FILESYSTEM=1');
  },
  init: function() { FS.error() },
  createDataFile: function() { FS.error() },
  createPreloadedFile: function() { FS.error() },
  createLazyFile: function() { FS.error() },
  open: function() { FS.error() },
  mkdev: function() { FS.error() },
  registerDevice: function() { FS.error() },
  analyzePath: function() { FS.error() },
  loadFilesFromDB: function() { FS.error() },

  ErrnoError: function ErrnoError() { FS.error() },
};
Module['FS_createDataFile'] = FS.createDataFile;
Module['FS_createPreloadedFile'] = FS.createPreloadedFile;



// Prefix of data URIs emitted by SINGLE_FILE and related options.
var dataURIPrefix = 'data:application/octet-stream;base64,';

// Indicates whether filename is a base64 data URI.
function isDataURI(filename) {
  return String.prototype.startsWith ?
      filename.startsWith(dataURIPrefix) :
      filename.indexOf(dataURIPrefix) === 0;
}





// === Body ===

var ASM_CONSTS = [];




STATIC_BASE = GLOBAL_BASE;

STATICTOP = STATIC_BASE + 38400;
/* global initializers */  __ATINIT__.push({ func: function() { __GLOBAL__sub_I_bindings_cpp() } }, { func: function() { __GLOBAL__sub_I_main_cpp() } }, { func: function() { __GLOBAL__sub_I_bind_cpp() } });


/* memory initializer */ allocate([68,14,0,0,171,22,0,0,0,0,0,0,24,0,0,0,236,13,0,0,183,22,0,0,40,0,0,0,0,0,0,0,196,13,0,0,194,22,0,0,68,14,0,0,208,22,0,0,1,0,0,0,24,0,0,0,68,14,0,0,226,22,0,0,0,0,0,0,40,0,0,0,68,14,0,0,242,22,0,0,1,0,0,0,40,0,0,0,68,14,0,0,255,22,0,0,0,0,0,0,112,0,0,0,196,13,0,0,6,23,0,0,68,14,0,0,22,23,0,0,1,0,0,0,112,0,0,0,68,14,0,0,30,23,0,0,1,0,0,0,152,0,0,0,196,13,0,0,45,23,0,0,68,14,0,0,58,23,0,0,0,0,0,0,152,0,0,0,68,14,0,0,72,23,0,0,1,0,0,0,192,0,0,0,196,13,0,0,88,23,0,0,68,14,0,0,102,23,0,0,0,0,0,0,192,0,0,0,68,14,0,0,125,23,0,0,1,0,0,0,232,0,0,0,196,13,0,0,138,23,0,0,68,14,0,0,149,23,0,0,0,0,0,0,232,0,0,0,196,13,0,0,164,23,0,0,196,13,0,0,193,23,0,0,196,13,0,0,221,23,0,0,196,13,0,0,246,23,0,0,196,13,0,0,6,24,0,0,196,13,0,0,108,126,0,0,196,13,0,0,139,126,0,0,196,13,0,0,170,126,0,0,196,13,0,0,201,126,0,0,196,13,0,0,232,126,0,0,196,13,0,0,7,127,0,0,196,13,0,0,38,127,0,0,196,13,0,0,69,127,0,0,196,13,0,0,100,127,0,0,196,13,0,0,131,127,0,0,196,13,0,0,162,127,0,0,196,13,0,0,193,127,0,0,196,13,0,0,224,127,0,0,96,14,0,0,243,127,0,0,0,0,0,0,1,0,0,0,168,1,0,0,0,0,0,0,196,13,0,0,50,128,0,0,96,14,0,0,88,128,0,0,0,0,0,0,1,0,0,0,168,1,0,0,0,0,0,0,96,14,0,0,151,128,0,0,0,0,0,0,1,0,0,0,168,1,0,0,0,0,0,0,196,13,0,0,225,138,0,0,236,13,0,0,65,139,0,0,248,1,0,0,0,0,0,0,236,13,0,0,238,138,0,0,8,2,0,0,0,0,0,0,196,13,0,0,15,139,0,0,236,13,0,0,28,139,0,0,232,1,0,0,0,0,0,0,236,13,0,0,100,140,0,0,224,1,0,0,0,0,0,0,236,13,0,0,149,140,0,0,248,1,0,0,0,0,0,0,236,13,0,0,113,140,0,0,48,2,0,0,0,0,0,0,236,13,0,0,183,140,0,0,248,1,0,0,0,0,0,0,40,14,0,0,223,140,0,0,40,14,0,0,225,140,0,0,40,14,0,0,228,140,0,0,40,14,0,0,230,140,0,0,40,14,0,0,232,140,0,0,40,14,0,0,234,140,0,0,40,14,0,0,236,140,0,0,40,14,0,0,238,140,0,0,40,14,0,0,240,140,0,0,40,14,0,0,242,140,0,0,40,14,0,0,244,140,0,0,40,14,0,0,246,140,0,0,40,14,0,0,248,140,0,0,40,14,0,0,250,140,0,0,236,13,0,0,252,140,0,0,232,1,0,0,0,0,0,0,96,2,0,0,8,0,0,0,128,2,0,0,144,2,0,0,96,2,0,0,8,0,0,0,128,2,0,0,128,2,0,0,96,2,0,0,8,0,0,0,128,2,0,0,128,2,0,0,128,2,0,0,8,0,0,0,96,2,0,0,64,0,0,0,128,2,0,0,96,2,0,0,64,0,0,0,128,2,0,0,128,2,0,0,128,2,0,0,128,2,0,0,152,2,0,0,64,0,0,0,64,0,0,0,96,2,0,0,96,0,0,0,96,2,0,0,96,0,0,0,128,2,0,0,128,2,0,0,128,2,0,0,96,0,0,0,96,0,0,0,200,2,0,0,0,1,0,0,8,1,0,0,16,1,0,0,32,1,0,0,24,1,0,0,96,2,0,0,128,2,0,0,22,25,0,0,5,0,0,0,0,0,0,0,22,25,0,0,5,0,0,0,0,0,0,0,86,25,0,0,5,0,0,0,0,0,0,0,22,25,0,0,1,0,0,57,0,0,0,0,22,25,0,0,1,0,0,0,0,0,0,0,22,25,0,0,1,0,0,0,0,0,0,0,22,25,0,0,1,0,0,91,0,0,0,0,22,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,7,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,32,0,0,0,0,86,25,0,0,1,0,0,8,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,45,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,22,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,5,0,0,44,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,22,28,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,3,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,5,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,5,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,27,0,0,9,0,0,0,0,0,0,0,86,26,0,0,9,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,5,0,0,129,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,7,0,0,0,0,86,25,0,0,1,0,0,7,0,0,0,0,86,25,0,0,1,0,0,7,0,0,0,0,22,32,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,86,25,0,0,1,0,0,0,0,0,0,0,22,24,0,0,1,0,0,0,1,0,0,0,211,24,0,0,10,0,0,0,1,0,0,0,22,25,0,0,1,2,3,3,0,0,0,0,22,25,0,0,1,2,3,0,0,0,0,0,22,24,0,0,7,4,0,0,0,0,0,0,22,24,0,0,5,0,5,0,1,0,0,0,22,24,0,0,6,0,0,0,1,0,0,0,22,24,0,0,5,0,5,0,1,0,0,0,22,25,0,0,1,2,3,0,0,0,0,0,22,24,0,0,6,0,0,0,3,0,0,0,22,25,0,0,1,7,4,0,0,0,0,0,22,24,0,0,6,0,0,0,3,0,0,0,22,25,0,0,1,7,4,0,0,0,0,0,22,24,0,0,5,0,0,0,3,0,0,0,22,25,0,0,1,2,3,0,0,0,0,0,22,25,0,0,1,2,3,0,0,0,0,0,86,26,0,0,8,0,11,0,0,0,0,0,22,25,0,0,1,2,3,0,0,0,0,0,22,24,0,0,8,0,0,0,1,0,0,0,22,32,0,0,2,0,0,32,1,0,0,0,22,24,0,0,6,0,0,32,0,0,0,0,22,24,0,0,6,0,0,32,3,0,0,0,22,24,0,0,8,0,0,32,1,0,0,0,22,24,0,0,6,0,3,32,0,0,0,0,22,24,0,0,8,0,0,32,1,0,0,0,22,24,0,0,5,0,0,32,0,0,0,0,22,24,0,0,8,0,0,32,1,0,0,0,88,24,0,0,6,0,0,32,1,0,0,0,103,24,0,0,6,0,0,32,1,0,0,0,86,25,0,0,5,2,0,32,0,0,0,0,86,25,0,0,6,2,0,32,0,0,0,0,86,25,0,0,5,2,0,32,0,0,0,0,22,24,0,0,1,2,0,32,0,0,0,0,22,24,0,0,5,2,0,32,0,0,0,0,22,24,0,0,5,2,0,32,0,0,0,0,22,24,0,0,6,2,0,32,0,0,0,0,22,24,0,0,6,2,0,32,0,0,0,0,22,24,0,0,5,0,0,32,3,0,0,0,26,25,0,0,6,2,0,0,0,0,0,0,26,25,0,0,6,0,0,32,0,0,0,0,22,24,0,0,6,0,0,32,0,0,0,0,22,24,0,0,6,0,0,32,0,0,0,0,22,24,0,0,6,0,0,32,0,0,0,0,22,24,0,0,7,0,0,0,0,0,0,0,22,24,0,0,7,0,0,0,0,0,0,0,22,24,0,0,7,0,0,32,2,0,0,0,22,24,0,0,6,0,0,32,2,0,0,0,22,24,0,0,6,0,0,32,2,0,0,0,22,24,0,0,7,0,0,32,0,0,0,0,8,0,0,0,200,11,0,0,5,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,0,0,0,3,0,0,0,238,145,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,255,255,255,255,255,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,5,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,4,0,0,0,3,0,0,0,246,145,0,0,0,4,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,10,255,255,255,255,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,68,12,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,172,144,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,5,0,0,0,0,0,0,0,232,1,0,0,6,0,0,0,7,0,0,0,8,0,0,0,9,0,0,0,10,0,0,0,11,0,0,0,12,0,0,0,13,0,0,0,0,0,0,0,16,2,0,0,6,0,0,0,14,0,0,0,8,0,0,0,9,0,0,0,10,0,0,0,15,0,0,0,16,0,0,0,17,0,0,0,0,0,0,0,32,2,0,0,18,0,0,0,19,0,0,0,20,0,0,0,0,0,0,0,80,2,0,0,6,0,0,0,21,0,0,0,8,0,0,0,9,0,0,0,22,0,0,0,0,0,0,0,64,2,0,0,6,0,0,0,23,0,0,0,8,0,0,0,9,0,0,0,24,0,0,0,0,0,0,0,208,2,0,0,6,0,0,0,25,0,0,0,8,0,0,0,9,0,0,0,10,0,0,0,26,0,0,0,27,0,0,0,28,0,0,0,0,255,255,255,0,0,0,0,128,0,0,255,255,255,0,0,0,0,128,0,0,255,255,255,0,0,0,0,128,0,0,255,255,255,0,0,0,0,128,0,0,255,255,255,0,0,0,0,128,0,0,255,255,255,0,0,0,0,128,0,0,255,255,255,0,0,0,0,128,0,0,255,255,255,0,0,0,0,128,0,0,255,255,255,0,0,0,0,128,0,0,255,255,255,0,0,0,0,128,0,0,255,255,255,0,0,0,0,128,0,0,255,255,255,0,0,0,0,128,0,0,255,255,255,0,0,0,0,128,0,0,255,255,255,0,0,0,0,128,0,0,255,255,255,0,0,0,0,128,0,0,255,255,255,0,0,0,0,128,0,0,255,255,255,0,0,0,0,128,0,0,255,255,255,0,0,0,0,128,0,0,255,255,255,0,0,0,0,128,0,0,255,255,255,0,0,0,0,128,0,0,255,255,255,0,0,0,0,128,0,0,255,255,255,0,0,0,0,128,0,0,255,255,255,0,0,0,0,128,0,0,255,255,255,0,0,0,0,128,0,0,255,255,255,0,0,0,0,128,0,0,255,255,255,0,0,0,0,128,0,0,255,255,255,0,0,0,0,128,0,0,255,255,255,0,0,0,0,128,0,0,255,255,255,0,0,0,0,128,0,0,255,255,255,0,0,0,0,128,0,0,255,255,255,0,0,0,0,128,0,0,255,255,255,0,0,0,0,128,0,0,255,255,255,0,0,0,0,128,0,0,255,255,255,0,0,0,0,128,0,0,255,255,255,0,0,0,0,128,0,0,255,255,255,0,0,0,0,128,0,0,255,255,255,0,0,0,0,128,0,0,255,255,255,0,0,0,0,128,0,0,255,255,255,0,0,0,0,128,0,0,255,255,255,0,0,0,0,128,0,0,255,255,255,0,0,0,0,128,0,0,255,255,255,0,0,0,0,128,0,0,255,255,255,0,0,0,0,128,0,0,255,255,255,0,0,0,0,128,0,0,255,255,255,0,0,0,0,128,0,0,255,255,255,0,0,0,0,128,0,0,255,255,255,0,0,0,0,128,0,0,255,255,255,0,0,0,0,128,0,0,128,225,172,27,0,29,0,30,0,32,0,34,0,36,0,38,0,41,0,43,0,46,0,48,0,51,0,54,0,57,0,61,0,64,0,68,0,72,0,77,0,81,0,86,0,91,0,96,0,102,0,108,0,115,0,121,0,129,0,136,0,144,0,153,0,162,0,172,0,182,0,193,0,204,0,216,0,229,0,243,0,1,1,17,1,33,1,50,1,68,1,88,1,108,1,130,1,153,1,177,1,203,1,230,1,3,2,33,2,66,2,100,2,137,2,175,2,216,2,3,3,49,3,98,3,149,3,204,3,6,4,67,4,132,4,201,4,17,5,94,5,176,5,7,6,99,6,196,6,43,7,152,7,11,8,134,8,8,9,145,9,35,10,189,10,96,11,14,12,197,12,135,13,85,14,48,15,23,16,12,17,15,18,34,19,69,20,122,21,193,22,27,24,138,25,15,27,171,28,95,30,45,32,23,34,30,36,68,38,139,40,244,42,130,45,54,48,20,51,30,54,85,57,190,60,91,64,47,68,60,72,136,76,21,81,231,85,3,91,108,96,40,102,59,108,171,114,124,121,182,128,93,136,121,144,16,153,42,162,0,0,192,0,255,127,127,0,197,255,126,0,226,248,48,0,132,254,0,0,255,127,120,0,176,249,53,0,69,3,68,0,69,254,64,0,163,28,64,0,0,252,96,0,146,244,16,0,9,255,0,0,0,252,72,0,90,255,56,0,255,127,96,0,219,250,28,0,0,255,8,0,255,127,96,0,176,249,16,0,0,255,0,0,202,255,0,0,255,127,96,0,69,254,64,0,0,128,16,0,225,255,0,0,0,252,96,0,165,253,48,0,69,254,0,0,255,127,127,0,171,251,48,0,126,255,0,0,255,127,0,0,21,19,127,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,109,105,100,105,95,100,101,99,111,100,101,95,98,121,116,101,0,103,101,116,80,101,114,99,117,115,115,105,111,110,78,111,116,101,115,0,103,101,116,87,97,118,101,116,97,98,108,101,0,103,101,116,76,101,114,112,83,116,97,103,101,115,0,103,101,116,76,101,114,112,80,114,111,103,114,97,109,115,0,103,101,116,76,101,114,112,80,114,111,103,114,101,115,115,105,111,110,115,0,103,101,116,73,110,115,116,114,117,109,101,110,116,115,0,73,56,115,0,115,116,97,114,116,0,101,110,100,0,85,56,115,0,76,101,114,112,83,116,97,103,101,115,0,76,101,114,112,80,114,111,103,114,97,109,115,0,73,110,115,116,114,117,109,101,110,116,115,0,103,101,116,83,97,109,112,108,101,82,97,116,101,0,103,101,116,83,121,110,116,104,0,76,101,114,112,83,116,97,103,101,0,76,101,114,112,80,114,111,103,114,97,109,0,73,110,115,116,114,117,109,101,110,116,0,76,101,114,112,0,115,97,109,112,108,101,0,115,116,111,112,0,83,121,110,116,104,0,110,111,116,101,79,110,0,110,111,116,101,79,102,102,0,77,105,100,105,83,121,110,116,104,0,109,105,100,105,78,111,116,101,79,110,0,109,105,100,105,78,111,116,101,79,102,102,0,109,105,100,105,80,114,111,103,114,97,109,67,104,97,110,103,101,0,109,105,100,105,80,105,116,99,104,66,101,110,100,0,80,57,77,105,100,105,83,121,110,116,104,0,57,77,105,100,105,83,121,110,116,104,0,53,83,121,110,116,104,0,118,105,105,105,105,105,0,80,75,57,77,105,100,105,83,121,110,116,104,0,118,105,105,105,0,80,53,83,121,110,116,104,0,118,105,105,105,105,105,105,0,80,75,53,83,121,110,116,104,0,118,105,105,0,80,52,76,101,114,112,0,52,76,101,114,112,0,118,105,105,105,105,0,105,105,105,0,80,75,52,76,101,114,112,0,80,75,49,48,73,110,115,116,114,117,109,101,110,116,0,49,48,73,110,115,116,114,117,109,101,110,116,0,80,49,48,73,110,115,116,114,117,109,101,110,116,0,80,75,49,49,76,101,114,112,80,114,111,103,114,97,109,0,49,49,76,101,114,112,80,114,111,103,114,97,109,0,80,49,49,76,101,114,112,80,114,111,103,114,97,109,0,118,105,0,118,0,105,105,0,80,75,57,76,101,114,112,83,116,97,103,101,0,57,76,101,114,112,83,116,97,103,101,0,80,57,76,101,114,112,83,116,97,103,101,0,100,105,0,49,48,72,101,97,112,82,101,103,105,111,110,73,49,48,73,110,115,116,114,117,109,101,110,116,69,0,105,0,49,48,72,101,97,112,82,101,103,105,111,110,73,49,49,76,101,114,112,80,114,111,103,114,97,109,69,0,49,48,72,101,97,112,82,101,103,105,111,110,73,57,76,101,114,112,83,116,97,103,101,69,0,49,48,72,101,97,112,82,101,103,105,111,110,73,104,69,0,49,48,72,101,97,112,82,101,103,105,111,110,73,97,69,0,0,238,231,13,64,73,31,243,239,3,0,231,222,253,41,42,248,191,170,190,235,17,35,28,248,202,194,238,32,38,21,41,89,106,82,62,59,30,211,142,129,180,255,49,66,58,23,222,170,154,180,225,7,30,48,75,95,79,41,20,23,25,7,240,229,221,201,177,176,218,31,86,95,51,242,190,166,171,207,13,79,116,111,82,41,253,212,198,224,10,32,32,30,27,8,226,193,193,222,253,6,245,225,218,224,245,31,87,127,124,80,16,214,173,156,178,239,55,96,78,17,211,176,169,187,225,14,49,64,56,31,246,216,221,255,38,59,58,37,1,226,219,246,28,49,45,16,222,164,129,137,184,248,51,96,110,86,31,228,194,201,245,45,85,85,54,8,222,200,202,229,3,20,20,6,238,214,208,228,6,35,51,45,13,224,194,198,233,24,69,103,109,80,28,232,200,194,209,238,8,20,11,245,221,211,225,253,25,44,47,32,11,252,250,8,30,48,51,32,255,219,195,193,215,252,35,56,54,32,4,236,224,225,238,252,8,13,8,1,253,1,14,27,35,34,23,4,242,231,232,242,1,14,18,13,255,1,243,243,244,240,253,241,228,230,237,214,220,223,220,208,203,193,207,206,181,181,177,175,187,157,179,174,154,160,147,150,151,150,135,130,134,141,129,131,133,132,142,133,129,136,134,131,130,150,145,163,170,169,172,187,206,199,196,216,223,220,233,233,235,7,13,21,32,39,48,57,62,68,74,78,83,88,91,95,98,100,103,106,107,110,112,114,116,117,118,119,121,121,122,123,124,124,125,125,126,126,126,126,127,127,127,127,126,126,126,126,126,125,125,124,124,123,123,122,122,121,120,119,118,117,117,116,115,114,112,110,109,108,107,106,104,103,102,100,99,98,96,95,93,92,90,89,87,84,83,81,79,78,76,74,73,71,69,67,65,63,62,60,57,55,53,51,49,47,45,43,41,39,37,35,33,31,29,25,24,21,19,17,15,12,11,8,5,4,1,253,251,249,246,244,241,238,237,234,231,229,225,222,220,217,214,212,209,206,205,202,198,196,193,190,188,186,183,181,179,176,174,172,168,167,164,162,160,158,156,155,153,151,149,147,146,145,142,140,140,138,137,136,135,134,133,132,132,131,131,130,130,130,129,129,129,129,129,130,130,130,131,131,132,133,134,134,135,136,137,139,140,141,144,145,147,148,150,152,154,156,157,160,162,164,166,169,172,174,177,179,182,185,187,190,193,195,198,202,204,207,210,212,215,218,220,223,226,229,232,235,237,240,243,245,248,251,253,255,255,253,194,238,210,95,39,40,20,25,248,236,195,111,220,13,129,102,15,250,229,40,237,166,112,235,226,204,23,146,75,27,216,59,233,62,238,219,0,216,90,206,253,155,30,195,90,30,245,228,12,17,14,239,207,72,243,244,36,204,220,198,43,56,178,61,224,32,198,253,248,28,217,17,12,19,238,37,243,216,57,246,253,242,250,9,227,60,1,20,233,236,24,172,41,30,85,21,9,255,3,249,189,123,252,63,3,61,21,179,49,202,205,245,255,229,190,60,227,67,233,40,235,166,213,42,3,72,27,171,29,21,98,250,168,236,26,77,237,14,0,219,38,208,230,178,6,30,11,223,92,18,233,21,211,29,10,94,12,223,8,32,37,223,22,10,245,51,241,29,249,32,17,18,49,2,57,37,239,245,43,254,242,6,37,240,237,32,219,232,198,3,228,11,188,2,244,56,253,19,29,37,186,214,219,240,20,5,243,4,228,22,51,245,1,8,10,20,11,250,235,190,221,250,239,250,30,219,242,19,210,255,14,209,255,169,235,211,63,15,7,227,34,255,213,22,228,226,229,36,4,2,232,235,39,242,212,253,45,0,7,0,16,244,72,42,232,72,231,56,254,232,249,25,237,21,55,208,234,11,6,10,240,255,0,225,228,4,222,238,237,245,11,205,50,5,4,255,242,249,8,46,206,237,247,8,16,202,243,47,245,0,2,255,235,246,24,254,252,240,212,229,247,32,229,53,245,241,253,8,234,254,38,251,235,25,16,2,50,249,233,245,32,12,3,3,217,255,11,32,242,3,210,11,3,220,23,246,27,233,9,219,23,240,230,0,7,2,232,251,235,220,51,215,247,222,25,202,36,222,14,10,10,3,8,23,255,46,240,20,7,11,241,218,21,0,252,6,31,23,241,39,219,38,213,32,222,68,242,41,38,36,10,5,29,244,16,3,214,27,244,48,242,38,11,237,18,215,30,241,242,230,251,245,242,33,2,255,249,16,253,0,16,254,12,238,1,12,0,129,129,129,129,129,129,129,129,129,129,129,129,129,129,129,129,129,129,129,129,129,129,129,129,129,129,129,129,129,129,129,129,129,129,129,129,129,129,129,129,129,129,129,129,129,129,129,129,129,129,129,129,129,129,129,129,129,129,129,129,129,129,129,129,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,31,31,39,53,29,31,36,60,37,60,38,60,37,40,60,39,60,60,12,60,60,58,60,12,60,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,12,43,41,12,12,12,12,0,16,1,51,6,19,11,16,13,16,16,16,21,16,25,16,29,16,34,18,38,16,42,2,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,2,3,4,0,5,6,7,8,0,9,0,13,14,0,15,16,17,21,0,18,19,20,0,10,11,12,0,22,23,24,25,0,26,27,28,0,29,30,31,0,32,33,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,2,2,2,1,1,2,32,255,255,118,111,105,100,0,98,111,111,108,0,99,104,97,114,0,115,105,103,110,101,100,32,99,104,97,114,0,117,110,115,105,103,110,101,100,32,99,104,97,114,0,115,104,111,114,116,0,117,110,115,105,103,110,101,100,32,115,104,111,114,116,0,105,110,116,0,117,110,115,105,103,110,101,100,32,105,110,116,0,108,111,110,103,0,117,110,115,105,103,110,101,100,32,108,111,110,103,0,102,108,111,97,116,0,100,111,117,98,108,101,0,115,116,100,58,58,115,116,114,105,110,103,0,115,116,100,58,58,98,97,115,105,99,95,115,116,114,105,110,103,60,117,110,115,105,103,110,101,100,32,99,104,97,114,62,0,115,116,100,58,58,119,115,116,114,105,110,103,0,101,109,115,99,114,105,112,116,101,110,58,58,118,97,108,0,101,109,115,99,114,105,112,116,101,110,58,58,109,101,109,111,114,121,95,118,105,101,119,60,99,104,97,114,62,0,101,109,115,99,114,105,112,116,101,110,58,58,109,101,109,111,114,121,95,118,105,101,119,60,115,105,103,110,101,100,32,99,104,97,114,62,0,101,109,115,99,114,105,112,116,101,110,58,58,109,101,109,111,114,121,95,118,105,101,119,60,117,110,115,105,103,110,101,100,32,99,104,97,114,62,0,101,109,115,99,114,105,112,116,101,110,58,58,109,101,109,111,114,121,95,118,105,101,119,60,115,104,111,114,116,62,0,101,109,115,99,114,105,112,116,101,110,58,58,109,101,109,111,114,121,95,118,105,101,119,60,117,110,115,105,103,110,101,100,32,115,104,111,114,116,62,0,101,109,115,99,114,105,112,116,101,110,58,58,109,101,109,111,114,121,95,118,105,101,119,60,105,110,116,62,0,101,109,115,99,114,105,112,116,101,110,58,58,109,101,109,111,114,121,95,118,105,101,119,60,117,110,115,105,103,110,101,100,32,105,110,116,62,0,101,109,115,99,114,105,112,116,101,110,58,58,109,101,109,111,114,121,95,118,105,101,119,60,108,111,110,103,62,0,101,109,115,99,114,105,112,116,101,110,58,58,109,101,109,111,114,121,95,118,105,101,119,60,117,110,115,105,103,110,101,100,32,108,111,110,103,62,0,101,109,115,99,114,105,112,116,101,110,58,58,109,101,109,111,114,121,95,118,105,101,119,60,105,110,116,56,95,116,62,0,101,109,115,99,114,105,112,116,101,110,58,58,109,101,109,111,114,121,95,118,105,101,119,60,117,105,110,116,56,95,116,62,0,101,109,115,99,114,105,112,116,101,110,58,58,109,101,109,111,114,121,95,118,105,101,119,60,105,110,116,49,54,95,116,62,0,101,109,115,99,114,105,112,116,101,110,58,58,109,101,109,111,114,121,95,118,105,101,119,60,117,105,110,116,49,54,95,116,62,0,101,109,115,99,114,105,112,116,101,110,58,58,109,101,109,111,114,121,95,118,105,101,119,60,105,110,116,51,50,95,116,62,0,101,109,115,99,114,105,112,116,101,110,58,58,109,101,109,111,114,121,95,118,105,101,119,60,117,105,110,116,51,50,95,116,62,0,101,109,115,99,114,105,112,116,101,110,58,58,109,101,109,111,114,121,95,118,105,101,119,60,102,108,111,97,116,62,0,101,109,115,99,114,105,112,116,101,110,58,58,109,101,109,111,114,121,95,118,105,101,119,60,100,111,117,98,108,101,62,0,101,109,115,99,114,105,112,116,101,110,58,58,109,101,109,111,114,121,95,118,105,101,119,60,108,111,110,103,32,100,111,117,98,108,101,62,0,78,49,48,101,109,115,99,114,105,112,116,101,110,49,49,109,101,109,111,114,121,95,118,105,101,119,73,101,69,69,0,78,49,48,101,109,115,99,114,105,112,116,101,110,49,49,109,101,109,111,114,121,95,118,105,101,119,73,100,69,69,0,78,49,48,101,109,115,99,114,105,112,116,101,110,49,49,109,101,109,111,114,121,95,118,105,101,119,73,102,69,69,0,78,49,48,101,109,115,99,114,105,112,116,101,110,49,49,109,101,109,111,114,121,95,118,105,101,119,73,109,69,69,0,78,49,48,101,109,115,99,114,105,112,116,101,110,49,49,109,101,109,111,114,121,95,118,105,101,119,73,108,69,69,0,78,49,48,101,109,115,99,114,105,112,116,101,110,49,49,109,101,109,111,114,121,95,118,105,101,119,73,106,69,69,0,78,49,48,101,109,115,99,114,105,112,116,101,110,49,49,109,101,109,111,114,121,95,118,105,101,119,73,105,69,69,0,78,49,48,101,109,115,99,114,105,112,116,101,110,49,49,109,101,109,111,114,121,95,118,105,101,119,73,116,69,69,0,78,49,48,101,109,115,99,114,105,112,116,101,110,49,49,109,101,109,111,114,121,95,118,105,101,119,73,115,69,69,0,78,49,48,101,109,115,99,114,105,112,116,101,110,49,49,109,101,109,111,114,121,95,118,105,101,119,73,104,69,69,0,78,49,48,101,109,115,99,114,105,112,116,101,110,49,49,109,101,109,111,114,121,95,118,105,101,119,73,97,69,69,0,78,49,48,101,109,115,99,114,105,112,116,101,110,49,49,109,101,109,111,114,121,95,118,105,101,119,73,99,69,69,0,78,49,48,101,109,115,99,114,105,112,116,101,110,51,118,97,108,69,0,78,83,116,51,95,95,50,49,50,98,97,115,105,99,95,115,116,114,105,110,103,73,119,78,83,95,49,49,99,104,97,114,95,116,114,97,105,116,115,73,119,69,69,78,83,95,57,97,108,108,111,99,97,116,111,114,73,119,69,69,69,69,0,78,83,116,51,95,95,50,50,49,95,95,98,97,115,105,99,95,115,116,114,105,110,103,95,99,111,109,109,111,110,73,76,98,49,69,69,69,0,78,83,116,51,95,95,50,49,50,98,97,115,105,99,95,115,116,114,105,110,103,73,104,78,83,95,49,49,99,104,97,114,95,116,114,97,105,116,115,73,104,69,69,78,83,95,57,97,108,108,111,99,97,116,111,114,73,104,69,69,69,69,0,78,83,116,51,95,95,50,49,50,98,97,115,105,99,95,115,116,114,105,110,103,73,99,78,83,95,49,49,99,104,97,114,95,116,114,97,105,116,115,73,99,69,69,78,83,95,57,97,108,108,111,99,97,116,111,114,73,99,69,69,69,69,0,17,0,10,0,17,17,17,0,0,0,0,5,0,0,0,0,0,0,9,0,0,0,0,11,0,0,0,0,0,0,0,0,17,0,15,10,17,17,17,3,10,7,0,1,19,9,11,11,0,0,9,6,11,0,0,11,0,6,17,0,0,0,17,17,17,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,11,0,0,0,0,0,0,0,0,17,0,10,10,17,17,17,0,10,0,0,2,0,9,11,0,0,0,9,0,11,0,0,11,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,12,0,0,0,0,0,0,0,0,0,0,0,12,0,0,0,0,12,0,0,0,0,9,12,0,0,0,0,0,12,0,0,12,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,14,0,0,0,0,0,0,0,0,0,0,0,13,0,0,0,4,13,0,0,0,0,9,14,0,0,0,0,0,14,0,0,14,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,16,0,0,0,0,0,0,0,0,0,0,0,15,0,0,0,0,15,0,0,0,0,9,16,0,0,0,0,0,16,0,0,16,0,0,18,0,0,0,18,18,18,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,18,0,0,0,18,18,18,0,0,0,0,0,0,9,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,11,0,0,0,0,0,0,0,0,0,0,0,10,0,0,0,0,10,0,0,0,0,9,11,0,0,0,0,0,11,0,0,11,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,12,0,0,0,0,0,0,0,0,0,0,0,12,0,0,0,0,12,0,0,0,0,9,12,0,0,0,0,0,12,0,0,12,0,0,45,43,32,32,32,48,88,48,120,0,40,110,117,108,108,41,0,45,48,88,43,48,88,32,48,88,45,48,120,43,48,120,32,48,120,0,105,110,102,0,73,78,70,0,110,97,110,0,78,65,78,0,48,49,50,51,52,53,54,55,56,57,65,66,67,68,69,70,46,0,84,33,34,25,13,1,2,3,17,75,28,12,16,4,11,29,18,30,39,104,110,111,112,113,98,32,5,6,15,19,20,21,26,8,22,7,40,36,23,24,9,10,14,27,31,37,35,131,130,125,38,42,43,60,61,62,63,67,71,74,77,88,89,90,91,92,93,94,95,96,97,99,100,101,102,103,105,106,107,108,114,115,116,121,122,123,124,0,73,108,108,101,103,97,108,32,98,121,116,101,32,115,101,113,117,101,110,99,101,0,68,111,109,97,105,110,32,101,114,114,111,114,0,82,101,115,117,108,116,32,110,111,116,32,114,101,112,114,101,115,101,110,116,97,98,108,101,0,78,111,116,32,97,32,116,116,121,0,80,101,114,109,105,115,115,105,111,110,32,100,101,110,105,101,100,0,79,112,101,114,97,116,105,111,110,32,110,111,116,32,112,101,114,109,105,116,116,101,100,0,78,111,32,115,117,99,104,32,102,105,108,101,32,111,114,32,100,105,114,101,99,116,111,114,121,0,78,111,32,115,117,99,104,32,112,114,111,99,101,115,115,0,70,105,108,101,32,101,120,105,115,116,115,0,86,97,108,117,101,32,116,111,111,32,108,97,114,103,101,32,102,111,114,32,100,97,116,97,32,116,121,112,101,0,78,111,32,115,112,97,99,101,32,108,101,102,116,32,111,110,32,100,101,118,105,99,101,0,79,117,116,32,111,102,32,109,101,109,111,114,121,0,82,101,115,111,117,114,99,101,32,98,117,115,121,0,73,110,116,101,114,114,117,112,116,101,100,32,115,121,115,116,101,109,32,99,97,108,108,0,82,101,115,111,117,114,99,101,32,116,101,109,112,111,114,97,114,105,108,121,32,117,110,97,118,97,105,108,97,98,108,101,0,73,110,118,97,108,105,100,32,115,101,101,107,0,67,114,111,115,115,45,100,101,118,105,99,101,32,108,105,110,107,0,82,101,97,100,45,111,110,108,121,32,102,105,108,101,32,115,121,115,116,101,109,0,68,105,114,101,99,116,111,114,121,32,110,111,116,32,101,109,112,116,121,0,67,111,110,110,101,99,116,105,111,110,32,114,101,115,101,116,32,98,121,32,112,101,101,114,0,79,112,101,114,97,116,105,111,110,32,116,105,109,101,100,32,111,117,116,0,67,111,110,110,101,99,116,105,111,110,32,114,101,102,117,115,101,100,0,72,111,115,116,32,105,115,32,100,111,119,110,0,72,111,115,116,32,105,115,32,117,110,114,101,97,99,104,97,98,108,101,0,65,100,100,114,101,115,115,32,105,110,32,117,115,101,0,66,114,111,107,101,110,32,112,105,112,101,0,73,47,79,32,101,114,114,111,114,0,78,111,32,115,117,99,104,32,100,101,118,105,99,101,32,111,114,32,97,100,100,114,101,115,115,0,66,108,111,99,107,32,100,101,118,105,99,101,32,114,101,113,117,105,114,101,100,0,78,111,32,115,117,99,104,32,100,101,118,105,99,101,0,78,111,116,32,97,32,100,105,114,101,99,116,111,114,121,0,73,115,32,97,32,100,105,114,101,99,116,111,114,121,0,84,101,120,116,32,102,105,108,101,32,98,117,115,121,0,69,120,101,99,32,102,111,114,109,97,116,32,101,114,114,111,114,0,73,110,118,97,108,105,100,32,97,114,103,117,109,101,110,116,0,65,114,103,117,109,101,110,116,32,108,105,115,116,32,116,111,111,32,108,111,110,103,0,83,121,109,98,111,108,105,99,32,108,105,110,107,32,108,111,111,112,0,70,105,108,101,110,97,109,101,32,116,111,111,32,108,111,110,103,0,84,111,111,32,109,97,110,121,32,111,112,101,110,32,102,105,108,101,115,32,105,110,32,115,121,115,116,101,109,0,78,111,32,102,105,108,101,32,100,101,115,99,114,105,112,116,111,114,115,32,97,118,97,105,108,97,98,108,101,0,66,97,100,32,102,105,108,101,32,100,101,115,99,114,105,112,116,111,114,0,78,111,32,99,104,105,108,100,32,112,114,111,99,101,115,115,0,66,97,100,32,97,100,100,114,101,115,115,0,70,105,108,101,32,116,111,111,32,108,97,114,103,101,0,84,111,111,32,109,97,110,121,32,108,105,110,107,115,0,78,111,32,108,111,99,107,115,32,97,118,97,105,108,97,98,108,101,0,82,101,115,111,117,114,99,101,32,100,101,97,100,108,111,99,107,32,119,111,117,108,100,32,111,99,99,117,114,0,83,116,97,116,101,32,110,111,116,32,114,101,99,111,118,101,114,97,98,108,101,0,80,114,101,118,105,111,117,115,32,111,119,110,101,114,32,100,105,101,100,0,79,112,101,114,97,116,105,111,110,32,99,97,110,99,101,108,101,100,0,70,117,110,99,116,105,111,110,32,110,111,116,32,105,109,112,108,101,109,101,110,116,101,100,0,78,111,32,109,101,115,115,97,103,101,32,111,102,32,100,101,115,105,114,101,100,32,116,121,112,101,0,73,100,101,110,116,105,102,105,101,114,32,114,101,109,111,118,101,100,0,68,101,118,105,99,101,32,110,111,116,32,97,32,115,116,114,101,97,109,0,78,111,32,100,97,116,97,32,97,118,97,105,108,97,98,108,101,0,68,101,118,105,99,101,32,116,105,109,101,111,117,116,0,79,117,116,32,111,102,32,115,116,114,101,97,109,115,32,114,101,115,111,117,114,99,101,115,0,76,105,110,107,32,104,97,115,32,98,101,101,110,32,115,101,118,101,114,101,100,0,80,114,111,116,111,99,111,108,32,101,114,114,111,114,0,66,97,100,32,109,101,115,115,97,103,101,0,70,105,108,101,32,100,101,115,99,114,105,112,116,111,114,32,105,110,32,98,97,100,32,115,116,97,116,101,0,78,111,116,32,97,32,115,111,99,107,101,116,0,68,101,115,116,105,110,97,116,105,111,110,32,97,100,100,114,101,115,115,32,114,101,113,117,105,114,101,100,0,77,101,115,115,97,103,101,32,116,111,111,32,108,97,114,103,101,0,80,114,111,116,111,99,111,108,32,119,114,111,110,103,32,116,121,112,101,32,102,111,114,32,115,111,99,107,101,116,0,80,114,111,116,111,99,111,108,32,110,111,116,32,97,118,97,105,108,97,98,108,101,0,80,114,111,116,111,99,111,108,32,110,111,116,32,115,117,112,112,111,114,116,101,100,0,83,111,99,107,101,116,32,116,121,112,101,32,110,111,116,32,115,117,112,112,111,114,116,101,100,0,78,111,116,32,115,117,112,112,111,114,116,101,100,0,80,114,111,116,111,99,111,108,32,102,97,109,105,108,121,32,110,111,116,32,115,117,112,112,111,114,116,101,100,0,65,100,100,114,101,115,115,32,102,97,109,105,108,121,32,110,111,116,32,115,117,112,112,111,114,116,101,100,32,98,121,32,112,114,111,116,111,99,111,108,0,65,100,100,114,101,115,115,32,110,111,116,32,97,118,97,105,108,97,98,108,101,0,78,101,116,119,111,114,107,32,105,115,32,100,111,119,110,0,78,101,116,119,111,114,107,32,117,110,114,101,97,99,104,97,98,108,101,0,67,111,110,110,101,99,116,105,111,110,32,114,101,115,101,116,32,98,121,32,110,101,116,119,111,114,107,0,67,111,110,110,101,99,116,105,111,110,32,97,98,111,114,116,101,100,0,78,111,32,98,117,102,102,101,114,32,115,112,97,99,101,32,97,118,97,105,108,97,98,108,101,0,83,111,99,107,101,116,32,105,115,32,99,111,110,110,101,99,116,101,100,0,83,111,99,107,101,116,32,110,111,116,32,99,111,110,110,101,99,116,101,100,0,67,97,110,110,111,116,32,115,101,110,100,32,97,102,116,101,114,32,115,111,99,107,101,116,32,115,104,117,116,100,111,119,110,0,79,112,101,114,97,116,105,111,110,32,97,108,114,101,97,100,121,32,105,110,32,112,114,111,103,114,101,115,115,0,79,112,101,114,97,116,105,111,110,32,105,110,32,112,114,111,103,114,101,115,115,0,83,116,97,108,101,32,102,105,108,101,32,104,97,110,100,108,101,0,82,101,109,111,116,101,32,73,47,79,32,101,114,114,111,114,0,81,117,111,116,97,32,101,120,99,101,101,100,101,100,0,78,111,32,109,101,100,105,117,109,32,102,111,117,110,100,0,87,114,111,110,103,32,109,101,100,105,117,109,32,116,121,112,101,0,78,111,32,101,114,114,111,114,32,105,110,102,111,114,109,97,116,105,111,110,0,0,116,101,114,109,105,110,97,116,105,110,103,32,119,105,116,104,32,37,115,32,101,120,99,101,112,116,105,111,110,32,111,102,32,116,121,112,101,32,37,115,58,32,37,115,0,116,101,114,109,105,110,97,116,105,110,103,32,119,105,116,104,32,37,115,32,101,120,99,101,112,116,105,111,110,32,111,102,32,116,121,112,101,32,37,115,0,116,101,114,109,105,110,97,116,105,110,103,32,119,105,116,104,32,37,115,32,102,111,114,101,105,103,110,32,101,120,99,101,112,116,105,111,110,0,116,101,114,109,105,110,97,116,105,110,103,0,117,110,99,97,117,103,104,116,0,83,116,57,101,120,99,101,112,116,105,111,110,0,78,49,48,95,95,99,120,120,97,98,105,118,49,49,54,95,95,115,104,105,109,95,116,121,112,101,95,105,110,102,111,69,0,83,116,57,116,121,112,101,95,105,110,102,111,0,78,49,48,95,95,99,120,120,97,98,105,118,49,50,48,95,95,115,105,95,99,108,97,115,115,95,116,121,112,101,95,105,110,102,111,69,0,78,49,48,95,95,99,120,120,97,98,105,118,49,49,55,95,95,99,108,97,115,115,95,116,121,112,101,95,105,110,102,111,69,0,112,116,104,114,101,97,100,95,111,110,99,101,32,102,97,105,108,117,114,101,32,105,110,32,95,95,99,120,97,95,103,101,116,95,103,108,111,98,97,108,115,95,102,97,115,116,40,41,0,99,97,110,110,111,116,32,99,114,101,97,116,101,32,112,116,104,114,101,97,100,32,107,101,121,32,102,111,114,32,95,95,99,120,97,95,103,101,116,95,103,108,111,98,97,108,115,40,41,0,99,97,110,110,111,116,32,122,101,114,111,32,111,117,116,32,116,104,114,101,97,100,32,118,97,108,117,101,32,102,111,114,32,95,95,99,120,97,95,103,101,116,95,103,108,111,98,97,108,115,40,41,0,116,101,114,109,105,110,97,116,101,95,104,97,110,100,108,101,114,32,117,110,101,120,112,101,99,116,101,100,108,121,32,114,101,116,117,114,110,101,100,0,116,101,114,109,105,110,97,116,101,95,104,97,110,100,108,101,114,32,117,110,101,120,112,101,99,116,101,100,108,121,32,116,104,114,101,119,32,97,110,32,101,120,99,101,112,116,105,111,110,0,115,116,100,58,58,98,97,100,95,97,108,108,111,99,0,83,116,57,98,97,100,95,97,108,108,111,99,0,78,49,48,95,95,99,120,120,97,98,105,118,49,49,57,95,95,112,111,105,110,116,101,114,95,116,121,112,101,95,105,110,102,111,69,0,78,49,48,95,95,99,120,120,97,98,105,118,49,49,55,95,95,112,98,97,115,101,95,116,121,112,101,95,105,110,102,111,69,0,78,49,48,95,95,99,120,120,97,98,105,118,49,50,51,95,95,102,117,110,100,97,109,101,110,116,97,108,95,116,121,112,101,95,105,110,102,111,69,0,118,0,68,110,0,98,0,99,0,104,0,97,0,115,0,116,0,105,0,106,0,108,0,109,0,102,0,100,0,78,49,48,95,95,99,120,120,97,98,105,118,49,50,49,95,95,118,109,105,95,99,108,97,115,115,95,116,121,112,101,95,105,110,102,111,69,0], "i8", ALLOC_NONE, GLOBAL_BASE);





/* no memory initializer */
var tempDoublePtr = STATICTOP; STATICTOP += 16;

assert(tempDoublePtr % 8 == 0);

function copyTempFloat(ptr) { // functions, because inlining this code increases code size too much

  HEAP8[tempDoublePtr] = HEAP8[ptr];

  HEAP8[tempDoublePtr+1] = HEAP8[ptr+1];

  HEAP8[tempDoublePtr+2] = HEAP8[ptr+2];

  HEAP8[tempDoublePtr+3] = HEAP8[ptr+3];

}

function copyTempDouble(ptr) {

  HEAP8[tempDoublePtr] = HEAP8[ptr];

  HEAP8[tempDoublePtr+1] = HEAP8[ptr+1];

  HEAP8[tempDoublePtr+2] = HEAP8[ptr+2];

  HEAP8[tempDoublePtr+3] = HEAP8[ptr+3];

  HEAP8[tempDoublePtr+4] = HEAP8[ptr+4];

  HEAP8[tempDoublePtr+5] = HEAP8[ptr+5];

  HEAP8[tempDoublePtr+6] = HEAP8[ptr+6];

  HEAP8[tempDoublePtr+7] = HEAP8[ptr+7];

}

// {{PRE_LIBRARY}}


  function ___cxa_allocate_exception(size) {
      return _malloc(size);
    }

  
  function __ZSt18uncaught_exceptionv() { // std::uncaught_exception()
      return !!__ZSt18uncaught_exceptionv.uncaught_exception;
    }
  
  var EXCEPTIONS={last:0,caught:[],infos:{},deAdjust:function (adjusted) {
        if (!adjusted || EXCEPTIONS.infos[adjusted]) return adjusted;
        for (var ptr in EXCEPTIONS.infos) {
          var info = EXCEPTIONS.infos[ptr];
          if (info.adjusted === adjusted) {
            return ptr;
          }
        }
        return adjusted;
      },addRef:function (ptr) {
        if (!ptr) return;
        var info = EXCEPTIONS.infos[ptr];
        info.refcount++;
      },decRef:function (ptr) {
        if (!ptr) return;
        var info = EXCEPTIONS.infos[ptr];
        assert(info.refcount > 0);
        info.refcount--;
        // A rethrown exception can reach refcount 0; it must not be discarded
        // Its next handler will clear the rethrown flag and addRef it, prior to
        // final decRef and destruction here
        if (info.refcount === 0 && !info.rethrown) {
          if (info.destructor) {
            Module['dynCall_vi'](info.destructor, ptr);
          }
          delete EXCEPTIONS.infos[ptr];
          ___cxa_free_exception(ptr);
        }
      },clearRef:function (ptr) {
        if (!ptr) return;
        var info = EXCEPTIONS.infos[ptr];
        info.refcount = 0;
      }};function ___cxa_begin_catch(ptr) {
      var info = EXCEPTIONS.infos[ptr];
      if (info && !info.caught) {
        info.caught = true;
        __ZSt18uncaught_exceptionv.uncaught_exception--;
      }
      if (info) info.rethrown = false;
      EXCEPTIONS.caught.push(ptr);
      EXCEPTIONS.addRef(EXCEPTIONS.deAdjust(ptr));
      return ptr;
    }

  
  function ___cxa_free_exception(ptr) {
      try {
        return _free(ptr);
      } catch(e) { // XXX FIXME
        Module.printErr('exception during cxa_free_exception: ' + e);
      }
    }function ___cxa_end_catch() {
      // Clear state flag.
      Module['setThrew'](0);
      // Call destructor if one is registered then clear it.
      var ptr = EXCEPTIONS.caught.pop();
      if (ptr) {
        EXCEPTIONS.decRef(EXCEPTIONS.deAdjust(ptr));
        EXCEPTIONS.last = 0; // XXX in decRef?
      }
    }

  function ___cxa_find_matching_catch_2() {
          return ___cxa_find_matching_catch.apply(null, arguments);
        }

  function ___cxa_find_matching_catch_3() {
          return ___cxa_find_matching_catch.apply(null, arguments);
        }

  
  
  function ___resumeException(ptr) {
      if (!EXCEPTIONS.last) { EXCEPTIONS.last = ptr; }
      throw ptr;
    }function ___cxa_find_matching_catch() {
      var thrown = EXCEPTIONS.last;
      if (!thrown) {
        // just pass through the null ptr
        return ((setTempRet0(0),0)|0);
      }
      var info = EXCEPTIONS.infos[thrown];
      var throwntype = info.type;
      if (!throwntype) {
        // just pass through the thrown ptr
        return ((setTempRet0(0),thrown)|0);
      }
      var typeArray = Array.prototype.slice.call(arguments);
  
      var pointer = Module['___cxa_is_pointer_type'](throwntype);
      // can_catch receives a **, add indirection
      if (!___cxa_find_matching_catch.buffer) ___cxa_find_matching_catch.buffer = _malloc(4);
      HEAP32[((___cxa_find_matching_catch.buffer)>>2)]=thrown;
      thrown = ___cxa_find_matching_catch.buffer;
      // The different catch blocks are denoted by different types.
      // Due to inheritance, those types may not precisely match the
      // type of the thrown object. Find one which matches, and
      // return the type of the catch block which should be called.
      for (var i = 0; i < typeArray.length; i++) {
        if (typeArray[i] && Module['___cxa_can_catch'](typeArray[i], throwntype, thrown)) {
          thrown = HEAP32[((thrown)>>2)]; // undo indirection
          info.adjusted = thrown;
          return ((setTempRet0(typeArray[i]),thrown)|0);
        }
      }
      // Shouldn't happen unless we have bogus data in typeArray
      // or encounter a type for which emscripten doesn't have suitable
      // typeinfo defined. Best-efforts match just in case.
      thrown = HEAP32[((thrown)>>2)]; // undo indirection
      return ((setTempRet0(throwntype),thrown)|0);
    }function ___cxa_throw(ptr, type, destructor) {
      EXCEPTIONS.infos[ptr] = {
        ptr: ptr,
        adjusted: ptr,
        type: type,
        destructor: destructor,
        refcount: 0,
        caught: false,
        rethrown: false
      };
      EXCEPTIONS.last = ptr;
      if (!("uncaught_exception" in __ZSt18uncaught_exceptionv)) {
        __ZSt18uncaught_exceptionv.uncaught_exception = 1;
      } else {
        __ZSt18uncaught_exceptionv.uncaught_exception++;
      }
      throw ptr;
    }

  function ___gxx_personality_v0() {
    }

  function ___lock() {}


  
  var SYSCALLS={varargs:0,get:function (varargs) {
        SYSCALLS.varargs += 4;
        var ret = HEAP32[(((SYSCALLS.varargs)-(4))>>2)];
        return ret;
      },getStr:function () {
        var ret = Pointer_stringify(SYSCALLS.get());
        return ret;
      },get64:function () {
        var low = SYSCALLS.get(), high = SYSCALLS.get();
        if (low >= 0) assert(high === 0);
        else assert(high === -1);
        return low;
      },getZero:function () {
        assert(SYSCALLS.get() === 0);
      }};function ___syscall140(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // llseek
      var stream = SYSCALLS.getStreamFromFD(), offset_high = SYSCALLS.get(), offset_low = SYSCALLS.get(), result = SYSCALLS.get(), whence = SYSCALLS.get();
      // NOTE: offset_high is unused - Emscripten's off_t is 32-bit
      var offset = offset_low;
      FS.llseek(stream, offset, whence);
      HEAP32[((result)>>2)]=stream.position;
      if (stream.getdents && offset === 0 && whence === 0) stream.getdents = null; // reset readdir state
      return 0;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  
  function flush_NO_FILESYSTEM() {
      // flush anything remaining in the buffers during shutdown
      var fflush = Module["_fflush"];
      if (fflush) fflush(0);
      var printChar = ___syscall146.printChar;
      if (!printChar) return;
      var buffers = ___syscall146.buffers;
      if (buffers[1].length) printChar(1, 10);
      if (buffers[2].length) printChar(2, 10);
    }function ___syscall146(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // writev
      // hack to support printf in NO_FILESYSTEM
      var stream = SYSCALLS.get(), iov = SYSCALLS.get(), iovcnt = SYSCALLS.get();
      var ret = 0;
      if (!___syscall146.buffers) {
        ___syscall146.buffers = [null, [], []]; // 1 => stdout, 2 => stderr
        ___syscall146.printChar = function(stream, curr) {
          var buffer = ___syscall146.buffers[stream];
          assert(buffer);
          if (curr === 0 || curr === 10) {
            (stream === 1 ? Module['print'] : Module['printErr'])(UTF8ArrayToString(buffer, 0));
            buffer.length = 0;
          } else {
            buffer.push(curr);
          }
        };
      }
      for (var i = 0; i < iovcnt; i++) {
        var ptr = HEAP32[(((iov)+(i*8))>>2)];
        var len = HEAP32[(((iov)+(i*8 + 4))>>2)];
        for (var j = 0; j < len; j++) {
          ___syscall146.printChar(stream, HEAPU8[ptr+j]);
        }
        ret += len;
      }
      return ret;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  function ___syscall54(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // ioctl
      return 0;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  function ___syscall6(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // close
      var stream = SYSCALLS.getStreamFromFD();
      FS.close(stream);
      return 0;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  
  
   
  
   
  
  var cttz_i8 = allocate([8,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,5,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,6,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,5,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,7,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,5,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,6,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,5,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0], "i8", ALLOC_STATIC);   

  function ___unlock() {}

   

  
  var structRegistrations={};
  
  function runDestructors(destructors) {
      while (destructors.length) {
          var ptr = destructors.pop();
          var del = destructors.pop();
          del(ptr);
      }
    }
  
  function simpleReadValueFromPointer(pointer) {
      return this['fromWireType'](HEAPU32[pointer >> 2]);
    }
  
  
  var awaitingDependencies={};
  
  var registeredTypes={};
  
  var typeDependencies={};
  
  
  
  
  
  
  var char_0=48;
  
  var char_9=57;function makeLegalFunctionName(name) {
      if (undefined === name) {
          return '_unknown';
      }
      name = name.replace(/[^a-zA-Z0-9_]/g, '$');
      var f = name.charCodeAt(0);
      if (f >= char_0 && f <= char_9) {
          return '_' + name;
      } else {
          return name;
      }
    }function createNamedFunction(name, body) {
      name = makeLegalFunctionName(name);
      /*jshint evil:true*/
      return new Function(
          "body",
          "return function " + name + "() {\n" +
          "    \"use strict\";" +
          "    return body.apply(this, arguments);\n" +
          "};\n"
      )(body);
    }function extendError(baseErrorType, errorName) {
      var errorClass = createNamedFunction(errorName, function(message) {
          this.name = errorName;
          this.message = message;
  
          var stack = (new Error(message)).stack;
          if (stack !== undefined) {
              this.stack = this.toString() + '\n' +
                  stack.replace(/^Error(:[^\n]*)?\n/, '');
          }
      });
      errorClass.prototype = Object.create(baseErrorType.prototype);
      errorClass.prototype.constructor = errorClass;
      errorClass.prototype.toString = function() {
          if (this.message === undefined) {
              return this.name;
          } else {
              return this.name + ': ' + this.message;
          }
      };
  
      return errorClass;
    }var InternalError=undefined;function throwInternalError(message) {
      throw new InternalError(message);
    }function whenDependentTypesAreResolved(myTypes, dependentTypes, getTypeConverters) {
      myTypes.forEach(function(type) {
          typeDependencies[type] = dependentTypes;
      });
  
      function onComplete(typeConverters) {
          var myTypeConverters = getTypeConverters(typeConverters);
          if (myTypeConverters.length !== myTypes.length) {
              throwInternalError('Mismatched type converter count');
          }
          for (var i = 0; i < myTypes.length; ++i) {
              registerType(myTypes[i], myTypeConverters[i]);
          }
      }
  
      var typeConverters = new Array(dependentTypes.length);
      var unregisteredTypes = [];
      var registered = 0;
      dependentTypes.forEach(function(dt, i) {
          if (registeredTypes.hasOwnProperty(dt)) {
              typeConverters[i] = registeredTypes[dt];
          } else {
              unregisteredTypes.push(dt);
              if (!awaitingDependencies.hasOwnProperty(dt)) {
                  awaitingDependencies[dt] = [];
              }
              awaitingDependencies[dt].push(function() {
                  typeConverters[i] = registeredTypes[dt];
                  ++registered;
                  if (registered === unregisteredTypes.length) {
                      onComplete(typeConverters);
                  }
              });
          }
      });
      if (0 === unregisteredTypes.length) {
          onComplete(typeConverters);
      }
    }function __embind_finalize_value_object(structType) {
      var reg = structRegistrations[structType];
      delete structRegistrations[structType];
  
      var rawConstructor = reg.rawConstructor;
      var rawDestructor = reg.rawDestructor;
      var fieldRecords = reg.fields;
      var fieldTypes = fieldRecords.map(function(field) { return field.getterReturnType; }).
                concat(fieldRecords.map(function(field) { return field.setterArgumentType; }));
      whenDependentTypesAreResolved([structType], fieldTypes, function(fieldTypes) {
          var fields = {};
          fieldRecords.forEach(function(field, i) {
              var fieldName = field.fieldName;
              var getterReturnType = fieldTypes[i];
              var getter = field.getter;
              var getterContext = field.getterContext;
              var setterArgumentType = fieldTypes[i + fieldRecords.length];
              var setter = field.setter;
              var setterContext = field.setterContext;
              fields[fieldName] = {
                  read: function(ptr) {
                      return getterReturnType['fromWireType'](
                          getter(getterContext, ptr));
                  },
                  write: function(ptr, o) {
                      var destructors = [];
                      setter(setterContext, ptr, setterArgumentType['toWireType'](destructors, o));
                      runDestructors(destructors);
                  }
              };
          });
  
          return [{
              name: reg.name,
              'fromWireType': function(ptr) {
                  var rv = {};
                  for (var i in fields) {
                      rv[i] = fields[i].read(ptr);
                  }
                  rawDestructor(ptr);
                  return rv;
              },
              'toWireType': function(destructors, o) {
                  // todo: Here we have an opportunity for -O3 level "unsafe" optimizations:
                  // assume all fields are present without checking.
                  for (var fieldName in fields) {
                      if (!(fieldName in o)) {
                          throw new TypeError('Missing field');
                      }
                  }
                  var ptr = rawConstructor();
                  for (fieldName in fields) {
                      fields[fieldName].write(ptr, o[fieldName]);
                  }
                  if (destructors !== null) {
                      destructors.push(rawDestructor, ptr);
                  }
                  return ptr;
              },
              'argPackAdvance': 8,
              'readValueFromPointer': simpleReadValueFromPointer,
              destructorFunction: rawDestructor,
          }];
      });
    }

  
  function getShiftFromSize(size) {
      switch (size) {
          case 1: return 0;
          case 2: return 1;
          case 4: return 2;
          case 8: return 3;
          default:
              throw new TypeError('Unknown type size: ' + size);
      }
    }
  
  
  
  function embind_init_charCodes() {
      var codes = new Array(256);
      for (var i = 0; i < 256; ++i) {
          codes[i] = String.fromCharCode(i);
      }
      embind_charCodes = codes;
    }var embind_charCodes=undefined;function readLatin1String(ptr) {
      var ret = "";
      var c = ptr;
      while (HEAPU8[c]) {
          ret += embind_charCodes[HEAPU8[c++]];
      }
      return ret;
    }
  
  
  
  var BindingError=undefined;function throwBindingError(message) {
      throw new BindingError(message);
    }function registerType(rawType, registeredInstance, options) {
      options = options || {};
  
      if (!('argPackAdvance' in registeredInstance)) {
          throw new TypeError('registerType registeredInstance requires argPackAdvance');
      }
  
      var name = registeredInstance.name;
      if (!rawType) {
          throwBindingError('type "' + name + '" must have a positive integer typeid pointer');
      }
      if (registeredTypes.hasOwnProperty(rawType)) {
          if (options.ignoreDuplicateRegistrations) {
              return;
          } else {
              throwBindingError("Cannot register type '" + name + "' twice");
          }
      }
  
      registeredTypes[rawType] = registeredInstance;
      delete typeDependencies[rawType];
  
      if (awaitingDependencies.hasOwnProperty(rawType)) {
          var callbacks = awaitingDependencies[rawType];
          delete awaitingDependencies[rawType];
          callbacks.forEach(function(cb) {
              cb();
          });
      }
    }function __embind_register_bool(rawType, name, size, trueValue, falseValue) {
      var shift = getShiftFromSize(size);
  
      name = readLatin1String(name);
      registerType(rawType, {
          name: name,
          'fromWireType': function(wt) {
              // ambiguous emscripten ABI: sometimes return values are
              // true or false, and sometimes integers (0 or 1)
              return !!wt;
          },
          'toWireType': function(destructors, o) {
              return o ? trueValue : falseValue;
          },
          'argPackAdvance': 8,
          'readValueFromPointer': function(pointer) {
              // TODO: if heap is fixed (like in asm.js) this could be executed outside
              var heap;
              if (size === 1) {
                  heap = HEAP8;
              } else if (size === 2) {
                  heap = HEAP16;
              } else if (size === 4) {
                  heap = HEAP32;
              } else {
                  throw new TypeError("Unknown boolean type size: " + name);
              }
              return this['fromWireType'](heap[pointer >> shift]);
          },
          destructorFunction: null, // This type does not need a destructor
      });
    }

  
  
  
  function ClassHandle_isAliasOf(other) {
      if (!(this instanceof ClassHandle)) {
          return false;
      }
      if (!(other instanceof ClassHandle)) {
          return false;
      }
  
      var leftClass = this.$$.ptrType.registeredClass;
      var left = this.$$.ptr;
      var rightClass = other.$$.ptrType.registeredClass;
      var right = other.$$.ptr;
  
      while (leftClass.baseClass) {
          left = leftClass.upcast(left);
          leftClass = leftClass.baseClass;
      }
  
      while (rightClass.baseClass) {
          right = rightClass.upcast(right);
          rightClass = rightClass.baseClass;
      }
  
      return leftClass === rightClass && left === right;
    }
  
  
  function shallowCopyInternalPointer(o) {
      return {
          count: o.count,
          deleteScheduled: o.deleteScheduled,
          preservePointerOnDelete: o.preservePointerOnDelete,
          ptr: o.ptr,
          ptrType: o.ptrType,
          smartPtr: o.smartPtr,
          smartPtrType: o.smartPtrType,
      };
    }
  
  function throwInstanceAlreadyDeleted(obj) {
      function getInstanceTypeName(handle) {
        return handle.$$.ptrType.registeredClass.name;
      }
      throwBindingError(getInstanceTypeName(obj) + ' instance already deleted');
    }function ClassHandle_clone() {
      if (!this.$$.ptr) {
          throwInstanceAlreadyDeleted(this);
      }
  
      if (this.$$.preservePointerOnDelete) {
          this.$$.count.value += 1;
          return this;
      } else {
          var clone = Object.create(Object.getPrototypeOf(this), {
              $$: {
                  value: shallowCopyInternalPointer(this.$$),
              }
          });
  
          clone.$$.count.value += 1;
          clone.$$.deleteScheduled = false;
          return clone;
      }
    }
  
  
  function runDestructor(handle) {
      var $$ = handle.$$;
      if ($$.smartPtr) {
          $$.smartPtrType.rawDestructor($$.smartPtr);
      } else {
          $$.ptrType.registeredClass.rawDestructor($$.ptr);
      }
    }function ClassHandle_delete() {
      if (!this.$$.ptr) {
          throwInstanceAlreadyDeleted(this);
      }
  
      if (this.$$.deleteScheduled && !this.$$.preservePointerOnDelete) {
          throwBindingError('Object already scheduled for deletion');
      }
  
      this.$$.count.value -= 1;
      var toDelete = 0 === this.$$.count.value;
      if (toDelete) {
          runDestructor(this);
      }
      if (!this.$$.preservePointerOnDelete) {
          this.$$.smartPtr = undefined;
          this.$$.ptr = undefined;
      }
    }
  
  function ClassHandle_isDeleted() {
      return !this.$$.ptr;
    }
  
  
  var delayFunction=undefined;
  
  var deletionQueue=[];
  
  function flushPendingDeletes() {
      while (deletionQueue.length) {
          var obj = deletionQueue.pop();
          obj.$$.deleteScheduled = false;
          obj['delete']();
      }
    }function ClassHandle_deleteLater() {
      if (!this.$$.ptr) {
          throwInstanceAlreadyDeleted(this);
      }
      if (this.$$.deleteScheduled && !this.$$.preservePointerOnDelete) {
          throwBindingError('Object already scheduled for deletion');
      }
      deletionQueue.push(this);
      if (deletionQueue.length === 1 && delayFunction) {
          delayFunction(flushPendingDeletes);
      }
      this.$$.deleteScheduled = true;
      return this;
    }function init_ClassHandle() {
      ClassHandle.prototype['isAliasOf'] = ClassHandle_isAliasOf;
      ClassHandle.prototype['clone'] = ClassHandle_clone;
      ClassHandle.prototype['delete'] = ClassHandle_delete;
      ClassHandle.prototype['isDeleted'] = ClassHandle_isDeleted;
      ClassHandle.prototype['deleteLater'] = ClassHandle_deleteLater;
    }function ClassHandle() {
    }
  
  var registeredPointers={};
  
  
  function ensureOverloadTable(proto, methodName, humanName) {
      if (undefined === proto[methodName].overloadTable) {
          var prevFunc = proto[methodName];
          // Inject an overload resolver function that routes to the appropriate overload based on the number of arguments.
          proto[methodName] = function() {
              // TODO This check can be removed in -O3 level "unsafe" optimizations.
              if (!proto[methodName].overloadTable.hasOwnProperty(arguments.length)) {
                  throwBindingError("Function '" + humanName + "' called with an invalid number of arguments (" + arguments.length + ") - expects one of (" + proto[methodName].overloadTable + ")!");
              }
              return proto[methodName].overloadTable[arguments.length].apply(this, arguments);
          };
          // Move the previous function into the overload table.
          proto[methodName].overloadTable = [];
          proto[methodName].overloadTable[prevFunc.argCount] = prevFunc;
      }
    }function exposePublicSymbol(name, value, numArguments) {
      if (Module.hasOwnProperty(name)) {
          if (undefined === numArguments || (undefined !== Module[name].overloadTable && undefined !== Module[name].overloadTable[numArguments])) {
              throwBindingError("Cannot register public name '" + name + "' twice");
          }
  
          // We are exposing a function with the same name as an existing function. Create an overload table and a function selector
          // that routes between the two.
          ensureOverloadTable(Module, name, name);
          if (Module.hasOwnProperty(numArguments)) {
              throwBindingError("Cannot register multiple overloads of a function with the same number of arguments (" + numArguments + ")!");
          }
          // Add the new function into the overload table.
          Module[name].overloadTable[numArguments] = value;
      }
      else {
          Module[name] = value;
          if (undefined !== numArguments) {
              Module[name].numArguments = numArguments;
          }
      }
    }
  
  function RegisteredClass(
      name,
      constructor,
      instancePrototype,
      rawDestructor,
      baseClass,
      getActualType,
      upcast,
      downcast
    ) {
      this.name = name;
      this.constructor = constructor;
      this.instancePrototype = instancePrototype;
      this.rawDestructor = rawDestructor;
      this.baseClass = baseClass;
      this.getActualType = getActualType;
      this.upcast = upcast;
      this.downcast = downcast;
      this.pureVirtualFunctions = [];
    }
  
  
  
  function upcastPointer(ptr, ptrClass, desiredClass) {
      while (ptrClass !== desiredClass) {
          if (!ptrClass.upcast) {
              throwBindingError("Expected null or instance of " + desiredClass.name + ", got an instance of " + ptrClass.name);
          }
          ptr = ptrClass.upcast(ptr);
          ptrClass = ptrClass.baseClass;
      }
      return ptr;
    }function constNoSmartPtrRawPointerToWireType(destructors, handle) {
      if (handle === null) {
          if (this.isReference) {
              throwBindingError('null is not a valid ' + this.name);
          }
          return 0;
      }
  
      if (!handle.$$) {
          throwBindingError('Cannot pass "' + _embind_repr(handle) + '" as a ' + this.name);
      }
      if (!handle.$$.ptr) {
          throwBindingError('Cannot pass deleted object as a pointer of type ' + this.name);
      }
      var handleClass = handle.$$.ptrType.registeredClass;
      var ptr = upcastPointer(handle.$$.ptr, handleClass, this.registeredClass);
      return ptr;
    }
  
  function genericPointerToWireType(destructors, handle) {
      var ptr;
      if (handle === null) {
          if (this.isReference) {
              throwBindingError('null is not a valid ' + this.name);
          }
  
          if (this.isSmartPointer) {
              ptr = this.rawConstructor();
              if (destructors !== null) {
                  destructors.push(this.rawDestructor, ptr);
              }
              return ptr;
          } else {
              return 0;
          }
      }
  
      if (!handle.$$) {
          throwBindingError('Cannot pass "' + _embind_repr(handle) + '" as a ' + this.name);
      }
      if (!handle.$$.ptr) {
          throwBindingError('Cannot pass deleted object as a pointer of type ' + this.name);
      }
      if (!this.isConst && handle.$$.ptrType.isConst) {
          throwBindingError('Cannot convert argument of type ' + (handle.$$.smartPtrType ? handle.$$.smartPtrType.name : handle.$$.ptrType.name) + ' to parameter type ' + this.name);
      }
      var handleClass = handle.$$.ptrType.registeredClass;
      ptr = upcastPointer(handle.$$.ptr, handleClass, this.registeredClass);
  
      if (this.isSmartPointer) {
          // TODO: this is not strictly true
          // We could support BY_EMVAL conversions from raw pointers to smart pointers
          // because the smart pointer can hold a reference to the handle
          if (undefined === handle.$$.smartPtr) {
              throwBindingError('Passing raw pointer to smart pointer is illegal');
          }
  
          switch (this.sharingPolicy) {
              case 0: // NONE
                  // no upcasting
                  if (handle.$$.smartPtrType === this) {
                      ptr = handle.$$.smartPtr;
                  } else {
                      throwBindingError('Cannot convert argument of type ' + (handle.$$.smartPtrType ? handle.$$.smartPtrType.name : handle.$$.ptrType.name) + ' to parameter type ' + this.name);
                  }
                  break;
  
              case 1: // INTRUSIVE
                  ptr = handle.$$.smartPtr;
                  break;
  
              case 2: // BY_EMVAL
                  if (handle.$$.smartPtrType === this) {
                      ptr = handle.$$.smartPtr;
                  } else {
                      var clonedHandle = handle['clone']();
                      ptr = this.rawShare(
                          ptr,
                          __emval_register(function() {
                              clonedHandle['delete']();
                          })
                      );
                      if (destructors !== null) {
                          destructors.push(this.rawDestructor, ptr);
                      }
                  }
                  break;
  
              default:
                  throwBindingError('Unsupporting sharing policy');
          }
      }
      return ptr;
    }
  
  function nonConstNoSmartPtrRawPointerToWireType(destructors, handle) {
      if (handle === null) {
          if (this.isReference) {
              throwBindingError('null is not a valid ' + this.name);
          }
          return 0;
      }
  
      if (!handle.$$) {
          throwBindingError('Cannot pass "' + _embind_repr(handle) + '" as a ' + this.name);
      }
      if (!handle.$$.ptr) {
          throwBindingError('Cannot pass deleted object as a pointer of type ' + this.name);
      }
      if (handle.$$.ptrType.isConst) {
          throwBindingError('Cannot convert argument of type ' + handle.$$.ptrType.name + ' to parameter type ' + this.name);
      }
      var handleClass = handle.$$.ptrType.registeredClass;
      var ptr = upcastPointer(handle.$$.ptr, handleClass, this.registeredClass);
      return ptr;
    }
  
  
  function RegisteredPointer_getPointee(ptr) {
      if (this.rawGetPointee) {
          ptr = this.rawGetPointee(ptr);
      }
      return ptr;
    }
  
  function RegisteredPointer_destructor(ptr) {
      if (this.rawDestructor) {
          this.rawDestructor(ptr);
      }
    }
  
  function RegisteredPointer_deleteObject(handle) {
      if (handle !== null) {
          handle['delete']();
      }
    }
  
  
  function downcastPointer(ptr, ptrClass, desiredClass) {
      if (ptrClass === desiredClass) {
          return ptr;
      }
      if (undefined === desiredClass.baseClass) {
          return null; // no conversion
      }
  
      var rv = downcastPointer(ptr, ptrClass, desiredClass.baseClass);
      if (rv === null) {
          return null;
      }
      return desiredClass.downcast(rv);
    }
  
  
  
  
  function getInheritedInstanceCount() {
      return Object.keys(registeredInstances).length;
    }
  
  function getLiveInheritedInstances() {
      var rv = [];
      for (var k in registeredInstances) {
          if (registeredInstances.hasOwnProperty(k)) {
              rv.push(registeredInstances[k]);
          }
      }
      return rv;
    }
  
  function setDelayFunction(fn) {
      delayFunction = fn;
      if (deletionQueue.length && delayFunction) {
          delayFunction(flushPendingDeletes);
      }
    }function init_embind() {
      Module['getInheritedInstanceCount'] = getInheritedInstanceCount;
      Module['getLiveInheritedInstances'] = getLiveInheritedInstances;
      Module['flushPendingDeletes'] = flushPendingDeletes;
      Module['setDelayFunction'] = setDelayFunction;
    }var registeredInstances={};
  
  function getBasestPointer(class_, ptr) {
      if (ptr === undefined) {
          throwBindingError('ptr should not be undefined');
      }
      while (class_.baseClass) {
          ptr = class_.upcast(ptr);
          class_ = class_.baseClass;
      }
      return ptr;
    }function getInheritedInstance(class_, ptr) {
      ptr = getBasestPointer(class_, ptr);
      return registeredInstances[ptr];
    }
  
  function makeClassHandle(prototype, record) {
      if (!record.ptrType || !record.ptr) {
          throwInternalError('makeClassHandle requires ptr and ptrType');
      }
      var hasSmartPtrType = !!record.smartPtrType;
      var hasSmartPtr = !!record.smartPtr;
      if (hasSmartPtrType !== hasSmartPtr) {
          throwInternalError('Both smartPtrType and smartPtr must be specified');
      }
      record.count = { value: 1 };
      return Object.create(prototype, {
          $$: {
              value: record,
          },
      });
    }function RegisteredPointer_fromWireType(ptr) {
      // ptr is a raw pointer (or a raw smartpointer)
  
      // rawPointer is a maybe-null raw pointer
      var rawPointer = this.getPointee(ptr);
      if (!rawPointer) {
          this.destructor(ptr);
          return null;
      }
  
      var registeredInstance = getInheritedInstance(this.registeredClass, rawPointer);
      if (undefined !== registeredInstance) {
          // JS object has been neutered, time to repopulate it
          if (0 === registeredInstance.$$.count.value) {
              registeredInstance.$$.ptr = rawPointer;
              registeredInstance.$$.smartPtr = ptr;
              return registeredInstance['clone']();
          } else {
              // else, just increment reference count on existing object
              // it already has a reference to the smart pointer
              var rv = registeredInstance['clone']();
              this.destructor(ptr);
              return rv;
          }
      }
  
      function makeDefaultHandle() {
          if (this.isSmartPointer) {
              return makeClassHandle(this.registeredClass.instancePrototype, {
                  ptrType: this.pointeeType,
                  ptr: rawPointer,
                  smartPtrType: this,
                  smartPtr: ptr,
              });
          } else {
              return makeClassHandle(this.registeredClass.instancePrototype, {
                  ptrType: this,
                  ptr: ptr,
              });
          }
      }
  
      var actualType = this.registeredClass.getActualType(rawPointer);
      var registeredPointerRecord = registeredPointers[actualType];
      if (!registeredPointerRecord) {
          return makeDefaultHandle.call(this);
      }
  
      var toType;
      if (this.isConst) {
          toType = registeredPointerRecord.constPointerType;
      } else {
          toType = registeredPointerRecord.pointerType;
      }
      var dp = downcastPointer(
          rawPointer,
          this.registeredClass,
          toType.registeredClass);
      if (dp === null) {
          return makeDefaultHandle.call(this);
      }
      if (this.isSmartPointer) {
          return makeClassHandle(toType.registeredClass.instancePrototype, {
              ptrType: toType,
              ptr: dp,
              smartPtrType: this,
              smartPtr: ptr,
          });
      } else {
          return makeClassHandle(toType.registeredClass.instancePrototype, {
              ptrType: toType,
              ptr: dp,
          });
      }
    }function init_RegisteredPointer() {
      RegisteredPointer.prototype.getPointee = RegisteredPointer_getPointee;
      RegisteredPointer.prototype.destructor = RegisteredPointer_destructor;
      RegisteredPointer.prototype['argPackAdvance'] = 8;
      RegisteredPointer.prototype['readValueFromPointer'] = simpleReadValueFromPointer;
      RegisteredPointer.prototype['deleteObject'] = RegisteredPointer_deleteObject;
      RegisteredPointer.prototype['fromWireType'] = RegisteredPointer_fromWireType;
    }function RegisteredPointer(
      name,
      registeredClass,
      isReference,
      isConst,
  
      // smart pointer properties
      isSmartPointer,
      pointeeType,
      sharingPolicy,
      rawGetPointee,
      rawConstructor,
      rawShare,
      rawDestructor
    ) {
      this.name = name;
      this.registeredClass = registeredClass;
      this.isReference = isReference;
      this.isConst = isConst;
  
      // smart pointer properties
      this.isSmartPointer = isSmartPointer;
      this.pointeeType = pointeeType;
      this.sharingPolicy = sharingPolicy;
      this.rawGetPointee = rawGetPointee;
      this.rawConstructor = rawConstructor;
      this.rawShare = rawShare;
      this.rawDestructor = rawDestructor;
  
      if (!isSmartPointer && registeredClass.baseClass === undefined) {
          if (isConst) {
              this['toWireType'] = constNoSmartPtrRawPointerToWireType;
              this.destructorFunction = null;
          } else {
              this['toWireType'] = nonConstNoSmartPtrRawPointerToWireType;
              this.destructorFunction = null;
          }
      } else {
          this['toWireType'] = genericPointerToWireType;
          // Here we must leave this.destructorFunction undefined, since whether genericPointerToWireType returns
          // a pointer that needs to be freed up is runtime-dependent, and cannot be evaluated at registration time.
          // TODO: Create an alternative mechanism that allows removing the use of var destructors = []; array in
          //       craftInvokerFunction altogether.
      }
    }
  
  function replacePublicSymbol(name, value, numArguments) {
      if (!Module.hasOwnProperty(name)) {
          throwInternalError('Replacing nonexistant public symbol');
      }
      // If there's an overload table for this symbol, replace the symbol in the overload table instead.
      if (undefined !== Module[name].overloadTable && undefined !== numArguments) {
          Module[name].overloadTable[numArguments] = value;
      }
      else {
          Module[name] = value;
          Module[name].argCount = numArguments;
      }
    }
  
  function embind__requireFunction(signature, rawFunction) {
      signature = readLatin1String(signature);
  
      function makeDynCaller(dynCall) {
          var args = [];
          for (var i = 1; i < signature.length; ++i) {
              args.push('a' + i);
          }
  
          var name = 'dynCall_' + signature + '_' + rawFunction;
          var body = 'return function ' + name + '(' + args.join(', ') + ') {\n';
          body    += '    return dynCall(rawFunction' + (args.length ? ', ' : '') + args.join(', ') + ');\n';
          body    += '};\n';
  
          return (new Function('dynCall', 'rawFunction', body))(dynCall, rawFunction);
      }
  
      var fp;
      if (Module['FUNCTION_TABLE_' + signature] !== undefined) {
          fp = Module['FUNCTION_TABLE_' + signature][rawFunction];
      } else if (typeof FUNCTION_TABLE !== "undefined") {
          fp = FUNCTION_TABLE[rawFunction];
      } else {
          // asm.js does not give direct access to the function tables,
          // and thus we must go through the dynCall interface which allows
          // calling into a signature's function table by pointer value.
          //
          // https://github.com/dherman/asm.js/issues/83
          //
          // This has three main penalties:
          // - dynCall is another function call in the path from JavaScript to C++.
          // - JITs may not predict through the function table indirection at runtime.
          var dc = Module["asm"]['dynCall_' + signature];
          if (dc === undefined) {
              // We will always enter this branch if the signature
              // contains 'f' and PRECISE_F32 is not enabled.
              //
              // Try again, replacing 'f' with 'd'.
              dc = Module["asm"]['dynCall_' + signature.replace(/f/g, 'd')];
              if (dc === undefined) {
                  throwBindingError("No dynCall invoker for signature: " + signature);
              }
          }
          fp = makeDynCaller(dc);
      }
  
      if (typeof fp !== "function") {
          throwBindingError("unknown function pointer with signature " + signature + ": " + rawFunction);
      }
      return fp;
    }
  
  
  var UnboundTypeError=undefined;
  
  function getTypeName(type) {
      var ptr = ___getTypeName(type);
      var rv = readLatin1String(ptr);
      _free(ptr);
      return rv;
    }function throwUnboundTypeError(message, types) {
      var unboundTypes = [];
      var seen = {};
      function visit(type) {
          if (seen[type]) {
              return;
          }
          if (registeredTypes[type]) {
              return;
          }
          if (typeDependencies[type]) {
              typeDependencies[type].forEach(visit);
              return;
          }
          unboundTypes.push(type);
          seen[type] = true;
      }
      types.forEach(visit);
  
      throw new UnboundTypeError(message + ': ' + unboundTypes.map(getTypeName).join([', ']));
    }function __embind_register_class(
      rawType,
      rawPointerType,
      rawConstPointerType,
      baseClassRawType,
      getActualTypeSignature,
      getActualType,
      upcastSignature,
      upcast,
      downcastSignature,
      downcast,
      name,
      destructorSignature,
      rawDestructor
    ) {
      name = readLatin1String(name);
      getActualType = embind__requireFunction(getActualTypeSignature, getActualType);
      if (upcast) {
          upcast = embind__requireFunction(upcastSignature, upcast);
      }
      if (downcast) {
          downcast = embind__requireFunction(downcastSignature, downcast);
      }
      rawDestructor = embind__requireFunction(destructorSignature, rawDestructor);
      var legalFunctionName = makeLegalFunctionName(name);
  
      exposePublicSymbol(legalFunctionName, function() {
          // this code cannot run if baseClassRawType is zero
          throwUnboundTypeError('Cannot construct ' + name + ' due to unbound types', [baseClassRawType]);
      });
  
      whenDependentTypesAreResolved(
          [rawType, rawPointerType, rawConstPointerType],
          baseClassRawType ? [baseClassRawType] : [],
          function(base) {
              base = base[0];
  
              var baseClass;
              var basePrototype;
              if (baseClassRawType) {
                  baseClass = base.registeredClass;
                  basePrototype = baseClass.instancePrototype;
              } else {
                  basePrototype = ClassHandle.prototype;
              }
  
              var constructor = createNamedFunction(legalFunctionName, function() {
                  if (Object.getPrototypeOf(this) !== instancePrototype) {
                      throw new BindingError("Use 'new' to construct " + name);
                  }
                  if (undefined === registeredClass.constructor_body) {
                      throw new BindingError(name + " has no accessible constructor");
                  }
                  var body = registeredClass.constructor_body[arguments.length];
                  if (undefined === body) {
                      throw new BindingError("Tried to invoke ctor of " + name + " with invalid number of parameters (" + arguments.length + ") - expected (" + Object.keys(registeredClass.constructor_body).toString() + ") parameters instead!");
                  }
                  return body.apply(this, arguments);
              });
  
              var instancePrototype = Object.create(basePrototype, {
                  constructor: { value: constructor },
              });
  
              constructor.prototype = instancePrototype;
  
              var registeredClass = new RegisteredClass(
                  name,
                  constructor,
                  instancePrototype,
                  rawDestructor,
                  baseClass,
                  getActualType,
                  upcast,
                  downcast);
  
              var referenceConverter = new RegisteredPointer(
                  name,
                  registeredClass,
                  true,
                  false,
                  false);
  
              var pointerConverter = new RegisteredPointer(
                  name + '*',
                  registeredClass,
                  false,
                  false,
                  false);
  
              var constPointerConverter = new RegisteredPointer(
                  name + ' const*',
                  registeredClass,
                  false,
                  true,
                  false);
  
              registeredPointers[rawType] = {
                  pointerType: pointerConverter,
                  constPointerType: constPointerConverter
              };
  
              replacePublicSymbol(legalFunctionName, constructor);
  
              return [referenceConverter, pointerConverter, constPointerConverter];
          }
      );
    }

  
  function heap32VectorToArray(count, firstElement) {
      var array = [];
      for (var i = 0; i < count; i++) {
          array.push(HEAP32[(firstElement >> 2) + i]);
      }
      return array;
    }function __embind_register_class_constructor(
      rawClassType,
      argCount,
      rawArgTypesAddr,
      invokerSignature,
      invoker,
      rawConstructor
    ) {
      var rawArgTypes = heap32VectorToArray(argCount, rawArgTypesAddr);
      invoker = embind__requireFunction(invokerSignature, invoker);
  
      whenDependentTypesAreResolved([], [rawClassType], function(classType) {
          classType = classType[0];
          var humanName = 'constructor ' + classType.name;
  
          if (undefined === classType.registeredClass.constructor_body) {
              classType.registeredClass.constructor_body = [];
          }
          if (undefined !== classType.registeredClass.constructor_body[argCount - 1]) {
              throw new BindingError("Cannot register multiple constructors with identical number of parameters (" + (argCount-1) + ") for class '" + classType.name + "'! Overload resolution is currently only performed using the parameter count, not actual type info!");
          }
          classType.registeredClass.constructor_body[argCount - 1] = function unboundTypeHandler() {
              throwUnboundTypeError('Cannot construct ' + classType.name + ' due to unbound types', rawArgTypes);
          };
  
          whenDependentTypesAreResolved([], rawArgTypes, function(argTypes) {
              classType.registeredClass.constructor_body[argCount - 1] = function constructor_body() {
                  if (arguments.length !== argCount - 1) {
                      throwBindingError(humanName + ' called with ' + arguments.length + ' arguments, expected ' + (argCount-1));
                  }
                  var destructors = [];
                  var args = new Array(argCount);
                  args[0] = rawConstructor;
                  for (var i = 1; i < argCount; ++i) {
                      args[i] = argTypes[i]['toWireType'](destructors, arguments[i - 1]);
                  }
  
                  var ptr = invoker.apply(null, args);
                  runDestructors(destructors);
  
                  return argTypes[0]['fromWireType'](ptr);
              };
              return [];
          });
          return [];
      });
    }

  
  
  function new_(constructor, argumentList) {
      if (!(constructor instanceof Function)) {
          throw new TypeError('new_ called with constructor type ' + typeof(constructor) + " which is not a function");
      }
  
      /*
       * Previously, the following line was just:
  
       function dummy() {};
  
       * Unfortunately, Chrome was preserving 'dummy' as the object's name, even though at creation, the 'dummy' has the
       * correct constructor name.  Thus, objects created with IMVU.new would show up in the debugger as 'dummy', which
       * isn't very helpful.  Using IMVU.createNamedFunction addresses the issue.  Doublely-unfortunately, there's no way
       * to write a test for this behavior.  -NRD 2013.02.22
       */
      var dummy = createNamedFunction(constructor.name || 'unknownFunctionName', function(){});
      dummy.prototype = constructor.prototype;
      var obj = new dummy;
  
      var r = constructor.apply(obj, argumentList);
      return (r instanceof Object) ? r : obj;
    }function craftInvokerFunction(humanName, argTypes, classType, cppInvokerFunc, cppTargetFunc) {
      // humanName: a human-readable string name for the function to be generated.
      // argTypes: An array that contains the embind type objects for all types in the function signature.
      //    argTypes[0] is the type object for the function return value.
      //    argTypes[1] is the type object for function this object/class type, or null if not crafting an invoker for a class method.
      //    argTypes[2...] are the actual function parameters.
      // classType: The embind type object for the class to be bound, or null if this is not a method of a class.
      // cppInvokerFunc: JS Function object to the C++-side function that interops into C++ code.
      // cppTargetFunc: Function pointer (an integer to FUNCTION_TABLE) to the target C++ function the cppInvokerFunc will end up calling.
      var argCount = argTypes.length;
  
      if (argCount < 2) {
          throwBindingError("argTypes array size mismatch! Must at least get return value and 'this' types!");
      }
  
      var isClassMethodFunc = (argTypes[1] !== null && classType !== null);
  
      // Free functions with signature "void function()" do not need an invoker that marshalls between wire types.
  // TODO: This omits argument count check - enable only at -O3 or similar.
  //    if (ENABLE_UNSAFE_OPTS && argCount == 2 && argTypes[0].name == "void" && !isClassMethodFunc) {
  //       return FUNCTION_TABLE[fn];
  //    }
  
  
      // Determine if we need to use a dynamic stack to store the destructors for the function parameters.
      // TODO: Remove this completely once all function invokers are being dynamically generated.
      var needsDestructorStack = false;
  
      for(var i = 1; i < argTypes.length; ++i) { // Skip return value at index 0 - it's not deleted here.
          if (argTypes[i] !== null && argTypes[i].destructorFunction === undefined) { // The type does not define a destructor function - must use dynamic stack
              needsDestructorStack = true;
              break;
          }
      }
  
      var returns = (argTypes[0].name !== "void");
  
      var argsList = "";
      var argsListWired = "";
      for(var i = 0; i < argCount - 2; ++i) {
          argsList += (i!==0?", ":"")+"arg"+i;
          argsListWired += (i!==0?", ":"")+"arg"+i+"Wired";
      }
  
      var invokerFnBody =
          "return function "+makeLegalFunctionName(humanName)+"("+argsList+") {\n" +
          "if (arguments.length !== "+(argCount - 2)+") {\n" +
              "throwBindingError('function "+humanName+" called with ' + arguments.length + ' arguments, expected "+(argCount - 2)+" args!');\n" +
          "}\n";
  
  
      if (needsDestructorStack) {
          invokerFnBody +=
              "var destructors = [];\n";
      }
  
      var dtorStack = needsDestructorStack ? "destructors" : "null";
      var args1 = ["throwBindingError", "invoker", "fn", "runDestructors", "retType", "classParam"];
      var args2 = [throwBindingError, cppInvokerFunc, cppTargetFunc, runDestructors, argTypes[0], argTypes[1]];
  
  
      if (isClassMethodFunc) {
          invokerFnBody += "var thisWired = classParam.toWireType("+dtorStack+", this);\n";
      }
  
      for(var i = 0; i < argCount - 2; ++i) {
          invokerFnBody += "var arg"+i+"Wired = argType"+i+".toWireType("+dtorStack+", arg"+i+"); // "+argTypes[i+2].name+"\n";
          args1.push("argType"+i);
          args2.push(argTypes[i+2]);
      }
  
      if (isClassMethodFunc) {
          argsListWired = "thisWired" + (argsListWired.length > 0 ? ", " : "") + argsListWired;
      }
  
      invokerFnBody +=
          (returns?"var rv = ":"") + "invoker(fn"+(argsListWired.length>0?", ":"")+argsListWired+");\n";
  
      if (needsDestructorStack) {
          invokerFnBody += "runDestructors(destructors);\n";
      } else {
          for(var i = isClassMethodFunc?1:2; i < argTypes.length; ++i) { // Skip return value at index 0 - it's not deleted here. Also skip class type if not a method.
              var paramName = (i === 1 ? "thisWired" : ("arg"+(i - 2)+"Wired"));
              if (argTypes[i].destructorFunction !== null) {
                  invokerFnBody += paramName+"_dtor("+paramName+"); // "+argTypes[i].name+"\n";
                  args1.push(paramName+"_dtor");
                  args2.push(argTypes[i].destructorFunction);
              }
          }
      }
  
      if (returns) {
          invokerFnBody += "var ret = retType.fromWireType(rv);\n" +
                           "return ret;\n";
      } else {
      }
      invokerFnBody += "}\n";
  
      args1.push(invokerFnBody);
  
      var invokerFunction = new_(Function, args1).apply(null, args2);
      return invokerFunction;
    }function __embind_register_class_function(
      rawClassType,
      methodName,
      argCount,
      rawArgTypesAddr, // [ReturnType, ThisType, Args...]
      invokerSignature,
      rawInvoker,
      context,
      isPureVirtual
    ) {
      var rawArgTypes = heap32VectorToArray(argCount, rawArgTypesAddr);
      methodName = readLatin1String(methodName);
      rawInvoker = embind__requireFunction(invokerSignature, rawInvoker);
  
      whenDependentTypesAreResolved([], [rawClassType], function(classType) {
          classType = classType[0];
          var humanName = classType.name + '.' + methodName;
  
          if (isPureVirtual) {
              classType.registeredClass.pureVirtualFunctions.push(methodName);
          }
  
          function unboundTypesHandler() {
              throwUnboundTypeError('Cannot call ' + humanName + ' due to unbound types', rawArgTypes);
          }
  
          var proto = classType.registeredClass.instancePrototype;
          var method = proto[methodName];
          if (undefined === method || (undefined === method.overloadTable && method.className !== classType.name && method.argCount === argCount - 2)) {
              // This is the first overload to be registered, OR we are replacing a function in the base class with a function in the derived class.
              unboundTypesHandler.argCount = argCount - 2;
              unboundTypesHandler.className = classType.name;
              proto[methodName] = unboundTypesHandler;
          } else {
              // There was an existing function with the same name registered. Set up a function overload routing table.
              ensureOverloadTable(proto, methodName, humanName);
              proto[methodName].overloadTable[argCount - 2] = unboundTypesHandler;
          }
  
          whenDependentTypesAreResolved([], rawArgTypes, function(argTypes) {
  
              var memberFunction = craftInvokerFunction(humanName, argTypes, classType, rawInvoker, context);
  
              // Replace the initial unbound-handler-stub function with the appropriate member function, now that all types
              // are resolved. If multiple overloads are registered for this function, the function goes into an overload table.
              if (undefined === proto[methodName].overloadTable) {
                  // Set argCount in case an overload is registered later
                  memberFunction.argCount = argCount - 2;
                  proto[methodName] = memberFunction;
              } else {
                  proto[methodName].overloadTable[argCount - 2] = memberFunction;
              }
  
              return [];
          });
          return [];
      });
    }

  
  
  var emval_free_list=[];
  
  var emval_handle_array=[{},{value:undefined},{value:null},{value:true},{value:false}];function __emval_decref(handle) {
      if (handle > 4 && 0 === --emval_handle_array[handle].refcount) {
          emval_handle_array[handle] = undefined;
          emval_free_list.push(handle);
      }
    }
  
  
  
  function count_emval_handles() {
      var count = 0;
      for (var i = 5; i < emval_handle_array.length; ++i) {
          if (emval_handle_array[i] !== undefined) {
              ++count;
          }
      }
      return count;
    }
  
  function get_first_emval() {
      for (var i = 5; i < emval_handle_array.length; ++i) {
          if (emval_handle_array[i] !== undefined) {
              return emval_handle_array[i];
          }
      }
      return null;
    }function init_emval() {
      Module['count_emval_handles'] = count_emval_handles;
      Module['get_first_emval'] = get_first_emval;
    }function __emval_register(value) {
  
      switch(value){
        case undefined :{ return 1; }
        case null :{ return 2; }
        case true :{ return 3; }
        case false :{ return 4; }
        default:{
          var handle = emval_free_list.length ?
              emval_free_list.pop() :
              emval_handle_array.length;
  
          emval_handle_array[handle] = {refcount: 1, value: value};
          return handle;
          }
        }
    }function __embind_register_emval(rawType, name) {
      name = readLatin1String(name);
      registerType(rawType, {
          name: name,
          'fromWireType': function(handle) {
              var rv = emval_handle_array[handle].value;
              __emval_decref(handle);
              return rv;
          },
          'toWireType': function(destructors, value) {
              return __emval_register(value);
          },
          'argPackAdvance': 8,
          'readValueFromPointer': simpleReadValueFromPointer,
          destructorFunction: null, // This type does not need a destructor
  
          // TODO: do we need a deleteObject here?  write a test where
          // emval is passed into JS via an interface
      });
    }

  
  function _embind_repr(v) {
      if (v === null) {
          return 'null';
      }
      var t = typeof v;
      if (t === 'object' || t === 'array' || t === 'function') {
          return v.toString();
      } else {
          return '' + v;
      }
    }
  
  function floatReadValueFromPointer(name, shift) {
      switch (shift) {
          case 2: return function(pointer) {
              return this['fromWireType'](HEAPF32[pointer >> 2]);
          };
          case 3: return function(pointer) {
              return this['fromWireType'](HEAPF64[pointer >> 3]);
          };
          default:
              throw new TypeError("Unknown float type: " + name);
      }
    }function __embind_register_float(rawType, name, size) {
      var shift = getShiftFromSize(size);
      name = readLatin1String(name);
      registerType(rawType, {
          name: name,
          'fromWireType': function(value) {
              return value;
          },
          'toWireType': function(destructors, value) {
              // todo: Here we have an opportunity for -O3 level "unsafe" optimizations: we could
              // avoid the following if() and assume value is of proper type.
              if (typeof value !== "number" && typeof value !== "boolean") {
                  throw new TypeError('Cannot convert "' + _embind_repr(value) + '" to ' + this.name);
              }
              return value;
          },
          'argPackAdvance': 8,
          'readValueFromPointer': floatReadValueFromPointer(name, shift),
          destructorFunction: null, // This type does not need a destructor
      });
    }

  function __embind_register_function(name, argCount, rawArgTypesAddr, signature, rawInvoker, fn) {
      var argTypes = heap32VectorToArray(argCount, rawArgTypesAddr);
      name = readLatin1String(name);
  
      rawInvoker = embind__requireFunction(signature, rawInvoker);
  
      exposePublicSymbol(name, function() {
          throwUnboundTypeError('Cannot call ' + name + ' due to unbound types', argTypes);
      }, argCount - 1);
  
      whenDependentTypesAreResolved([], argTypes, function(argTypes) {
          var invokerArgsArray = [argTypes[0] /* return value */, null /* no class 'this'*/].concat(argTypes.slice(1) /* actual params */);
          replacePublicSymbol(name, craftInvokerFunction(name, invokerArgsArray, null /* no class 'this'*/, rawInvoker, fn), argCount - 1);
          return [];
      });
    }

  
  function integerReadValueFromPointer(name, shift, signed) {
      // integers are quite common, so generate very specialized functions
      switch (shift) {
          case 0: return signed ?
              function readS8FromPointer(pointer) { return HEAP8[pointer]; } :
              function readU8FromPointer(pointer) { return HEAPU8[pointer]; };
          case 1: return signed ?
              function readS16FromPointer(pointer) { return HEAP16[pointer >> 1]; } :
              function readU16FromPointer(pointer) { return HEAPU16[pointer >> 1]; };
          case 2: return signed ?
              function readS32FromPointer(pointer) { return HEAP32[pointer >> 2]; } :
              function readU32FromPointer(pointer) { return HEAPU32[pointer >> 2]; };
          default:
              throw new TypeError("Unknown integer type: " + name);
      }
    }function __embind_register_integer(primitiveType, name, size, minRange, maxRange) {
      name = readLatin1String(name);
      if (maxRange === -1) { // LLVM doesn't have signed and unsigned 32-bit types, so u32 literals come out as 'i32 -1'. Always treat those as max u32.
          maxRange = 4294967295;
      }
  
      var shift = getShiftFromSize(size);
  
      var fromWireType = function(value) {
          return value;
      };
  
      if (minRange === 0) {
          var bitshift = 32 - 8*size;
          fromWireType = function(value) {
              return (value << bitshift) >>> bitshift;
          };
      }
  
      var isUnsignedType = (name.indexOf('unsigned') != -1);
  
      registerType(primitiveType, {
          name: name,
          'fromWireType': fromWireType,
          'toWireType': function(destructors, value) {
              // todo: Here we have an opportunity for -O3 level "unsafe" optimizations: we could
              // avoid the following two if()s and assume value is of proper type.
              if (typeof value !== "number" && typeof value !== "boolean") {
                  throw new TypeError('Cannot convert "' + _embind_repr(value) + '" to ' + this.name);
              }
              if (value < minRange || value > maxRange) {
                  throw new TypeError('Passing a number "' + _embind_repr(value) + '" from JS side to C/C++ side to an argument of type "' + name + '", which is outside the valid range [' + minRange + ', ' + maxRange + ']!');
              }
              return isUnsignedType ? (value >>> 0) : (value | 0);
          },
          'argPackAdvance': 8,
          'readValueFromPointer': integerReadValueFromPointer(name, shift, minRange !== 0),
          destructorFunction: null, // This type does not need a destructor
      });
    }

  function __embind_register_memory_view(rawType, dataTypeIndex, name) {
      var typeMapping = [
          Int8Array,
          Uint8Array,
          Int16Array,
          Uint16Array,
          Int32Array,
          Uint32Array,
          Float32Array,
          Float64Array,
      ];
  
      var TA = typeMapping[dataTypeIndex];
  
      function decodeMemoryView(handle) {
          handle = handle >> 2;
          var heap = HEAPU32;
          var size = heap[handle]; // in elements
          var data = heap[handle + 1]; // byte offset into emscripten heap
          return new TA(heap['buffer'], data, size);
      }
  
      name = readLatin1String(name);
      registerType(rawType, {
          name: name,
          'fromWireType': decodeMemoryView,
          'argPackAdvance': 8,
          'readValueFromPointer': decodeMemoryView,
      }, {
          ignoreDuplicateRegistrations: true,
      });
    }

  function __embind_register_std_string(rawType, name) {
      name = readLatin1String(name);
      registerType(rawType, {
          name: name,
          'fromWireType': function(value) {
              var length = HEAPU32[value >> 2];
              var a = new Array(length);
              for (var i = 0; i < length; ++i) {
                  a[i] = String.fromCharCode(HEAPU8[value + 4 + i]);
              }
              _free(value);
              return a.join('');
          },
          'toWireType': function(destructors, value) {
              if (value instanceof ArrayBuffer) {
                  value = new Uint8Array(value);
              }
  
              function getTAElement(ta, index) {
                  return ta[index];
              }
              function getStringElement(string, index) {
                  return string.charCodeAt(index);
              }
              var getElement;
              if (value instanceof Uint8Array) {
                  getElement = getTAElement;
              } else if (value instanceof Uint8ClampedArray) {
                  getElement = getTAElement;
              } else if (value instanceof Int8Array) {
                  getElement = getTAElement;
              } else if (typeof value === 'string') {
                  getElement = getStringElement;
              } else {
                  throwBindingError('Cannot pass non-string to std::string');
              }
  
              // assumes 4-byte alignment
              var length = value.length;
              var ptr = _malloc(4 + length);
              HEAPU32[ptr >> 2] = length;
              for (var i = 0; i < length; ++i) {
                  var charCode = getElement(value, i);
                  if (charCode > 255) {
                      _free(ptr);
                      throwBindingError('String has UTF-16 code units that do not fit in 8 bits');
                  }
                  HEAPU8[ptr + 4 + i] = charCode;
              }
              if (destructors !== null) {
                  destructors.push(_free, ptr);
              }
              return ptr;
          },
          'argPackAdvance': 8,
          'readValueFromPointer': simpleReadValueFromPointer,
          destructorFunction: function(ptr) { _free(ptr); },
      });
    }

  function __embind_register_std_wstring(rawType, charSize, name) {
      // nb. do not cache HEAPU16 and HEAPU32, they may be destroyed by enlargeMemory().
      name = readLatin1String(name);
      var getHeap, shift;
      if (charSize === 2) {
          getHeap = function() { return HEAPU16; };
          shift = 1;
      } else if (charSize === 4) {
          getHeap = function() { return HEAPU32; };
          shift = 2;
      }
      registerType(rawType, {
          name: name,
          'fromWireType': function(value) {
              var HEAP = getHeap();
              var length = HEAPU32[value >> 2];
              var a = new Array(length);
              var start = (value + 4) >> shift;
              for (var i = 0; i < length; ++i) {
                  a[i] = String.fromCharCode(HEAP[start + i]);
              }
              _free(value);
              return a.join('');
          },
          'toWireType': function(destructors, value) {
              // assumes 4-byte alignment
              var HEAP = getHeap();
              var length = value.length;
              var ptr = _malloc(4 + length * charSize);
              HEAPU32[ptr >> 2] = length;
              var start = (ptr + 4) >> shift;
              for (var i = 0; i < length; ++i) {
                  HEAP[start + i] = value.charCodeAt(i);
              }
              if (destructors !== null) {
                  destructors.push(_free, ptr);
              }
              return ptr;
          },
          'argPackAdvance': 8,
          'readValueFromPointer': simpleReadValueFromPointer,
          destructorFunction: function(ptr) { _free(ptr); },
      });
    }

  function __embind_register_value_object(
      rawType,
      name,
      constructorSignature,
      rawConstructor,
      destructorSignature,
      rawDestructor
    ) {
      structRegistrations[rawType] = {
          name: readLatin1String(name),
          rawConstructor: embind__requireFunction(constructorSignature, rawConstructor),
          rawDestructor: embind__requireFunction(destructorSignature, rawDestructor),
          fields: [],
      };
    }

  function __embind_register_value_object_field(
      structType,
      fieldName,
      getterReturnType,
      getterSignature,
      getter,
      getterContext,
      setterArgumentType,
      setterSignature,
      setter,
      setterContext
    ) {
      structRegistrations[structType].fields.push({
          fieldName: readLatin1String(fieldName),
          getterReturnType: getterReturnType,
          getter: embind__requireFunction(getterSignature, getter),
          getterContext: getterContext,
          setterArgumentType: setterArgumentType,
          setter: embind__requireFunction(setterSignature, setter),
          setterContext: setterContext,
      });
    }

  function __embind_register_void(rawType, name) {
      name = readLatin1String(name);
      registerType(rawType, {
          isVoid: true, // void return values can be optimized out sometimes
          name: name,
          'argPackAdvance': 0,
          'fromWireType': function() {
              return undefined;
          },
          'toWireType': function(destructors, o) {
              // TODO: assert if anything else is given?
              return undefined;
          },
      });
    }

  function _abort() {
      Module['abort']();
    }

   

   



   

  
  function _emscripten_memcpy_big(dest, src, num) {
      HEAPU8.set(HEAPU8.subarray(src, src+num), dest);
      return dest;
    } 

   

  
  var PTHREAD_SPECIFIC={};function _pthread_getspecific(key) {
      return PTHREAD_SPECIFIC[key] || 0;
    }

  
  var PTHREAD_SPECIFIC_NEXT_KEY=1;
  
  var ERRNO_CODES={EPERM:1,ENOENT:2,ESRCH:3,EINTR:4,EIO:5,ENXIO:6,E2BIG:7,ENOEXEC:8,EBADF:9,ECHILD:10,EAGAIN:11,EWOULDBLOCK:11,ENOMEM:12,EACCES:13,EFAULT:14,ENOTBLK:15,EBUSY:16,EEXIST:17,EXDEV:18,ENODEV:19,ENOTDIR:20,EISDIR:21,EINVAL:22,ENFILE:23,EMFILE:24,ENOTTY:25,ETXTBSY:26,EFBIG:27,ENOSPC:28,ESPIPE:29,EROFS:30,EMLINK:31,EPIPE:32,EDOM:33,ERANGE:34,ENOMSG:42,EIDRM:43,ECHRNG:44,EL2NSYNC:45,EL3HLT:46,EL3RST:47,ELNRNG:48,EUNATCH:49,ENOCSI:50,EL2HLT:51,EDEADLK:35,ENOLCK:37,EBADE:52,EBADR:53,EXFULL:54,ENOANO:55,EBADRQC:56,EBADSLT:57,EDEADLOCK:35,EBFONT:59,ENOSTR:60,ENODATA:61,ETIME:62,ENOSR:63,ENONET:64,ENOPKG:65,EREMOTE:66,ENOLINK:67,EADV:68,ESRMNT:69,ECOMM:70,EPROTO:71,EMULTIHOP:72,EDOTDOT:73,EBADMSG:74,ENOTUNIQ:76,EBADFD:77,EREMCHG:78,ELIBACC:79,ELIBBAD:80,ELIBSCN:81,ELIBMAX:82,ELIBEXEC:83,ENOSYS:38,ENOTEMPTY:39,ENAMETOOLONG:36,ELOOP:40,EOPNOTSUPP:95,EPFNOSUPPORT:96,ECONNRESET:104,ENOBUFS:105,EAFNOSUPPORT:97,EPROTOTYPE:91,ENOTSOCK:88,ENOPROTOOPT:92,ESHUTDOWN:108,ECONNREFUSED:111,EADDRINUSE:98,ECONNABORTED:103,ENETUNREACH:101,ENETDOWN:100,ETIMEDOUT:110,EHOSTDOWN:112,EHOSTUNREACH:113,EINPROGRESS:115,EALREADY:114,EDESTADDRREQ:89,EMSGSIZE:90,EPROTONOSUPPORT:93,ESOCKTNOSUPPORT:94,EADDRNOTAVAIL:99,ENETRESET:102,EISCONN:106,ENOTCONN:107,ETOOMANYREFS:109,EUSERS:87,EDQUOT:122,ESTALE:116,ENOTSUP:95,ENOMEDIUM:123,EILSEQ:84,EOVERFLOW:75,ECANCELED:125,ENOTRECOVERABLE:131,EOWNERDEAD:130,ESTRPIPE:86};function _pthread_key_create(key, destructor) {
      if (key == 0) {
        return ERRNO_CODES.EINVAL;
      }
      HEAP32[((key)>>2)]=PTHREAD_SPECIFIC_NEXT_KEY;
      // values start at 0
      PTHREAD_SPECIFIC[PTHREAD_SPECIFIC_NEXT_KEY] = 0;
      PTHREAD_SPECIFIC_NEXT_KEY++;
      return 0;
    }

  function _pthread_once(ptr, func) {
      if (!_pthread_once.seen) _pthread_once.seen = {};
      if (ptr in _pthread_once.seen) return;
      Module['dynCall_v'](func);
      _pthread_once.seen[ptr] = 1;
    }

  function _pthread_setspecific(key, value) {
      if (!(key in PTHREAD_SPECIFIC)) {
        return ERRNO_CODES.EINVAL;
      }
      PTHREAD_SPECIFIC[key] = value;
      return 0;
    }

  
  function ___setErrNo(value) {
      if (Module['___errno_location']) HEAP32[((Module['___errno_location']())>>2)]=value;
      else Module.printErr('failed to set errno from JS');
      return value;
    } 
InternalError = Module['InternalError'] = extendError(Error, 'InternalError');;
embind_init_charCodes();
BindingError = Module['BindingError'] = extendError(Error, 'BindingError');;
init_ClassHandle();
init_RegisteredPointer();
init_embind();;
UnboundTypeError = Module['UnboundTypeError'] = extendError(Error, 'UnboundTypeError');;
init_emval();;
DYNAMICTOP_PTR = staticAlloc(4);

STACK_BASE = STACKTOP = alignMemory(STATICTOP);

STACK_MAX = STACK_BASE + TOTAL_STACK;

DYNAMIC_BASE = alignMemory(STACK_MAX);

HEAP32[DYNAMICTOP_PTR>>2] = DYNAMIC_BASE;

staticSealed = true; // seal the static portion of memory

assert(DYNAMIC_BASE < TOTAL_MEMORY, "TOTAL_MEMORY not big enough for stack");

var ASSERTIONS = true;

/** @type {function(string, boolean=, number=)} */
function intArrayFromString(stringy, dontAddNull, length) {
  var len = length > 0 ? length : lengthBytesUTF8(stringy)+1;
  var u8array = new Array(len);
  var numBytesWritten = stringToUTF8Array(stringy, u8array, 0, u8array.length);
  if (dontAddNull) u8array.length = numBytesWritten;
  return u8array;
}

function intArrayToString(array) {
  var ret = [];
  for (var i = 0; i < array.length; i++) {
    var chr = array[i];
    if (chr > 0xFF) {
      if (ASSERTIONS) {
        assert(false, 'Character code ' + chr + ' (' + String.fromCharCode(chr) + ')  at offset ' + i + ' not in 0x00-0xFF.');
      }
      chr &= 0xFF;
    }
    ret.push(String.fromCharCode(chr));
  }
  return ret.join('');
}



function nullFunc_d(x) { Module["printErr"]("Invalid function pointer called with signature 'd'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_di(x) { Module["printErr"]("Invalid function pointer called with signature 'di'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_i(x) { Module["printErr"]("Invalid function pointer called with signature 'i'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_ii(x) { Module["printErr"]("Invalid function pointer called with signature 'ii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_iii(x) { Module["printErr"]("Invalid function pointer called with signature 'iii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_iiii(x) { Module["printErr"]("Invalid function pointer called with signature 'iiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_v(x) { Module["printErr"]("Invalid function pointer called with signature 'v'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_vi(x) { Module["printErr"]("Invalid function pointer called with signature 'vi'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_vii(x) { Module["printErr"]("Invalid function pointer called with signature 'vii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_viii(x) { Module["printErr"]("Invalid function pointer called with signature 'viii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_viiii(x) { Module["printErr"]("Invalid function pointer called with signature 'viiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_viiiii(x) { Module["printErr"]("Invalid function pointer called with signature 'viiiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_viiiiii(x) { Module["printErr"]("Invalid function pointer called with signature 'viiiiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function invoke_d(index) {
  try {
    return Module["dynCall_d"](index);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_di(index,a1) {
  try {
    return Module["dynCall_di"](index,a1);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_i(index) {
  try {
    return Module["dynCall_i"](index);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_ii(index,a1) {
  try {
    return Module["dynCall_ii"](index,a1);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_iii(index,a1,a2) {
  try {
    return Module["dynCall_iii"](index,a1,a2);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_iiii(index,a1,a2,a3) {
  try {
    return Module["dynCall_iiii"](index,a1,a2,a3);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_v(index) {
  try {
    Module["dynCall_v"](index);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_vi(index,a1) {
  try {
    Module["dynCall_vi"](index,a1);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_vii(index,a1,a2) {
  try {
    Module["dynCall_vii"](index,a1,a2);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_viii(index,a1,a2,a3) {
  try {
    Module["dynCall_viii"](index,a1,a2,a3);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_viiii(index,a1,a2,a3,a4) {
  try {
    Module["dynCall_viiii"](index,a1,a2,a3,a4);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_viiiii(index,a1,a2,a3,a4,a5) {
  try {
    Module["dynCall_viiiii"](index,a1,a2,a3,a4,a5);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

function invoke_viiiiii(index,a1,a2,a3,a4,a5,a6) {
  try {
    Module["dynCall_viiiiii"](index,a1,a2,a3,a4,a5,a6);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    Module["setThrew"](1, 0);
  }
}

Module.asmGlobalArg = { "Math": Math, "Int8Array": Int8Array, "Int16Array": Int16Array, "Int32Array": Int32Array, "Uint8Array": Uint8Array, "Uint16Array": Uint16Array, "Uint32Array": Uint32Array, "Float32Array": Float32Array, "Float64Array": Float64Array, "NaN": NaN, "Infinity": Infinity };

Module.asmLibraryArg = { "abort": abort, "assert": assert, "enlargeMemory": enlargeMemory, "getTotalMemory": getTotalMemory, "abortOnCannotGrowMemory": abortOnCannotGrowMemory, "abortStackOverflow": abortStackOverflow, "nullFunc_d": nullFunc_d, "nullFunc_di": nullFunc_di, "nullFunc_i": nullFunc_i, "nullFunc_ii": nullFunc_ii, "nullFunc_iii": nullFunc_iii, "nullFunc_iiii": nullFunc_iiii, "nullFunc_v": nullFunc_v, "nullFunc_vi": nullFunc_vi, "nullFunc_vii": nullFunc_vii, "nullFunc_viii": nullFunc_viii, "nullFunc_viiii": nullFunc_viiii, "nullFunc_viiiii": nullFunc_viiiii, "nullFunc_viiiiii": nullFunc_viiiiii, "invoke_d": invoke_d, "invoke_di": invoke_di, "invoke_i": invoke_i, "invoke_ii": invoke_ii, "invoke_iii": invoke_iii, "invoke_iiii": invoke_iiii, "invoke_v": invoke_v, "invoke_vi": invoke_vi, "invoke_vii": invoke_vii, "invoke_viii": invoke_viii, "invoke_viiii": invoke_viiii, "invoke_viiiii": invoke_viiiii, "invoke_viiiiii": invoke_viiiiii, "ClassHandle": ClassHandle, "ClassHandle_clone": ClassHandle_clone, "ClassHandle_delete": ClassHandle_delete, "ClassHandle_deleteLater": ClassHandle_deleteLater, "ClassHandle_isAliasOf": ClassHandle_isAliasOf, "ClassHandle_isDeleted": ClassHandle_isDeleted, "RegisteredClass": RegisteredClass, "RegisteredPointer": RegisteredPointer, "RegisteredPointer_deleteObject": RegisteredPointer_deleteObject, "RegisteredPointer_destructor": RegisteredPointer_destructor, "RegisteredPointer_fromWireType": RegisteredPointer_fromWireType, "RegisteredPointer_getPointee": RegisteredPointer_getPointee, "__ZSt18uncaught_exceptionv": __ZSt18uncaught_exceptionv, "___cxa_allocate_exception": ___cxa_allocate_exception, "___cxa_begin_catch": ___cxa_begin_catch, "___cxa_end_catch": ___cxa_end_catch, "___cxa_find_matching_catch": ___cxa_find_matching_catch, "___cxa_find_matching_catch_2": ___cxa_find_matching_catch_2, "___cxa_find_matching_catch_3": ___cxa_find_matching_catch_3, "___cxa_free_exception": ___cxa_free_exception, "___cxa_throw": ___cxa_throw, "___gxx_personality_v0": ___gxx_personality_v0, "___lock": ___lock, "___resumeException": ___resumeException, "___setErrNo": ___setErrNo, "___syscall140": ___syscall140, "___syscall146": ___syscall146, "___syscall54": ___syscall54, "___syscall6": ___syscall6, "___unlock": ___unlock, "__embind_finalize_value_object": __embind_finalize_value_object, "__embind_register_bool": __embind_register_bool, "__embind_register_class": __embind_register_class, "__embind_register_class_constructor": __embind_register_class_constructor, "__embind_register_class_function": __embind_register_class_function, "__embind_register_emval": __embind_register_emval, "__embind_register_float": __embind_register_float, "__embind_register_function": __embind_register_function, "__embind_register_integer": __embind_register_integer, "__embind_register_memory_view": __embind_register_memory_view, "__embind_register_std_string": __embind_register_std_string, "__embind_register_std_wstring": __embind_register_std_wstring, "__embind_register_value_object": __embind_register_value_object, "__embind_register_value_object_field": __embind_register_value_object_field, "__embind_register_void": __embind_register_void, "__emval_decref": __emval_decref, "__emval_register": __emval_register, "_abort": _abort, "_embind_repr": _embind_repr, "_emscripten_memcpy_big": _emscripten_memcpy_big, "_pthread_getspecific": _pthread_getspecific, "_pthread_key_create": _pthread_key_create, "_pthread_once": _pthread_once, "_pthread_setspecific": _pthread_setspecific, "constNoSmartPtrRawPointerToWireType": constNoSmartPtrRawPointerToWireType, "count_emval_handles": count_emval_handles, "craftInvokerFunction": craftInvokerFunction, "createNamedFunction": createNamedFunction, "downcastPointer": downcastPointer, "embind__requireFunction": embind__requireFunction, "embind_init_charCodes": embind_init_charCodes, "ensureOverloadTable": ensureOverloadTable, "exposePublicSymbol": exposePublicSymbol, "extendError": extendError, "floatReadValueFromPointer": floatReadValueFromPointer, "flushPendingDeletes": flushPendingDeletes, "flush_NO_FILESYSTEM": flush_NO_FILESYSTEM, "genericPointerToWireType": genericPointerToWireType, "getBasestPointer": getBasestPointer, "getInheritedInstance": getInheritedInstance, "getInheritedInstanceCount": getInheritedInstanceCount, "getLiveInheritedInstances": getLiveInheritedInstances, "getShiftFromSize": getShiftFromSize, "getTypeName": getTypeName, "get_first_emval": get_first_emval, "heap32VectorToArray": heap32VectorToArray, "init_ClassHandle": init_ClassHandle, "init_RegisteredPointer": init_RegisteredPointer, "init_embind": init_embind, "init_emval": init_emval, "integerReadValueFromPointer": integerReadValueFromPointer, "makeClassHandle": makeClassHandle, "makeLegalFunctionName": makeLegalFunctionName, "new_": new_, "nonConstNoSmartPtrRawPointerToWireType": nonConstNoSmartPtrRawPointerToWireType, "readLatin1String": readLatin1String, "registerType": registerType, "replacePublicSymbol": replacePublicSymbol, "runDestructor": runDestructor, "runDestructors": runDestructors, "setDelayFunction": setDelayFunction, "shallowCopyInternalPointer": shallowCopyInternalPointer, "simpleReadValueFromPointer": simpleReadValueFromPointer, "throwBindingError": throwBindingError, "throwInstanceAlreadyDeleted": throwInstanceAlreadyDeleted, "throwInternalError": throwInternalError, "throwUnboundTypeError": throwUnboundTypeError, "upcastPointer": upcastPointer, "whenDependentTypesAreResolved": whenDependentTypesAreResolved, "DYNAMICTOP_PTR": DYNAMICTOP_PTR, "tempDoublePtr": tempDoublePtr, "ABORT": ABORT, "STACKTOP": STACKTOP, "STACK_MAX": STACK_MAX, "cttz_i8": cttz_i8 };
// EMSCRIPTEN_START_ASM
var asm = (/** @suppress {uselessCode} */ function(global, env, buffer) {
'almost asm';


  var HEAP8 = new global.Int8Array(buffer);
  var HEAP16 = new global.Int16Array(buffer);
  var HEAP32 = new global.Int32Array(buffer);
  var HEAPU8 = new global.Uint8Array(buffer);
  var HEAPU16 = new global.Uint16Array(buffer);
  var HEAPU32 = new global.Uint32Array(buffer);
  var HEAPF32 = new global.Float32Array(buffer);
  var HEAPF64 = new global.Float64Array(buffer);

  var DYNAMICTOP_PTR=env.DYNAMICTOP_PTR|0;
  var tempDoublePtr=env.tempDoublePtr|0;
  var ABORT=env.ABORT|0;
  var STACKTOP=env.STACKTOP|0;
  var STACK_MAX=env.STACK_MAX|0;
  var cttz_i8=env.cttz_i8|0;

  var __THREW__ = 0;
  var threwValue = 0;
  var setjmpId = 0;
  var undef = 0;
  var nan = global.NaN, inf = global.Infinity;
  var tempInt = 0, tempBigInt = 0, tempBigIntS = 0, tempValue = 0, tempDouble = 0.0;
  var tempRet0 = 0;

  var Math_floor=global.Math.floor;
  var Math_abs=global.Math.abs;
  var Math_sqrt=global.Math.sqrt;
  var Math_pow=global.Math.pow;
  var Math_cos=global.Math.cos;
  var Math_sin=global.Math.sin;
  var Math_tan=global.Math.tan;
  var Math_acos=global.Math.acos;
  var Math_asin=global.Math.asin;
  var Math_atan=global.Math.atan;
  var Math_atan2=global.Math.atan2;
  var Math_exp=global.Math.exp;
  var Math_log=global.Math.log;
  var Math_ceil=global.Math.ceil;
  var Math_imul=global.Math.imul;
  var Math_min=global.Math.min;
  var Math_max=global.Math.max;
  var Math_clz32=global.Math.clz32;
  var abort=env.abort;
  var assert=env.assert;
  var enlargeMemory=env.enlargeMemory;
  var getTotalMemory=env.getTotalMemory;
  var abortOnCannotGrowMemory=env.abortOnCannotGrowMemory;
  var abortStackOverflow=env.abortStackOverflow;
  var nullFunc_d=env.nullFunc_d;
  var nullFunc_di=env.nullFunc_di;
  var nullFunc_i=env.nullFunc_i;
  var nullFunc_ii=env.nullFunc_ii;
  var nullFunc_iii=env.nullFunc_iii;
  var nullFunc_iiii=env.nullFunc_iiii;
  var nullFunc_v=env.nullFunc_v;
  var nullFunc_vi=env.nullFunc_vi;
  var nullFunc_vii=env.nullFunc_vii;
  var nullFunc_viii=env.nullFunc_viii;
  var nullFunc_viiii=env.nullFunc_viiii;
  var nullFunc_viiiii=env.nullFunc_viiiii;
  var nullFunc_viiiiii=env.nullFunc_viiiiii;
  var invoke_d=env.invoke_d;
  var invoke_di=env.invoke_di;
  var invoke_i=env.invoke_i;
  var invoke_ii=env.invoke_ii;
  var invoke_iii=env.invoke_iii;
  var invoke_iiii=env.invoke_iiii;
  var invoke_v=env.invoke_v;
  var invoke_vi=env.invoke_vi;
  var invoke_vii=env.invoke_vii;
  var invoke_viii=env.invoke_viii;
  var invoke_viiii=env.invoke_viiii;
  var invoke_viiiii=env.invoke_viiiii;
  var invoke_viiiiii=env.invoke_viiiiii;
  var ClassHandle=env.ClassHandle;
  var ClassHandle_clone=env.ClassHandle_clone;
  var ClassHandle_delete=env.ClassHandle_delete;
  var ClassHandle_deleteLater=env.ClassHandle_deleteLater;
  var ClassHandle_isAliasOf=env.ClassHandle_isAliasOf;
  var ClassHandle_isDeleted=env.ClassHandle_isDeleted;
  var RegisteredClass=env.RegisteredClass;
  var RegisteredPointer=env.RegisteredPointer;
  var RegisteredPointer_deleteObject=env.RegisteredPointer_deleteObject;
  var RegisteredPointer_destructor=env.RegisteredPointer_destructor;
  var RegisteredPointer_fromWireType=env.RegisteredPointer_fromWireType;
  var RegisteredPointer_getPointee=env.RegisteredPointer_getPointee;
  var __ZSt18uncaught_exceptionv=env.__ZSt18uncaught_exceptionv;
  var ___cxa_allocate_exception=env.___cxa_allocate_exception;
  var ___cxa_begin_catch=env.___cxa_begin_catch;
  var ___cxa_end_catch=env.___cxa_end_catch;
  var ___cxa_find_matching_catch=env.___cxa_find_matching_catch;
  var ___cxa_find_matching_catch_2=env.___cxa_find_matching_catch_2;
  var ___cxa_find_matching_catch_3=env.___cxa_find_matching_catch_3;
  var ___cxa_free_exception=env.___cxa_free_exception;
  var ___cxa_throw=env.___cxa_throw;
  var ___gxx_personality_v0=env.___gxx_personality_v0;
  var ___lock=env.___lock;
  var ___resumeException=env.___resumeException;
  var ___setErrNo=env.___setErrNo;
  var ___syscall140=env.___syscall140;
  var ___syscall146=env.___syscall146;
  var ___syscall54=env.___syscall54;
  var ___syscall6=env.___syscall6;
  var ___unlock=env.___unlock;
  var __embind_finalize_value_object=env.__embind_finalize_value_object;
  var __embind_register_bool=env.__embind_register_bool;
  var __embind_register_class=env.__embind_register_class;
  var __embind_register_class_constructor=env.__embind_register_class_constructor;
  var __embind_register_class_function=env.__embind_register_class_function;
  var __embind_register_emval=env.__embind_register_emval;
  var __embind_register_float=env.__embind_register_float;
  var __embind_register_function=env.__embind_register_function;
  var __embind_register_integer=env.__embind_register_integer;
  var __embind_register_memory_view=env.__embind_register_memory_view;
  var __embind_register_std_string=env.__embind_register_std_string;
  var __embind_register_std_wstring=env.__embind_register_std_wstring;
  var __embind_register_value_object=env.__embind_register_value_object;
  var __embind_register_value_object_field=env.__embind_register_value_object_field;
  var __embind_register_void=env.__embind_register_void;
  var __emval_decref=env.__emval_decref;
  var __emval_register=env.__emval_register;
  var _abort=env._abort;
  var _embind_repr=env._embind_repr;
  var _emscripten_memcpy_big=env._emscripten_memcpy_big;
  var _pthread_getspecific=env._pthread_getspecific;
  var _pthread_key_create=env._pthread_key_create;
  var _pthread_once=env._pthread_once;
  var _pthread_setspecific=env._pthread_setspecific;
  var constNoSmartPtrRawPointerToWireType=env.constNoSmartPtrRawPointerToWireType;
  var count_emval_handles=env.count_emval_handles;
  var craftInvokerFunction=env.craftInvokerFunction;
  var createNamedFunction=env.createNamedFunction;
  var downcastPointer=env.downcastPointer;
  var embind__requireFunction=env.embind__requireFunction;
  var embind_init_charCodes=env.embind_init_charCodes;
  var ensureOverloadTable=env.ensureOverloadTable;
  var exposePublicSymbol=env.exposePublicSymbol;
  var extendError=env.extendError;
  var floatReadValueFromPointer=env.floatReadValueFromPointer;
  var flushPendingDeletes=env.flushPendingDeletes;
  var flush_NO_FILESYSTEM=env.flush_NO_FILESYSTEM;
  var genericPointerToWireType=env.genericPointerToWireType;
  var getBasestPointer=env.getBasestPointer;
  var getInheritedInstance=env.getInheritedInstance;
  var getInheritedInstanceCount=env.getInheritedInstanceCount;
  var getLiveInheritedInstances=env.getLiveInheritedInstances;
  var getShiftFromSize=env.getShiftFromSize;
  var getTypeName=env.getTypeName;
  var get_first_emval=env.get_first_emval;
  var heap32VectorToArray=env.heap32VectorToArray;
  var init_ClassHandle=env.init_ClassHandle;
  var init_RegisteredPointer=env.init_RegisteredPointer;
  var init_embind=env.init_embind;
  var init_emval=env.init_emval;
  var integerReadValueFromPointer=env.integerReadValueFromPointer;
  var makeClassHandle=env.makeClassHandle;
  var makeLegalFunctionName=env.makeLegalFunctionName;
  var new_=env.new_;
  var nonConstNoSmartPtrRawPointerToWireType=env.nonConstNoSmartPtrRawPointerToWireType;
  var readLatin1String=env.readLatin1String;
  var registerType=env.registerType;
  var replacePublicSymbol=env.replacePublicSymbol;
  var runDestructor=env.runDestructor;
  var runDestructors=env.runDestructors;
  var setDelayFunction=env.setDelayFunction;
  var shallowCopyInternalPointer=env.shallowCopyInternalPointer;
  var simpleReadValueFromPointer=env.simpleReadValueFromPointer;
  var throwBindingError=env.throwBindingError;
  var throwInstanceAlreadyDeleted=env.throwInstanceAlreadyDeleted;
  var throwInternalError=env.throwInternalError;
  var throwUnboundTypeError=env.throwUnboundTypeError;
  var upcastPointer=env.upcastPointer;
  var whenDependentTypesAreResolved=env.whenDependentTypesAreResolved;
  var tempFloat = 0.0;

// EMSCRIPTEN_START_FUNCS

function stackAlloc(size) {
  size = size|0;
  var ret = 0;
  ret = STACKTOP;
  STACKTOP = (STACKTOP + size)|0;
  STACKTOP = (STACKTOP + 15)&-16;
  if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(size|0);

  return ret|0;
}
function stackSave() {
  return STACKTOP|0;
}
function stackRestore(top) {
  top = top|0;
  STACKTOP = top;
}
function establishStackSpace(stackBase, stackMax) {
  stackBase = stackBase|0;
  stackMax = stackMax|0;
  STACKTOP = stackBase;
  STACK_MAX = stackMax;
}

function setThrew(threw, value) {
  threw = threw|0;
  value = value|0;
  if ((__THREW__|0) == 0) {
    __THREW__ = threw;
    threwValue = value;
  }
}

function setTempRet0(value) {
  value = value|0;
  tempRet0 = value;
}
function getTempRet0() {
  return tempRet0|0;
}

function __Z3cliv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return; //@line 28 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\avr\mocks.cpp"
}
function __Z3seiv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return; //@line 29 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\avr\mocks.cpp"
}
function __Z13pgm_read_bytePVKv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1; //@line 31 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\avr\mocks.cpp"
 $3 = HEAP8[$2>>0]|0; //@line 31 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\avr\mocks.cpp"
 STACKTOP = sp;return ($3|0); //@line 31 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\avr\mocks.cpp"
}
function __Z13pgm_read_wordPVKv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1; //@line 32 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\avr\mocks.cpp"
 $3 = HEAP16[$2>>1]|0; //@line 32 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\avr\mocks.cpp"
 STACKTOP = sp;return ($3|0); //@line 32 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\avr\mocks.cpp"
}
function __GLOBAL__sub_I_bindings_cpp() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 ___cxx_global_var_init();
 return;
}
function ___cxx_global_var_init() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 __ZN37EmscriptenBindingInitializer_firmwareC2Ev(37217); //@line 22 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
 return; //@line 22 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
}
function __ZN37EmscriptenBindingInitializer_firmwareC2Ev($0) {
 $0 = $0|0;
 var $$byval_copy = 0, $$field = 0, $$field11 = 0, $$field14 = 0, $$field21 = 0, $$field24 = 0, $$field31 = 0, $$field34 = 0, $$field4 = 0, $$field41 = 0, $$field44 = 0, $$field51 = 0, $$field54 = 0, $$field61 = 0, $$field64 = 0, $$field71 = 0, $$field74 = 0, $$field81 = 0, $$field84 = 0, $$field91 = 0;
 var $$field94 = 0, $$index1 = 0, $$index13 = 0, $$index17 = 0, $$index19 = 0, $$index23 = 0, $$index27 = 0, $$index29 = 0, $$index3 = 0, $$index33 = 0, $$index37 = 0, $$index39 = 0, $$index43 = 0, $$index47 = 0, $$index49 = 0, $$index53 = 0, $$index57 = 0, $$index59 = 0, $$index63 = 0, $$index67 = 0;
 var $$index69 = 0, $$index7 = 0, $$index73 = 0, $$index77 = 0, $$index79 = 0, $$index83 = 0, $$index87 = 0, $$index89 = 0, $$index9 = 0, $$index93 = 0, $$index97 = 0, $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0;
 var $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0;
 var $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0;
 var $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0;
 var $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0;
 var $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0, $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0;
 var $198 = 0, $199 = 0, $2 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0, $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0;
 var $215 = 0, $216 = 0, $217 = 0, $218 = 0, $219 = 0, $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0, $224 = 0, $225 = 0, $226 = 0, $227 = 0, $228 = 0, $229 = 0, $23 = 0, $230 = 0, $231 = 0, $232 = 0;
 var $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0, $242 = 0, $243 = 0, $244 = 0, $245 = 0, $246 = 0, $247 = 0, $248 = 0, $249 = 0, $25 = 0, $250 = 0;
 var $251 = 0, $252 = 0, $253 = 0, $254 = 0, $255 = 0, $256 = 0, $257 = 0, $258 = 0, $259 = 0, $26 = 0, $260 = 0, $261 = 0, $262 = 0, $263 = 0, $264 = 0, $265 = 0, $266 = 0, $267 = 0, $268 = 0, $269 = 0;
 var $27 = 0, $270 = 0, $271 = 0, $272 = 0, $273 = 0, $274 = 0, $275 = 0, $276 = 0, $277 = 0, $278 = 0, $279 = 0, $28 = 0, $280 = 0, $281 = 0, $282 = 0, $283 = 0, $284 = 0, $285 = 0, $286 = 0, $287 = 0;
 var $288 = 0, $289 = 0, $29 = 0, $290 = 0, $291 = 0, $292 = 0, $293 = 0, $294 = 0, $295 = 0, $296 = 0, $297 = 0, $298 = 0, $299 = 0, $3 = 0, $30 = 0, $300 = 0, $301 = 0, $302 = 0, $303 = 0, $304 = 0;
 var $305 = 0, $306 = 0, $307 = 0, $308 = 0, $309 = 0, $31 = 0, $310 = 0, $311 = 0, $312 = 0, $313 = 0, $314 = 0, $315 = 0, $316 = 0, $317 = 0, $318 = 0, $319 = 0, $32 = 0, $320 = 0, $321 = 0, $322 = 0;
 var $323 = 0, $324 = 0, $325 = 0, $326 = 0, $327 = 0, $328 = 0, $329 = 0, $33 = 0, $330 = 0, $331 = 0, $332 = 0, $333 = 0, $334 = 0, $335 = 0, $336 = 0, $337 = 0, $338 = 0, $339 = 0, $34 = 0, $340 = 0;
 var $341 = 0, $342 = 0, $343 = 0, $344 = 0, $345 = 0, $346 = 0, $347 = 0, $348 = 0, $349 = 0, $35 = 0, $350 = 0, $351 = 0, $352 = 0, $353 = 0, $354 = 0, $355 = 0, $356 = 0, $357 = 0, $358 = 0, $359 = 0;
 var $36 = 0, $360 = 0, $361 = 0, $362 = 0, $363 = 0, $364 = 0, $365 = 0, $366 = 0, $367 = 0, $368 = 0, $369 = 0, $37 = 0, $370 = 0, $371 = 0, $372 = 0, $373 = 0, $374 = 0, $375 = 0, $376 = 0, $377 = 0;
 var $378 = 0, $379 = 0, $38 = 0, $380 = 0, $381 = 0, $382 = 0, $383 = 0, $384 = 0, $385 = 0, $386 = 0, $387 = 0, $388 = 0, $389 = 0, $39 = 0, $390 = 0, $391 = 0, $392 = 0, $393 = 0, $394 = 0, $395 = 0;
 var $396 = 0, $397 = 0, $398 = 0, $399 = 0, $4 = 0, $40 = 0, $400 = 0, $401 = 0, $402 = 0, $403 = 0, $404 = 0, $405 = 0, $406 = 0, $407 = 0, $408 = 0, $409 = 0, $41 = 0, $410 = 0, $411 = 0, $412 = 0;
 var $413 = 0, $414 = 0, $415 = 0, $416 = 0, $417 = 0, $418 = 0, $419 = 0, $42 = 0, $420 = 0, $421 = 0, $422 = 0, $423 = 0, $424 = 0, $425 = 0, $426 = 0, $427 = 0, $428 = 0, $429 = 0, $43 = 0, $430 = 0;
 var $431 = 0, $432 = 0, $433 = 0, $434 = 0, $435 = 0, $436 = 0, $437 = 0, $438 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0;
 var $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0;
 var $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0;
 var $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 752|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(752|0);
 $$byval_copy = sp + 749|0;
 $4 = sp + 704|0;
 $6 = sp + 748|0;
 $7 = sp + 72|0;
 $11 = sp + 680|0;
 $13 = sp + 747|0;
 $14 = sp + 64|0;
 $18 = sp + 656|0;
 $20 = sp + 746|0;
 $21 = sp + 56|0;
 $25 = sp + 632|0;
 $27 = sp + 745|0;
 $28 = sp + 48|0;
 $32 = sp + 744|0;
 $48 = sp + 544|0;
 $50 = sp + 743|0;
 $51 = sp + 40|0;
 $55 = sp + 520|0;
 $57 = sp + 742|0;
 $58 = sp + 32|0;
 $62 = sp + 496|0;
 $64 = sp + 741|0;
 $65 = sp + 24|0;
 $69 = sp + 740|0;
 $85 = sp + 408|0;
 $87 = sp + 739|0;
 $88 = sp + 16|0;
 $92 = sp + 384|0;
 $94 = sp + 738|0;
 $95 = sp + 8|0;
 $99 = sp + 360|0;
 $101 = sp + 737|0;
 $102 = sp;
 $106 = sp + 736|0;
 $150 = sp + 735|0;
 $153 = sp + 734|0;
 $154 = sp + 733|0;
 $155 = sp + 732|0;
 $156 = sp + 731|0;
 $157 = sp + 730|0;
 $158 = sp + 729|0;
 $159 = sp + 728|0;
 $160 = sp + 727|0;
 $161 = sp + 726|0;
 $162 = sp + 152|0;
 $163 = sp + 144|0;
 $164 = sp + 136|0;
 $165 = sp + 725|0;
 $166 = sp + 128|0;
 $167 = sp + 120|0;
 $168 = sp + 112|0;
 $169 = sp + 724|0;
 $170 = sp + 104|0;
 $171 = sp + 96|0;
 $172 = sp + 88|0;
 $173 = sp + 80|0;
 $149 = $0;
 __ZN10emscripten8functionIvJhEJEEEvPKcPFT_DpT0_EDpT1_(5476,29); //@line 23 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
 __ZN10emscripten8functionIK10HeapRegionIhEJEJEEEvPKcPFT_DpT0_EDpT1_(5493,30); //@line 24 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
 __ZN10emscripten8functionIK10HeapRegionIaEJEJEEEvPKcPFT_DpT0_EDpT1_(5512,31); //@line 25 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
 __ZN10emscripten8functionIK10HeapRegionI9LerpStageEJEJEEEvPKcPFT_DpT0_EDpT1_(5525,32); //@line 26 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
 __ZN10emscripten8functionIK10HeapRegionI11LerpProgramEJEJEEEvPKcPFT_DpT0_EDpT1_(5539,33); //@line 27 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
 __ZN10emscripten8functionIK10HeapRegionIhEJEJEEEvPKcPFT_DpT0_EDpT1_(5555,34); //@line 28 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
 __ZN10emscripten8functionIK10HeapRegionI10InstrumentEJEJEEEvPKcPFT_DpT0_EDpT1_(5575,35); //@line 29 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
 __ZN10emscripten12value_objectI10HeapRegionIaEEC2EPKc($150,5590); //@line 31 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
 __THREW__ = 0;
 $174 = (invoke_iiii(36,($150|0),(5594|0),0)|0); //@line 32 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
 $175 = __THREW__; __THREW__ = 0;
 $176 = $175&1;
 if (!($176)) {
  __THREW__ = 0;
  (invoke_iiii(36,($174|0),(5600|0),4)|0); //@line 33 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
  $177 = __THREW__; __THREW__ = 0;
  $178 = $177&1;
  if (!($178)) {
   __ZN10emscripten12value_objectI10HeapRegionIaEED2Ev($150); //@line 31 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
   __ZN10emscripten12value_objectI10HeapRegionIhEEC2EPKc($153,5604); //@line 35 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
   __THREW__ = 0;
   $179 = (invoke_iiii(37,($153|0),(5594|0),0)|0); //@line 36 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
   $180 = __THREW__; __THREW__ = 0;
   $181 = $180&1;
   if (!($181)) {
    __THREW__ = 0;
    (invoke_iiii(37,($179|0),(5600|0),4)|0); //@line 37 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
    $182 = __THREW__; __THREW__ = 0;
    $183 = $182&1;
    if (!($183)) {
     __ZN10emscripten12value_objectI10HeapRegionIhEED2Ev($153); //@line 35 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
     __ZN10emscripten12value_objectI10HeapRegionI9LerpStageEEC2EPKc($154,5608); //@line 39 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
     __THREW__ = 0;
     $184 = (invoke_iiii(38,($154|0),(5594|0),0)|0); //@line 40 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
     $185 = __THREW__; __THREW__ = 0;
     $186 = $185&1;
     if (!($186)) {
      __THREW__ = 0;
      (invoke_iiii(38,($184|0),(5600|0),4)|0); //@line 41 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
      $187 = __THREW__; __THREW__ = 0;
      $188 = $187&1;
      if (!($188)) {
       __ZN10emscripten12value_objectI10HeapRegionI9LerpStageEED2Ev($154); //@line 39 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
       __ZN10emscripten12value_objectI10HeapRegionI11LerpProgramEEC2EPKc($155,5619); //@line 43 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
       __THREW__ = 0;
       $189 = (invoke_iiii(39,($155|0),(5594|0),0)|0); //@line 44 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
       $190 = __THREW__; __THREW__ = 0;
       $191 = $190&1;
       if (!($191)) {
        __THREW__ = 0;
        (invoke_iiii(39,($189|0),(5600|0),4)|0); //@line 45 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
        $192 = __THREW__; __THREW__ = 0;
        $193 = $192&1;
        if (!($193)) {
         __ZN10emscripten12value_objectI10HeapRegionI11LerpProgramEED2Ev($155); //@line 43 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
         __ZN10emscripten12value_objectI10HeapRegionI10InstrumentEEC2EPKc($156,5632); //@line 47 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
         __THREW__ = 0;
         $194 = (invoke_iiii(40,($156|0),(5594|0),0)|0); //@line 48 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
         $195 = __THREW__; __THREW__ = 0;
         $196 = $195&1;
         if (!($196)) {
          __THREW__ = 0;
          (invoke_iiii(40,($194|0),(5600|0),4)|0); //@line 49 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
          $197 = __THREW__; __THREW__ = 0;
          $198 = $197&1;
          if (!($198)) {
           __ZN10emscripten12value_objectI10HeapRegionI10InstrumentEED2Ev($156); //@line 47 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
           __ZN10emscripten8functionIdJEJEEEvPKcPFT_DpT0_EDpT1_(5644,41); //@line 51 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
           ;HEAP8[$$byval_copy>>0]=HEAP8[$157>>0]|0; //@line 52 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
           __ZN10emscripten8functionIP9MidiSynthJEJNS_17allow_raw_pointerINS_7ret_valEEEEEEvPKcPFT_DpT0_EDpT1_(5658,42,$$byval_copy); //@line 52 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
           $143 = $158;
           $144 = 5667;
           __ZN10emscripten8internal11NoBaseClass6verifyI9LerpStageEEvv(); //@line 1121 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $145 = 43; //@line 1123 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $199 = (__ZN10emscripten8internal11NoBaseClass11getUpcasterI9LerpStageEEPFvvEv()|0); //@line 1124 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $146 = $199; //@line 1124 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $200 = (__ZN10emscripten8internal11NoBaseClass13getDowncasterI9LerpStageEEPFvvEv()|0); //@line 1125 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $147 = $200; //@line 1125 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $148 = 44; //@line 1126 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $201 = (__ZN10emscripten8internal6TypeIDI9LerpStageE3getEv()|0); //@line 1129 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $202 = (__ZN10emscripten8internal6TypeIDINS0_17AllowedRawPointerI9LerpStageEEE3getEv()|0); //@line 1130 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $203 = (__ZN10emscripten8internal6TypeIDINS0_17AllowedRawPointerIK9LerpStageEEE3getEv()|0); //@line 1131 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $204 = (__ZN10emscripten8internal11NoBaseClass3getEv()|0); //@line 1132 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $205 = $145; //@line 1133 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $142 = $205;
           $206 = (__ZN10emscripten8internal19getGenericSignatureIJiiEEEPKcv()|0); //@line 399 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $207 = $145; //@line 1134 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $208 = $146; //@line 1135 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $141 = $208;
           $209 = (__ZN10emscripten8internal19getGenericSignatureIJvEEEPKcv()|0); //@line 399 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $210 = $146; //@line 1136 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $211 = $147; //@line 1137 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $140 = $211;
           $212 = (__ZN10emscripten8internal19getGenericSignatureIJvEEEPKcv()|0); //@line 399 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $213 = $147; //@line 1138 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $214 = $144; //@line 1139 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $215 = $148; //@line 1140 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $139 = $215;
           $216 = (__ZN10emscripten8internal19getGenericSignatureIJviEEEPKcv()|0); //@line 399 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $217 = $148; //@line 1141 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           __embind_register_class(($201|0),($202|0),($203|0),($204|0),($206|0),($207|0),($209|0),($210|0),($212|0),($213|0),($214|0),($216|0),($217|0)); //@line 1128 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $133 = $159;
           $134 = 5677;
           __ZN10emscripten8internal11NoBaseClass6verifyI11LerpProgramEEvv(); //@line 1121 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $135 = 45; //@line 1123 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $218 = (__ZN10emscripten8internal11NoBaseClass11getUpcasterI11LerpProgramEEPFvvEv()|0); //@line 1124 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $136 = $218; //@line 1124 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $219 = (__ZN10emscripten8internal11NoBaseClass13getDowncasterI11LerpProgramEEPFvvEv()|0); //@line 1125 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $137 = $219; //@line 1125 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $138 = 46; //@line 1126 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $220 = (__ZN10emscripten8internal6TypeIDI11LerpProgramE3getEv()|0); //@line 1129 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $221 = (__ZN10emscripten8internal6TypeIDINS0_17AllowedRawPointerI11LerpProgramEEE3getEv()|0); //@line 1130 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $222 = (__ZN10emscripten8internal6TypeIDINS0_17AllowedRawPointerIK11LerpProgramEEE3getEv()|0); //@line 1131 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $223 = (__ZN10emscripten8internal11NoBaseClass3getEv()|0); //@line 1132 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $224 = $135; //@line 1133 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $132 = $224;
           $225 = (__ZN10emscripten8internal19getGenericSignatureIJiiEEEPKcv()|0); //@line 399 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $226 = $135; //@line 1134 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $227 = $136; //@line 1135 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $131 = $227;
           $228 = (__ZN10emscripten8internal19getGenericSignatureIJvEEEPKcv()|0); //@line 399 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $229 = $136; //@line 1136 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $230 = $137; //@line 1137 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $130 = $230;
           $231 = (__ZN10emscripten8internal19getGenericSignatureIJvEEEPKcv()|0); //@line 399 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $232 = $137; //@line 1138 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $233 = $134; //@line 1139 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $234 = $138; //@line 1140 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $129 = $234;
           $235 = (__ZN10emscripten8internal19getGenericSignatureIJviEEEPKcv()|0); //@line 399 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $236 = $138; //@line 1141 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           __embind_register_class(($220|0),($221|0),($222|0),($223|0),($225|0),($226|0),($228|0),($229|0),($231|0),($232|0),($233|0),($235|0),($236|0)); //@line 1128 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $123 = $160;
           $124 = 5689;
           __ZN10emscripten8internal11NoBaseClass6verifyI10InstrumentEEvv(); //@line 1121 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $125 = 47; //@line 1123 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $237 = (__ZN10emscripten8internal11NoBaseClass11getUpcasterI10InstrumentEEPFvvEv()|0); //@line 1124 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $126 = $237; //@line 1124 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $238 = (__ZN10emscripten8internal11NoBaseClass13getDowncasterI10InstrumentEEPFvvEv()|0); //@line 1125 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $127 = $238; //@line 1125 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $128 = 48; //@line 1126 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $239 = (__ZN10emscripten8internal6TypeIDI10InstrumentE3getEv()|0); //@line 1129 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $240 = (__ZN10emscripten8internal6TypeIDINS0_17AllowedRawPointerI10InstrumentEEE3getEv()|0); //@line 1130 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $241 = (__ZN10emscripten8internal6TypeIDINS0_17AllowedRawPointerIK10InstrumentEEE3getEv()|0); //@line 1131 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $242 = (__ZN10emscripten8internal11NoBaseClass3getEv()|0); //@line 1132 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $243 = $125; //@line 1133 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $122 = $243;
           $244 = (__ZN10emscripten8internal19getGenericSignatureIJiiEEEPKcv()|0); //@line 399 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $245 = $125; //@line 1134 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $246 = $126; //@line 1135 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $121 = $246;
           $247 = (__ZN10emscripten8internal19getGenericSignatureIJvEEEPKcv()|0); //@line 399 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $248 = $126; //@line 1136 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $249 = $127; //@line 1137 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $120 = $249;
           $250 = (__ZN10emscripten8internal19getGenericSignatureIJvEEEPKcv()|0); //@line 399 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $251 = $127; //@line 1138 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $252 = $124; //@line 1139 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $253 = $128; //@line 1140 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $119 = $253;
           $254 = (__ZN10emscripten8internal19getGenericSignatureIJviEEEPKcv()|0); //@line 399 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $255 = $128; //@line 1141 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           __embind_register_class(($239|0),($240|0),($241|0),($242|0),($244|0),($245|0),($247|0),($248|0),($250|0),($251|0),($252|0),($254|0),($255|0)); //@line 1128 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $113 = $161;
           $114 = 5700;
           __ZN10emscripten8internal11NoBaseClass6verifyI4LerpEEvv(); //@line 1121 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $115 = 49; //@line 1123 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $256 = (__ZN10emscripten8internal11NoBaseClass11getUpcasterI4LerpEEPFvvEv()|0); //@line 1124 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $116 = $256; //@line 1124 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $257 = (__ZN10emscripten8internal11NoBaseClass13getDowncasterI4LerpEEPFvvEv()|0); //@line 1125 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $117 = $257; //@line 1125 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $118 = 50; //@line 1126 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $258 = (__ZN10emscripten8internal6TypeIDI4LerpE3getEv()|0); //@line 1129 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $259 = (__ZN10emscripten8internal6TypeIDINS0_17AllowedRawPointerI4LerpEEE3getEv()|0); //@line 1130 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $260 = (__ZN10emscripten8internal6TypeIDINS0_17AllowedRawPointerIK4LerpEEE3getEv()|0); //@line 1131 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $261 = (__ZN10emscripten8internal11NoBaseClass3getEv()|0); //@line 1132 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $262 = $115; //@line 1133 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $112 = $262;
           $263 = (__ZN10emscripten8internal19getGenericSignatureIJiiEEEPKcv()|0); //@line 399 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $264 = $115; //@line 1134 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $265 = $116; //@line 1135 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $111 = $265;
           $266 = (__ZN10emscripten8internal19getGenericSignatureIJvEEEPKcv()|0); //@line 399 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $267 = $116; //@line 1136 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $268 = $117; //@line 1137 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $110 = $268;
           $269 = (__ZN10emscripten8internal19getGenericSignatureIJvEEEPKcv()|0); //@line 399 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $270 = $117; //@line 1138 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $271 = $114; //@line 1139 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $272 = $118; //@line 1140 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $109 = $272;
           $273 = (__ZN10emscripten8internal19getGenericSignatureIJviEEEPKcv()|0); //@line 399 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $274 = $118; //@line 1141 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           __embind_register_class(($258|0),($259|0),($260|0),($261|0),($263|0),($264|0),($266|0),($267|0),($269|0),($270|0),($271|0),($273|0),($274|0)); //@line 1128 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $108 = $161;
           $275 = $108;
           $104 = $275;
           $105 = 51;
           $276 = $104;
           $107 = 52; //@line 1187 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $277 = (__ZN10emscripten8internal6TypeIDI4LerpE3getEv()|0); //@line 1189 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $278 = (__ZNK10emscripten8internal12WithPoliciesIJNS_18allow_raw_pointersEEE11ArgTypeListIJP4LerpEE8getCountEv($106)|0); //@line 1190 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $279 = (__ZNK10emscripten8internal12WithPoliciesIJNS_18allow_raw_pointersEEE11ArgTypeListIJP4LerpEE8getTypesEv($106)|0); //@line 1191 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $280 = $107; //@line 1192 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $103 = $280;
           $281 = (__ZN10emscripten8internal19getGenericSignatureIJiiEEEPKcv()|0); //@line 399 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $282 = $107; //@line 1193 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $283 = $105; //@line 1194 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           __embind_register_class_constructor(($277|0),($278|0),($279|0),($281|0),($282|0),($283|0)); //@line 1188 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           HEAP32[$162>>2] = (53); //@line 58 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
           $$index1 = ((($162)) + 4|0); //@line 58 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
           HEAP32[$$index1>>2] = 0; //@line 58 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
           ;HEAP8[$102>>0]=HEAP8[$162>>0]|0;HEAP8[$102+1>>0]=HEAP8[$162+1>>0]|0;HEAP8[$102+2>>0]=HEAP8[$162+2>>0]|0;HEAP8[$102+3>>0]=HEAP8[$162+3>>0]|0;HEAP8[$102+4>>0]=HEAP8[$162+4>>0]|0;HEAP8[$102+5>>0]=HEAP8[$162+5>>0]|0;HEAP8[$102+6>>0]=HEAP8[$162+6>>0]|0;HEAP8[$102+7>>0]=HEAP8[$162+7>>0]|0;
           $$field = HEAP32[$102>>2]|0;
           $$index3 = ((($102)) + 4|0);
           $$field4 = HEAP32[$$index3>>2]|0;
           $97 = $276;
           $98 = 5705;
           HEAP32[$99>>2] = $$field;
           $$index7 = ((($99)) + 4|0);
           HEAP32[$$index7>>2] = $$field4;
           $284 = $97;
           $100 = 54; //@line 1270 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $285 = (__ZN10emscripten8internal6TypeIDI4LerpE3getEv()|0); //@line 1274 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $286 = $98; //@line 1275 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $287 = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJhNS0_17AllowedRawPointerI4LerpEEEE8getCountEv($101)|0); //@line 1276 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $288 = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJhNS0_17AllowedRawPointerI4LerpEEEE8getTypesEv($101)|0); //@line 1277 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $289 = $100; //@line 1278 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $96 = $289;
           $290 = (__ZN10emscripten8internal19getGenericSignatureIJiiiEEEPKcv()|0); //@line 399 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $291 = $100; //@line 1279 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $292 = (__ZN10emscripten8internal10getContextIM4LerpFhvEEEPT_RKS5_($99)|0); //@line 1280 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           __embind_register_class_function(($285|0),($286|0),($287|0),($288|0),($290|0),($291|0),($292|0),0); //@line 1273 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           HEAP32[$163>>2] = (55); //@line 59 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
           $$index9 = ((($163)) + 4|0); //@line 59 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
           HEAP32[$$index9>>2] = 0; //@line 59 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
           ;HEAP8[$95>>0]=HEAP8[$163>>0]|0;HEAP8[$95+1>>0]=HEAP8[$163+1>>0]|0;HEAP8[$95+2>>0]=HEAP8[$163+2>>0]|0;HEAP8[$95+3>>0]=HEAP8[$163+3>>0]|0;HEAP8[$95+4>>0]=HEAP8[$163+4>>0]|0;HEAP8[$95+5>>0]=HEAP8[$163+5>>0]|0;HEAP8[$95+6>>0]=HEAP8[$163+6>>0]|0;HEAP8[$95+7>>0]=HEAP8[$163+7>>0]|0;
           $$field11 = HEAP32[$95>>2]|0;
           $$index13 = ((($95)) + 4|0);
           $$field14 = HEAP32[$$index13>>2]|0;
           $90 = $284;
           $91 = 5594;
           HEAP32[$92>>2] = $$field11;
           $$index17 = ((($92)) + 4|0);
           HEAP32[$$index17>>2] = $$field14;
           $293 = $90;
           $93 = 56; //@line 1270 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $294 = (__ZN10emscripten8internal6TypeIDI4LerpE3getEv()|0); //@line 1274 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $295 = $91; //@line 1275 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $296 = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJvNS0_17AllowedRawPointerI4LerpEEhhEE8getCountEv($94)|0); //@line 1276 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $297 = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJvNS0_17AllowedRawPointerI4LerpEEhhEE8getTypesEv($94)|0); //@line 1277 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $298 = $93; //@line 1278 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $89 = $298;
           $299 = (__ZN10emscripten8internal19getGenericSignatureIJviiiiEEEPKcv()|0); //@line 399 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $300 = $93; //@line 1279 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $301 = (__ZN10emscripten8internal10getContextIM4LerpFvhhEEEPT_RKS5_($92)|0); //@line 1280 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           __embind_register_class_function(($294|0),($295|0),($296|0),($297|0),($299|0),($300|0),($301|0),0); //@line 1273 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           HEAP32[$164>>2] = (57); //@line 60 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
           $$index19 = ((($164)) + 4|0); //@line 60 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
           HEAP32[$$index19>>2] = 0; //@line 60 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
           ;HEAP8[$88>>0]=HEAP8[$164>>0]|0;HEAP8[$88+1>>0]=HEAP8[$164+1>>0]|0;HEAP8[$88+2>>0]=HEAP8[$164+2>>0]|0;HEAP8[$88+3>>0]=HEAP8[$164+3>>0]|0;HEAP8[$88+4>>0]=HEAP8[$164+4>>0]|0;HEAP8[$88+5>>0]=HEAP8[$164+5>>0]|0;HEAP8[$88+6>>0]=HEAP8[$164+6>>0]|0;HEAP8[$88+7>>0]=HEAP8[$164+7>>0]|0;
           $$field21 = HEAP32[$88>>2]|0;
           $$index23 = ((($88)) + 4|0);
           $$field24 = HEAP32[$$index23>>2]|0;
           $83 = $293;
           $84 = 5712;
           HEAP32[$85>>2] = $$field21;
           $$index27 = ((($85)) + 4|0);
           HEAP32[$$index27>>2] = $$field24;
           $86 = 58; //@line 1270 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $302 = (__ZN10emscripten8internal6TypeIDI4LerpE3getEv()|0); //@line 1274 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $303 = $84; //@line 1275 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $304 = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJvNS0_17AllowedRawPointerI4LerpEEEE8getCountEv($87)|0); //@line 1276 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $305 = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJvNS0_17AllowedRawPointerI4LerpEEEE8getTypesEv($87)|0); //@line 1277 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $306 = $86; //@line 1278 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $82 = $306;
           $307 = (__ZN10emscripten8internal19getGenericSignatureIJviiEEEPKcv()|0); //@line 399 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $308 = $86; //@line 1279 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $309 = (__ZN10emscripten8internal10getContextIM4LerpFvvEEEPT_RKS5_($85)|0); //@line 1280 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           __embind_register_class_function(($302|0),($303|0),($304|0),($305|0),($307|0),($308|0),($309|0),0); //@line 1273 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $76 = $165;
           $77 = 5717;
           __ZN10emscripten8internal11NoBaseClass6verifyI5SynthEEvv(); //@line 1121 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $78 = 59; //@line 1123 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $310 = (__ZN10emscripten8internal11NoBaseClass11getUpcasterI5SynthEEPFvvEv()|0); //@line 1124 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $79 = $310; //@line 1124 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $311 = (__ZN10emscripten8internal11NoBaseClass13getDowncasterI5SynthEEPFvvEv()|0); //@line 1125 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $80 = $311; //@line 1125 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $81 = 60; //@line 1126 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $312 = (__ZN10emscripten8internal6TypeIDI5SynthE3getEv()|0); //@line 1129 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $313 = (__ZN10emscripten8internal6TypeIDINS0_17AllowedRawPointerI5SynthEEE3getEv()|0); //@line 1130 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $314 = (__ZN10emscripten8internal6TypeIDINS0_17AllowedRawPointerIK5SynthEEE3getEv()|0); //@line 1131 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $315 = (__ZN10emscripten8internal11NoBaseClass3getEv()|0); //@line 1132 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $316 = $78; //@line 1133 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $75 = $316;
           $317 = (__ZN10emscripten8internal19getGenericSignatureIJiiEEEPKcv()|0); //@line 399 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $318 = $78; //@line 1134 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $319 = $79; //@line 1135 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $74 = $319;
           $320 = (__ZN10emscripten8internal19getGenericSignatureIJvEEEPKcv()|0); //@line 399 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $321 = $79; //@line 1136 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $322 = $80; //@line 1137 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $73 = $322;
           $323 = (__ZN10emscripten8internal19getGenericSignatureIJvEEEPKcv()|0); //@line 399 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $324 = $80; //@line 1138 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $325 = $77; //@line 1139 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $326 = $81; //@line 1140 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $72 = $326;
           $327 = (__ZN10emscripten8internal19getGenericSignatureIJviEEEPKcv()|0); //@line 399 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $328 = $81; //@line 1141 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           __embind_register_class(($312|0),($313|0),($314|0),($315|0),($317|0),($318|0),($320|0),($321|0),($323|0),($324|0),($325|0),($327|0),($328|0)); //@line 1128 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $71 = $165;
           $329 = $71;
           $67 = $329;
           $68 = 61;
           $330 = $67;
           $70 = 62; //@line 1187 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $331 = (__ZN10emscripten8internal6TypeIDI5SynthE3getEv()|0); //@line 1189 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $332 = (__ZNK10emscripten8internal12WithPoliciesIJNS_18allow_raw_pointersEEE11ArgTypeListIJP5SynthEE8getCountEv($69)|0); //@line 1190 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $333 = (__ZNK10emscripten8internal12WithPoliciesIJNS_18allow_raw_pointersEEE11ArgTypeListIJP5SynthEE8getTypesEv($69)|0); //@line 1191 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $334 = $70; //@line 1192 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $66 = $334;
           $335 = (__ZN10emscripten8internal19getGenericSignatureIJiiEEEPKcv()|0); //@line 399 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $336 = $70; //@line 1193 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $337 = $68; //@line 1194 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           __embind_register_class_constructor(($331|0),($332|0),($333|0),($335|0),($336|0),($337|0)); //@line 1188 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           HEAP32[$166>>2] = (63); //@line 63 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
           $$index29 = ((($166)) + 4|0); //@line 63 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
           HEAP32[$$index29>>2] = 0; //@line 63 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
           ;HEAP8[$65>>0]=HEAP8[$166>>0]|0;HEAP8[$65+1>>0]=HEAP8[$166+1>>0]|0;HEAP8[$65+2>>0]=HEAP8[$166+2>>0]|0;HEAP8[$65+3>>0]=HEAP8[$166+3>>0]|0;HEAP8[$65+4>>0]=HEAP8[$166+4>>0]|0;HEAP8[$65+5>>0]=HEAP8[$166+5>>0]|0;HEAP8[$65+6>>0]=HEAP8[$166+6>>0]|0;HEAP8[$65+7>>0]=HEAP8[$166+7>>0]|0;
           $$field31 = HEAP32[$65>>2]|0;
           $$index33 = ((($65)) + 4|0);
           $$field34 = HEAP32[$$index33>>2]|0;
           $60 = $330;
           $61 = 5705;
           HEAP32[$62>>2] = $$field31;
           $$index37 = ((($62)) + 4|0);
           HEAP32[$$index37>>2] = $$field34;
           $338 = $60;
           $63 = 64; //@line 1270 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $339 = (__ZN10emscripten8internal6TypeIDI5SynthE3getEv()|0); //@line 1274 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $340 = $61; //@line 1275 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $341 = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJtNS0_17AllowedRawPointerI5SynthEEEE8getCountEv($64)|0); //@line 1276 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $342 = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJtNS0_17AllowedRawPointerI5SynthEEEE8getTypesEv($64)|0); //@line 1277 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $343 = $63; //@line 1278 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $59 = $343;
           $344 = (__ZN10emscripten8internal19getGenericSignatureIJiiiEEEPKcv()|0); //@line 399 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $345 = $63; //@line 1279 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $346 = (__ZN10emscripten8internal10getContextIM5SynthFtvEEEPT_RKS5_($62)|0); //@line 1280 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           __embind_register_class_function(($339|0),($340|0),($341|0),($342|0),($344|0),($345|0),($346|0),0); //@line 1273 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           HEAP32[$167>>2] = (65); //@line 64 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
           $$index39 = ((($167)) + 4|0); //@line 64 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
           HEAP32[$$index39>>2] = 0; //@line 64 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
           ;HEAP8[$58>>0]=HEAP8[$167>>0]|0;HEAP8[$58+1>>0]=HEAP8[$167+1>>0]|0;HEAP8[$58+2>>0]=HEAP8[$167+2>>0]|0;HEAP8[$58+3>>0]=HEAP8[$167+3>>0]|0;HEAP8[$58+4>>0]=HEAP8[$167+4>>0]|0;HEAP8[$58+5>>0]=HEAP8[$167+5>>0]|0;HEAP8[$58+6>>0]=HEAP8[$167+6>>0]|0;HEAP8[$58+7>>0]=HEAP8[$167+7>>0]|0;
           $$field41 = HEAP32[$58>>2]|0;
           $$index43 = ((($58)) + 4|0);
           $$field44 = HEAP32[$$index43>>2]|0;
           $53 = $338;
           $54 = 5723;
           HEAP32[$55>>2] = $$field41;
           $$index47 = ((($55)) + 4|0);
           HEAP32[$$index47>>2] = $$field44;
           $347 = $53;
           $56 = 66; //@line 1270 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $348 = (__ZN10emscripten8internal6TypeIDI5SynthE3getEv()|0); //@line 1274 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $349 = $54; //@line 1275 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $350 = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJvNS0_17AllowedRawPointerI5SynthEEhhhhEE8getCountEv($57)|0); //@line 1276 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $351 = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJvNS0_17AllowedRawPointerI5SynthEEhhhhEE8getTypesEv($57)|0); //@line 1277 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $352 = $56; //@line 1278 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $52 = $352;
           $353 = (__ZN10emscripten8internal19getGenericSignatureIJviiiiiiEEEPKcv()|0); //@line 399 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $354 = $56; //@line 1279 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $355 = (__ZN10emscripten8internal10getContextIM5SynthFvhhhhEEEPT_RKS5_($55)|0); //@line 1280 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           __embind_register_class_function(($348|0),($349|0),($350|0),($351|0),($353|0),($354|0),($355|0),0); //@line 1273 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           HEAP32[$168>>2] = (67); //@line 65 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
           $$index49 = ((($168)) + 4|0); //@line 65 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
           HEAP32[$$index49>>2] = 0; //@line 65 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
           ;HEAP8[$51>>0]=HEAP8[$168>>0]|0;HEAP8[$51+1>>0]=HEAP8[$168+1>>0]|0;HEAP8[$51+2>>0]=HEAP8[$168+2>>0]|0;HEAP8[$51+3>>0]=HEAP8[$168+3>>0]|0;HEAP8[$51+4>>0]=HEAP8[$168+4>>0]|0;HEAP8[$51+5>>0]=HEAP8[$168+5>>0]|0;HEAP8[$51+6>>0]=HEAP8[$168+6>>0]|0;HEAP8[$51+7>>0]=HEAP8[$168+7>>0]|0;
           $$field51 = HEAP32[$51>>2]|0;
           $$index53 = ((($51)) + 4|0);
           $$field54 = HEAP32[$$index53>>2]|0;
           $46 = $347;
           $47 = 5730;
           HEAP32[$48>>2] = $$field51;
           $$index57 = ((($48)) + 4|0);
           HEAP32[$$index57>>2] = $$field54;
           $49 = 68; //@line 1270 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $356 = (__ZN10emscripten8internal6TypeIDI5SynthE3getEv()|0); //@line 1274 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $357 = $47; //@line 1275 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $358 = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJvNS0_17AllowedRawPointerI5SynthEEhEE8getCountEv($50)|0); //@line 1276 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $359 = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJvNS0_17AllowedRawPointerI5SynthEEhEE8getTypesEv($50)|0); //@line 1277 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $360 = $49; //@line 1278 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $45 = $360;
           $361 = (__ZN10emscripten8internal19getGenericSignatureIJviiiEEEPKcv()|0); //@line 399 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $362 = $49; //@line 1279 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $363 = (__ZN10emscripten8internal10getContextIM5SynthFvhEEEPT_RKS5_($48)|0); //@line 1280 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           __embind_register_class_function(($356|0),($357|0),($358|0),($359|0),($361|0),($362|0),($363|0),0); //@line 1273 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $39 = $169;
           $40 = 5738;
           __ZN10emscripten4baseI5SynthE6verifyI9MidiSynthEEvv(); //@line 1121 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $41 = 69; //@line 1123 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $364 = (__ZN10emscripten4baseI5SynthE11getUpcasterI9MidiSynthEEPFPS1_PT_Ev()|0); //@line 1124 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $42 = $364; //@line 1124 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $365 = (__ZN10emscripten4baseI5SynthE13getDowncasterI9MidiSynthEEPFPT_PS1_Ev()|0); //@line 1125 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $43 = $365; //@line 1125 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $44 = 70; //@line 1126 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $366 = (__ZN10emscripten8internal6TypeIDI9MidiSynthE3getEv()|0); //@line 1129 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $367 = (__ZN10emscripten8internal6TypeIDINS0_17AllowedRawPointerI9MidiSynthEEE3getEv()|0); //@line 1130 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $368 = (__ZN10emscripten8internal6TypeIDINS0_17AllowedRawPointerIK9MidiSynthEEE3getEv()|0); //@line 1131 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $369 = (__ZN10emscripten4baseI5SynthE3getEv()|0); //@line 1132 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $370 = $41; //@line 1133 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $38 = $370;
           $371 = (__ZN10emscripten8internal19getGenericSignatureIJiiEEEPKcv()|0); //@line 399 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $372 = $41; //@line 1134 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $373 = $42; //@line 1135 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $37 = $373;
           $374 = (__ZN10emscripten8internal19getGenericSignatureIJiiEEEPKcv()|0); //@line 399 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $375 = $42; //@line 1136 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $376 = $43; //@line 1137 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $36 = $376;
           $377 = (__ZN10emscripten8internal19getGenericSignatureIJiiEEEPKcv()|0); //@line 399 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $378 = $43; //@line 1138 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $379 = $40; //@line 1139 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $380 = $44; //@line 1140 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $35 = $380;
           $381 = (__ZN10emscripten8internal19getGenericSignatureIJviEEEPKcv()|0); //@line 399 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $382 = $44; //@line 1141 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           __embind_register_class(($366|0),($367|0),($368|0),($369|0),($371|0),($372|0),($374|0),($375|0),($377|0),($378|0),($379|0),($381|0),($382|0)); //@line 1128 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $34 = $169;
           $383 = $34;
           $30 = $383;
           $31 = 71;
           $384 = $30;
           $33 = 72; //@line 1187 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $385 = (__ZN10emscripten8internal6TypeIDI9MidiSynthE3getEv()|0); //@line 1189 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $386 = (__ZNK10emscripten8internal12WithPoliciesIJNS_18allow_raw_pointersEEE11ArgTypeListIJP9MidiSynthEE8getCountEv($32)|0); //@line 1190 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $387 = (__ZNK10emscripten8internal12WithPoliciesIJNS_18allow_raw_pointersEEE11ArgTypeListIJP9MidiSynthEE8getTypesEv($32)|0); //@line 1191 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $388 = $33; //@line 1192 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $29 = $388;
           $389 = (__ZN10emscripten8internal19getGenericSignatureIJiiEEEPKcv()|0); //@line 399 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $390 = $33; //@line 1193 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $391 = $31; //@line 1194 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           __embind_register_class_constructor(($385|0),($386|0),($387|0),($389|0),($390|0),($391|0)); //@line 1188 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           HEAP32[$170>>2] = (73); //@line 68 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
           $$index59 = ((($170)) + 4|0); //@line 68 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
           HEAP32[$$index59>>2] = 0; //@line 68 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
           ;HEAP8[$28>>0]=HEAP8[$170>>0]|0;HEAP8[$28+1>>0]=HEAP8[$170+1>>0]|0;HEAP8[$28+2>>0]=HEAP8[$170+2>>0]|0;HEAP8[$28+3>>0]=HEAP8[$170+3>>0]|0;HEAP8[$28+4>>0]=HEAP8[$170+4>>0]|0;HEAP8[$28+5>>0]=HEAP8[$170+5>>0]|0;HEAP8[$28+6>>0]=HEAP8[$170+6>>0]|0;HEAP8[$28+7>>0]=HEAP8[$170+7>>0]|0;
           $$field61 = HEAP32[$28>>2]|0;
           $$index63 = ((($28)) + 4|0);
           $$field64 = HEAP32[$$index63>>2]|0;
           $23 = $384;
           $24 = 5748;
           HEAP32[$25>>2] = $$field61;
           $$index67 = ((($25)) + 4|0);
           HEAP32[$$index67>>2] = $$field64;
           $392 = $23;
           $26 = 74; //@line 1270 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $393 = (__ZN10emscripten8internal6TypeIDI9MidiSynthE3getEv()|0); //@line 1274 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $394 = $24; //@line 1275 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $395 = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJvNS0_17AllowedRawPointerI9MidiSynthEEhhhEE8getCountEv($27)|0); //@line 1276 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $396 = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJvNS0_17AllowedRawPointerI9MidiSynthEEhhhEE8getTypesEv($27)|0); //@line 1277 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $397 = $26; //@line 1278 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $22 = $397;
           $398 = (__ZN10emscripten8internal19getGenericSignatureIJviiiiiEEEPKcv()|0); //@line 399 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $399 = $26; //@line 1279 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $400 = (__ZN10emscripten8internal10getContextIM9MidiSynthFvhhhEEEPT_RKS5_($25)|0); //@line 1280 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           __embind_register_class_function(($393|0),($394|0),($395|0),($396|0),($398|0),($399|0),($400|0),0); //@line 1273 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           HEAP32[$171>>2] = (75); //@line 69 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
           $$index69 = ((($171)) + 4|0); //@line 69 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
           HEAP32[$$index69>>2] = 0; //@line 69 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
           ;HEAP8[$21>>0]=HEAP8[$171>>0]|0;HEAP8[$21+1>>0]=HEAP8[$171+1>>0]|0;HEAP8[$21+2>>0]=HEAP8[$171+2>>0]|0;HEAP8[$21+3>>0]=HEAP8[$171+3>>0]|0;HEAP8[$21+4>>0]=HEAP8[$171+4>>0]|0;HEAP8[$21+5>>0]=HEAP8[$171+5>>0]|0;HEAP8[$21+6>>0]=HEAP8[$171+6>>0]|0;HEAP8[$21+7>>0]=HEAP8[$171+7>>0]|0;
           $$field71 = HEAP32[$21>>2]|0;
           $$index73 = ((($21)) + 4|0);
           $$field74 = HEAP32[$$index73>>2]|0;
           $16 = $392;
           $17 = 5759;
           HEAP32[$18>>2] = $$field71;
           $$index77 = ((($18)) + 4|0);
           HEAP32[$$index77>>2] = $$field74;
           $401 = $16;
           $19 = 76; //@line 1270 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $402 = (__ZN10emscripten8internal6TypeIDI9MidiSynthE3getEv()|0); //@line 1274 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $403 = $17; //@line 1275 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $404 = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJvNS0_17AllowedRawPointerI9MidiSynthEEhhEE8getCountEv($20)|0); //@line 1276 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $405 = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJvNS0_17AllowedRawPointerI9MidiSynthEEhhEE8getTypesEv($20)|0); //@line 1277 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $406 = $19; //@line 1278 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $15 = $406;
           $407 = (__ZN10emscripten8internal19getGenericSignatureIJviiiiEEEPKcv()|0); //@line 399 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $408 = $19; //@line 1279 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $409 = (__ZN10emscripten8internal10getContextIM9MidiSynthFvhhEEEPT_RKS5_($18)|0); //@line 1280 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           __embind_register_class_function(($402|0),($403|0),($404|0),($405|0),($407|0),($408|0),($409|0),0); //@line 1273 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           HEAP32[$172>>2] = (77); //@line 70 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
           $$index79 = ((($172)) + 4|0); //@line 70 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
           HEAP32[$$index79>>2] = 0; //@line 70 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
           ;HEAP8[$14>>0]=HEAP8[$172>>0]|0;HEAP8[$14+1>>0]=HEAP8[$172+1>>0]|0;HEAP8[$14+2>>0]=HEAP8[$172+2>>0]|0;HEAP8[$14+3>>0]=HEAP8[$172+3>>0]|0;HEAP8[$14+4>>0]=HEAP8[$172+4>>0]|0;HEAP8[$14+5>>0]=HEAP8[$172+5>>0]|0;HEAP8[$14+6>>0]=HEAP8[$172+6>>0]|0;HEAP8[$14+7>>0]=HEAP8[$172+7>>0]|0;
           $$field81 = HEAP32[$14>>2]|0;
           $$index83 = ((($14)) + 4|0);
           $$field84 = HEAP32[$$index83>>2]|0;
           $9 = $401;
           $10 = 5771;
           HEAP32[$11>>2] = $$field81;
           $$index87 = ((($11)) + 4|0);
           HEAP32[$$index87>>2] = $$field84;
           $410 = $9;
           $12 = 76; //@line 1270 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $411 = (__ZN10emscripten8internal6TypeIDI9MidiSynthE3getEv()|0); //@line 1274 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $412 = $10; //@line 1275 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $413 = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJvNS0_17AllowedRawPointerI9MidiSynthEEhhEE8getCountEv($13)|0); //@line 1276 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $414 = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJvNS0_17AllowedRawPointerI9MidiSynthEEhhEE8getTypesEv($13)|0); //@line 1277 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $415 = $12; //@line 1278 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $8 = $415;
           $416 = (__ZN10emscripten8internal19getGenericSignatureIJviiiiEEEPKcv()|0); //@line 399 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $417 = $12; //@line 1279 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $418 = (__ZN10emscripten8internal10getContextIM9MidiSynthFvhhEEEPT_RKS5_($11)|0); //@line 1280 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           __embind_register_class_function(($411|0),($412|0),($413|0),($414|0),($416|0),($417|0),($418|0),0); //@line 1273 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           HEAP32[$173>>2] = (78); //@line 71 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
           $$index89 = ((($173)) + 4|0); //@line 71 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
           HEAP32[$$index89>>2] = 0; //@line 71 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
           ;HEAP8[$7>>0]=HEAP8[$173>>0]|0;HEAP8[$7+1>>0]=HEAP8[$173+1>>0]|0;HEAP8[$7+2>>0]=HEAP8[$173+2>>0]|0;HEAP8[$7+3>>0]=HEAP8[$173+3>>0]|0;HEAP8[$7+4>>0]=HEAP8[$173+4>>0]|0;HEAP8[$7+5>>0]=HEAP8[$173+5>>0]|0;HEAP8[$7+6>>0]=HEAP8[$173+6>>0]|0;HEAP8[$7+7>>0]=HEAP8[$173+7>>0]|0;
           $$field91 = HEAP32[$7>>2]|0;
           $$index93 = ((($7)) + 4|0);
           $$field94 = HEAP32[$$index93>>2]|0;
           $2 = $410;
           $3 = 5789;
           HEAP32[$4>>2] = $$field91;
           $$index97 = ((($4)) + 4|0);
           HEAP32[$$index97>>2] = $$field94;
           $5 = 79; //@line 1270 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $419 = (__ZN10emscripten8internal6TypeIDI9MidiSynthE3getEv()|0); //@line 1274 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $420 = $3; //@line 1275 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $421 = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJvNS0_17AllowedRawPointerI9MidiSynthEEhsEE8getCountEv($6)|0); //@line 1276 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $422 = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJvNS0_17AllowedRawPointerI9MidiSynthEEhsEE8getTypesEv($6)|0); //@line 1277 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $423 = $5; //@line 1278 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $1 = $423;
           $424 = (__ZN10emscripten8internal19getGenericSignatureIJviiiiEEEPKcv()|0); //@line 399 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $425 = $5; //@line 1279 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           $426 = (__ZN10emscripten8internal10getContextIM9MidiSynthFvhsEEEPT_RKS5_($4)|0); //@line 1280 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           __embind_register_class_function(($419|0),($420|0),($421|0),($422|0),($424|0),($425|0),($426|0),0); //@line 1273 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
           STACKTOP = sp;return; //@line 72 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
          }
         }
         $435 = ___cxa_find_matching_catch_2()|0;
         $436 = tempRet0;
         $151 = $435; //@line 72 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
         $152 = $436; //@line 72 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
         __ZN10emscripten12value_objectI10HeapRegionI10InstrumentEED2Ev($156); //@line 47 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
         $437 = $151; //@line 31 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
         $438 = $152; //@line 31 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
         ___resumeException($437|0);
         // unreachable;
        }
       }
       $433 = ___cxa_find_matching_catch_2()|0;
       $434 = tempRet0;
       $151 = $433; //@line 72 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
       $152 = $434; //@line 72 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
       __ZN10emscripten12value_objectI10HeapRegionI11LerpProgramEED2Ev($155); //@line 43 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
       $437 = $151; //@line 31 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
       $438 = $152; //@line 31 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
       ___resumeException($437|0);
       // unreachable;
      }
     }
     $431 = ___cxa_find_matching_catch_2()|0;
     $432 = tempRet0;
     $151 = $431; //@line 72 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
     $152 = $432; //@line 72 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
     __ZN10emscripten12value_objectI10HeapRegionI9LerpStageEED2Ev($154); //@line 39 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
     $437 = $151; //@line 31 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
     $438 = $152; //@line 31 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
     ___resumeException($437|0);
     // unreachable;
    }
   }
   $429 = ___cxa_find_matching_catch_2()|0;
   $430 = tempRet0;
   $151 = $429; //@line 72 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
   $152 = $430; //@line 72 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
   __ZN10emscripten12value_objectI10HeapRegionIhEED2Ev($153); //@line 35 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
   $437 = $151; //@line 31 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
   $438 = $152; //@line 31 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
   ___resumeException($437|0);
   // unreachable;
  }
 }
 $427 = ___cxa_find_matching_catch_2()|0;
 $428 = tempRet0;
 $151 = $427; //@line 72 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
 $152 = $428; //@line 72 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
 __ZN10emscripten12value_objectI10HeapRegionIaEED2Ev($150); //@line 31 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
 $437 = $151; //@line 31 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
 $438 = $152; //@line 31 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
 ___resumeException($437|0);
 // unreachable;
}
function __ZN10emscripten8functionIvJhEJEEEvPKcPFT_DpT0_EDpT1_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $5 = sp + 16|0;
 $3 = $0;
 $4 = $1;
 $6 = 80; //@line 420 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $7 = $3; //@line 422 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $8 = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJvhEE8getCountEv($5)|0); //@line 423 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $9 = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJvhEE8getTypesEv($5)|0); //@line 424 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $10 = $6; //@line 425 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $2 = $10;
 $11 = (__ZN10emscripten8internal19getGenericSignatureIJviiEEEPKcv()|0); //@line 399 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $12 = $6; //@line 426 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $13 = $4; //@line 427 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 __embind_register_function(($7|0),($8|0),($9|0),($11|0),($12|0),($13|0)); //@line 421 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 STACKTOP = sp;return; //@line 428 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10emscripten8functionIK10HeapRegionIhEJEJEEEvPKcPFT_DpT0_EDpT1_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $5 = sp + 16|0;
 $3 = $0;
 $4 = $1;
 $6 = 81; //@line 420 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $7 = $3; //@line 422 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $8 = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJK10HeapRegionIhEEE8getCountEv($5)|0); //@line 423 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $9 = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJK10HeapRegionIhEEE8getTypesEv($5)|0); //@line 424 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $10 = $6; //@line 425 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $2 = $10;
 $11 = (__ZN10emscripten8internal19getGenericSignatureIJiiEEEPKcv()|0); //@line 399 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $12 = $6; //@line 426 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $13 = $4; //@line 427 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 __embind_register_function(($7|0),($8|0),($9|0),($11|0),($12|0),($13|0)); //@line 421 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 STACKTOP = sp;return; //@line 428 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10emscripten8functionIK10HeapRegionIaEJEJEEEvPKcPFT_DpT0_EDpT1_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $5 = sp + 16|0;
 $3 = $0;
 $4 = $1;
 $6 = 82; //@line 420 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $7 = $3; //@line 422 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $8 = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJK10HeapRegionIaEEE8getCountEv($5)|0); //@line 423 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $9 = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJK10HeapRegionIaEEE8getTypesEv($5)|0); //@line 424 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $10 = $6; //@line 425 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $2 = $10;
 $11 = (__ZN10emscripten8internal19getGenericSignatureIJiiEEEPKcv()|0); //@line 399 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $12 = $6; //@line 426 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $13 = $4; //@line 427 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 __embind_register_function(($7|0),($8|0),($9|0),($11|0),($12|0),($13|0)); //@line 421 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 STACKTOP = sp;return; //@line 428 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10emscripten8functionIK10HeapRegionI9LerpStageEJEJEEEvPKcPFT_DpT0_EDpT1_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $5 = sp + 16|0;
 $3 = $0;
 $4 = $1;
 $6 = 83; //@line 420 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $7 = $3; //@line 422 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $8 = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJK10HeapRegionI9LerpStageEEE8getCountEv($5)|0); //@line 423 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $9 = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJK10HeapRegionI9LerpStageEEE8getTypesEv($5)|0); //@line 424 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $10 = $6; //@line 425 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $2 = $10;
 $11 = (__ZN10emscripten8internal19getGenericSignatureIJiiEEEPKcv()|0); //@line 399 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $12 = $6; //@line 426 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $13 = $4; //@line 427 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 __embind_register_function(($7|0),($8|0),($9|0),($11|0),($12|0),($13|0)); //@line 421 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 STACKTOP = sp;return; //@line 428 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10emscripten8functionIK10HeapRegionI11LerpProgramEJEJEEEvPKcPFT_DpT0_EDpT1_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $5 = sp + 16|0;
 $3 = $0;
 $4 = $1;
 $6 = 84; //@line 420 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $7 = $3; //@line 422 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $8 = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJK10HeapRegionI11LerpProgramEEE8getCountEv($5)|0); //@line 423 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $9 = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJK10HeapRegionI11LerpProgramEEE8getTypesEv($5)|0); //@line 424 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $10 = $6; //@line 425 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $2 = $10;
 $11 = (__ZN10emscripten8internal19getGenericSignatureIJiiEEEPKcv()|0); //@line 399 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $12 = $6; //@line 426 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $13 = $4; //@line 427 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 __embind_register_function(($7|0),($8|0),($9|0),($11|0),($12|0),($13|0)); //@line 421 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 STACKTOP = sp;return; //@line 428 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10emscripten8functionIK10HeapRegionI10InstrumentEJEJEEEvPKcPFT_DpT0_EDpT1_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $5 = sp + 16|0;
 $3 = $0;
 $4 = $1;
 $6 = 85; //@line 420 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $7 = $3; //@line 422 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $8 = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJK10HeapRegionI10InstrumentEEE8getCountEv($5)|0); //@line 423 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $9 = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJK10HeapRegionI10InstrumentEEE8getTypesEv($5)|0); //@line 424 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $10 = $6; //@line 425 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $2 = $10;
 $11 = (__ZN10emscripten8internal19getGenericSignatureIJiiEEEPKcv()|0); //@line 399 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $12 = $6; //@line 426 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $13 = $4; //@line 427 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 __embind_register_function(($7|0),($8|0),($9|0),($11|0),($12|0),($13|0)); //@line 421 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 STACKTOP = sp;return; //@line 428 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10emscripten12value_objectI10HeapRegionIaEEC2EPKc($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $3 = 0, $4 = 0;
 var $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $4 = $0;
 $5 = $1;
 $10 = $4;
 __ZN10emscripten8internal11noncopyableC2Ev($10); //@line 766 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $6 = 86; //@line 769 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $7 = 87; //@line 770 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 __THREW__ = 0;
 $11 = (invoke_i(88)|0); //@line 773 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $12 = __THREW__; __THREW__ = 0;
 $13 = $12&1;
 if (!($13)) {
  $14 = $5; //@line 774 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $15 = $6; //@line 775 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $3 = $15;
  $16 = (__ZN10emscripten8internal19getGenericSignatureIJiEEEPKcv()|0); //@line 399 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $17 = $6; //@line 776 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $18 = $7; //@line 777 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $2 = $18;
  $19 = (__ZN10emscripten8internal19getGenericSignatureIJviEEEPKcv()|0); //@line 399 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $20 = $7; //@line 778 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  __THREW__ = 0;
  invoke_viiiiii(89,($11|0),($14|0),($16|0),($17|0),($19|0),($20|0)); //@line 772 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $21 = __THREW__; __THREW__ = 0;
  $22 = $21&1;
  if (!($22)) {
   STACKTOP = sp;return; //@line 779 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  }
 }
 $23 = ___cxa_find_matching_catch_2()|0;
 $24 = tempRet0;
 $8 = $23; //@line 779 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $9 = $24; //@line 779 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 __ZN10emscripten8internal11noncopyableD2Ev($10); //@line 779 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $25 = $8; //@line 779 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $26 = $9; //@line 779 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 ___resumeException($25|0);
 // unreachable;
}
function __ZN10emscripten12value_objectI10HeapRegionIaEE5fieldIS2_jEERS3_PKcMT_T0_($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $7 = sp + 8|0;
 $5 = $0;
 $6 = $1;
 HEAP32[$7>>2] = $2;
 $10 = $5;
 $8 = 90; //@line 790 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $9 = 91; //@line 792 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $11 = (__ZN10emscripten8internal6TypeIDI10HeapRegionIaEE3getEv()|0); //@line 796 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $12 = $6; //@line 797 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $13 = (__ZN10emscripten8internal6TypeIDIjE3getEv()|0); //@line 798 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $14 = $8; //@line 799 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $4 = $14;
 $15 = (__ZN10emscripten8internal19getGenericSignatureIJiiiEEEPKcv()|0); //@line 399 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $16 = $8; //@line 800 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $17 = (__ZN10emscripten8internal10getContextIM10HeapRegionIaEjEEPT_RKS5_($7)|0); //@line 801 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $18 = (__ZN10emscripten8internal6TypeIDIjE3getEv()|0); //@line 802 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $19 = $9; //@line 803 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $3 = $19;
 $20 = (__ZN10emscripten8internal19getGenericSignatureIJviiiEEEPKcv()|0); //@line 399 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $21 = $9; //@line 804 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $22 = (__ZN10emscripten8internal10getContextIM10HeapRegionIaEjEEPT_RKS5_($7)|0); //@line 805 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 __embind_register_value_object_field(($11|0),($12|0),($13|0),($15|0),($16|0),($17|0),($18|0),($20|0),($21|0),($22|0)); //@line 795 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 STACKTOP = sp;return ($10|0); //@line 806 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10emscripten12value_objectI10HeapRegionIaEED2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $4 = $1;
 __THREW__ = 0;
 $5 = (invoke_i(88)|0); //@line 783 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $6 = __THREW__; __THREW__ = 0;
 $7 = $6&1;
 if (!($7)) {
  __THREW__ = 0;
  invoke_vi(92,($5|0)); //@line 783 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $8 = __THREW__; __THREW__ = 0;
  $9 = $8&1;
  if (!($9)) {
   __ZN10emscripten8internal11noncopyableD2Ev($4); //@line 784 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
   STACKTOP = sp;return; //@line 784 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  }
 }
 $10 = ___cxa_find_matching_catch_3(0|0)|0;
 $11 = tempRet0;
 $2 = $10; //@line 784 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $3 = $11; //@line 784 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 __ZN10emscripten8internal11noncopyableD2Ev($4); //@line 784 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $12 = $2; //@line 784 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 ___clang_call_terminate($12); //@line 784 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 // unreachable; //@line 784 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10emscripten12value_objectI10HeapRegionIhEEC2EPKc($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $3 = 0, $4 = 0;
 var $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $4 = $0;
 $5 = $1;
 $10 = $4;
 __ZN10emscripten8internal11noncopyableC2Ev($10); //@line 766 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $6 = 93; //@line 769 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $7 = 94; //@line 770 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 __THREW__ = 0;
 $11 = (invoke_i(95)|0); //@line 773 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $12 = __THREW__; __THREW__ = 0;
 $13 = $12&1;
 if (!($13)) {
  $14 = $5; //@line 774 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $15 = $6; //@line 775 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $3 = $15;
  $16 = (__ZN10emscripten8internal19getGenericSignatureIJiEEEPKcv()|0); //@line 399 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $17 = $6; //@line 776 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $18 = $7; //@line 777 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $2 = $18;
  $19 = (__ZN10emscripten8internal19getGenericSignatureIJviEEEPKcv()|0); //@line 399 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $20 = $7; //@line 778 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  __THREW__ = 0;
  invoke_viiiiii(89,($11|0),($14|0),($16|0),($17|0),($19|0),($20|0)); //@line 772 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $21 = __THREW__; __THREW__ = 0;
  $22 = $21&1;
  if (!($22)) {
   STACKTOP = sp;return; //@line 779 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  }
 }
 $23 = ___cxa_find_matching_catch_2()|0;
 $24 = tempRet0;
 $8 = $23; //@line 779 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $9 = $24; //@line 779 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 __ZN10emscripten8internal11noncopyableD2Ev($10); //@line 779 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $25 = $8; //@line 779 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $26 = $9; //@line 779 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 ___resumeException($25|0);
 // unreachable;
}
function __ZN10emscripten12value_objectI10HeapRegionIhEE5fieldIS2_jEERS3_PKcMT_T0_($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $7 = sp + 8|0;
 $5 = $0;
 $6 = $1;
 HEAP32[$7>>2] = $2;
 $10 = $5;
 $8 = 96; //@line 790 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $9 = 97; //@line 792 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $11 = (__ZN10emscripten8internal6TypeIDI10HeapRegionIhEE3getEv()|0); //@line 796 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $12 = $6; //@line 797 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $13 = (__ZN10emscripten8internal6TypeIDIjE3getEv()|0); //@line 798 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $14 = $8; //@line 799 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $4 = $14;
 $15 = (__ZN10emscripten8internal19getGenericSignatureIJiiiEEEPKcv()|0); //@line 399 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $16 = $8; //@line 800 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $17 = (__ZN10emscripten8internal10getContextIM10HeapRegionIhEjEEPT_RKS5_($7)|0); //@line 801 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $18 = (__ZN10emscripten8internal6TypeIDIjE3getEv()|0); //@line 802 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $19 = $9; //@line 803 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $3 = $19;
 $20 = (__ZN10emscripten8internal19getGenericSignatureIJviiiEEEPKcv()|0); //@line 399 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $21 = $9; //@line 804 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $22 = (__ZN10emscripten8internal10getContextIM10HeapRegionIhEjEEPT_RKS5_($7)|0); //@line 805 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 __embind_register_value_object_field(($11|0),($12|0),($13|0),($15|0),($16|0),($17|0),($18|0),($20|0),($21|0),($22|0)); //@line 795 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 STACKTOP = sp;return ($10|0); //@line 806 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10emscripten12value_objectI10HeapRegionIhEED2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $4 = $1;
 __THREW__ = 0;
 $5 = (invoke_i(95)|0); //@line 783 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $6 = __THREW__; __THREW__ = 0;
 $7 = $6&1;
 if (!($7)) {
  __THREW__ = 0;
  invoke_vi(92,($5|0)); //@line 783 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $8 = __THREW__; __THREW__ = 0;
  $9 = $8&1;
  if (!($9)) {
   __ZN10emscripten8internal11noncopyableD2Ev($4); //@line 784 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
   STACKTOP = sp;return; //@line 784 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  }
 }
 $10 = ___cxa_find_matching_catch_3(0|0)|0;
 $11 = tempRet0;
 $2 = $10; //@line 784 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $3 = $11; //@line 784 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 __ZN10emscripten8internal11noncopyableD2Ev($4); //@line 784 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $12 = $2; //@line 784 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 ___clang_call_terminate($12); //@line 784 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 // unreachable; //@line 784 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10emscripten12value_objectI10HeapRegionI9LerpStageEEC2EPKc($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $3 = 0, $4 = 0;
 var $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $4 = $0;
 $5 = $1;
 $10 = $4;
 __ZN10emscripten8internal11noncopyableC2Ev($10); //@line 766 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $6 = 98; //@line 769 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $7 = 99; //@line 770 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 __THREW__ = 0;
 $11 = (invoke_i(100)|0); //@line 773 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $12 = __THREW__; __THREW__ = 0;
 $13 = $12&1;
 if (!($13)) {
  $14 = $5; //@line 774 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $15 = $6; //@line 775 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $3 = $15;
  $16 = (__ZN10emscripten8internal19getGenericSignatureIJiEEEPKcv()|0); //@line 399 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $17 = $6; //@line 776 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $18 = $7; //@line 777 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $2 = $18;
  $19 = (__ZN10emscripten8internal19getGenericSignatureIJviEEEPKcv()|0); //@line 399 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $20 = $7; //@line 778 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  __THREW__ = 0;
  invoke_viiiiii(89,($11|0),($14|0),($16|0),($17|0),($19|0),($20|0)); //@line 772 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $21 = __THREW__; __THREW__ = 0;
  $22 = $21&1;
  if (!($22)) {
   STACKTOP = sp;return; //@line 779 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  }
 }
 $23 = ___cxa_find_matching_catch_2()|0;
 $24 = tempRet0;
 $8 = $23; //@line 779 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $9 = $24; //@line 779 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 __ZN10emscripten8internal11noncopyableD2Ev($10); //@line 779 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $25 = $8; //@line 779 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $26 = $9; //@line 779 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 ___resumeException($25|0);
 // unreachable;
}
function __ZN10emscripten12value_objectI10HeapRegionI9LerpStageEE5fieldIS3_jEERS4_PKcMT_T0_($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $7 = sp + 8|0;
 $5 = $0;
 $6 = $1;
 HEAP32[$7>>2] = $2;
 $10 = $5;
 $8 = 101; //@line 790 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $9 = 102; //@line 792 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $11 = (__ZN10emscripten8internal6TypeIDI10HeapRegionI9LerpStageEE3getEv()|0); //@line 796 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $12 = $6; //@line 797 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $13 = (__ZN10emscripten8internal6TypeIDIjE3getEv()|0); //@line 798 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $14 = $8; //@line 799 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $4 = $14;
 $15 = (__ZN10emscripten8internal19getGenericSignatureIJiiiEEEPKcv()|0); //@line 399 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $16 = $8; //@line 800 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $17 = (__ZN10emscripten8internal10getContextIM10HeapRegionI9LerpStageEjEEPT_RKS6_($7)|0); //@line 801 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $18 = (__ZN10emscripten8internal6TypeIDIjE3getEv()|0); //@line 802 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $19 = $9; //@line 803 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $3 = $19;
 $20 = (__ZN10emscripten8internal19getGenericSignatureIJviiiEEEPKcv()|0); //@line 399 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $21 = $9; //@line 804 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $22 = (__ZN10emscripten8internal10getContextIM10HeapRegionI9LerpStageEjEEPT_RKS6_($7)|0); //@line 805 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 __embind_register_value_object_field(($11|0),($12|0),($13|0),($15|0),($16|0),($17|0),($18|0),($20|0),($21|0),($22|0)); //@line 795 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 STACKTOP = sp;return ($10|0); //@line 806 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10emscripten12value_objectI10HeapRegionI9LerpStageEED2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $4 = $1;
 __THREW__ = 0;
 $5 = (invoke_i(100)|0); //@line 783 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $6 = __THREW__; __THREW__ = 0;
 $7 = $6&1;
 if (!($7)) {
  __THREW__ = 0;
  invoke_vi(92,($5|0)); //@line 783 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $8 = __THREW__; __THREW__ = 0;
  $9 = $8&1;
  if (!($9)) {
   __ZN10emscripten8internal11noncopyableD2Ev($4); //@line 784 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
   STACKTOP = sp;return; //@line 784 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  }
 }
 $10 = ___cxa_find_matching_catch_3(0|0)|0;
 $11 = tempRet0;
 $2 = $10; //@line 784 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $3 = $11; //@line 784 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 __ZN10emscripten8internal11noncopyableD2Ev($4); //@line 784 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $12 = $2; //@line 784 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 ___clang_call_terminate($12); //@line 784 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 // unreachable; //@line 784 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10emscripten12value_objectI10HeapRegionI11LerpProgramEEC2EPKc($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $3 = 0, $4 = 0;
 var $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $4 = $0;
 $5 = $1;
 $10 = $4;
 __ZN10emscripten8internal11noncopyableC2Ev($10); //@line 766 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $6 = 103; //@line 769 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $7 = 104; //@line 770 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 __THREW__ = 0;
 $11 = (invoke_i(105)|0); //@line 773 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $12 = __THREW__; __THREW__ = 0;
 $13 = $12&1;
 if (!($13)) {
  $14 = $5; //@line 774 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $15 = $6; //@line 775 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $3 = $15;
  $16 = (__ZN10emscripten8internal19getGenericSignatureIJiEEEPKcv()|0); //@line 399 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $17 = $6; //@line 776 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $18 = $7; //@line 777 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $2 = $18;
  $19 = (__ZN10emscripten8internal19getGenericSignatureIJviEEEPKcv()|0); //@line 399 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $20 = $7; //@line 778 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  __THREW__ = 0;
  invoke_viiiiii(89,($11|0),($14|0),($16|0),($17|0),($19|0),($20|0)); //@line 772 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $21 = __THREW__; __THREW__ = 0;
  $22 = $21&1;
  if (!($22)) {
   STACKTOP = sp;return; //@line 779 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  }
 }
 $23 = ___cxa_find_matching_catch_2()|0;
 $24 = tempRet0;
 $8 = $23; //@line 779 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $9 = $24; //@line 779 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 __ZN10emscripten8internal11noncopyableD2Ev($10); //@line 779 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $25 = $8; //@line 779 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $26 = $9; //@line 779 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 ___resumeException($25|0);
 // unreachable;
}
function __ZN10emscripten12value_objectI10HeapRegionI11LerpProgramEE5fieldIS3_jEERS4_PKcMT_T0_($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $7 = sp + 8|0;
 $5 = $0;
 $6 = $1;
 HEAP32[$7>>2] = $2;
 $10 = $5;
 $8 = 106; //@line 790 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $9 = 107; //@line 792 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $11 = (__ZN10emscripten8internal6TypeIDI10HeapRegionI11LerpProgramEE3getEv()|0); //@line 796 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $12 = $6; //@line 797 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $13 = (__ZN10emscripten8internal6TypeIDIjE3getEv()|0); //@line 798 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $14 = $8; //@line 799 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $4 = $14;
 $15 = (__ZN10emscripten8internal19getGenericSignatureIJiiiEEEPKcv()|0); //@line 399 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $16 = $8; //@line 800 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $17 = (__ZN10emscripten8internal10getContextIM10HeapRegionI11LerpProgramEjEEPT_RKS6_($7)|0); //@line 801 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $18 = (__ZN10emscripten8internal6TypeIDIjE3getEv()|0); //@line 802 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $19 = $9; //@line 803 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $3 = $19;
 $20 = (__ZN10emscripten8internal19getGenericSignatureIJviiiEEEPKcv()|0); //@line 399 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $21 = $9; //@line 804 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $22 = (__ZN10emscripten8internal10getContextIM10HeapRegionI11LerpProgramEjEEPT_RKS6_($7)|0); //@line 805 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 __embind_register_value_object_field(($11|0),($12|0),($13|0),($15|0),($16|0),($17|0),($18|0),($20|0),($21|0),($22|0)); //@line 795 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 STACKTOP = sp;return ($10|0); //@line 806 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10emscripten12value_objectI10HeapRegionI11LerpProgramEED2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $4 = $1;
 __THREW__ = 0;
 $5 = (invoke_i(105)|0); //@line 783 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $6 = __THREW__; __THREW__ = 0;
 $7 = $6&1;
 if (!($7)) {
  __THREW__ = 0;
  invoke_vi(92,($5|0)); //@line 783 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $8 = __THREW__; __THREW__ = 0;
  $9 = $8&1;
  if (!($9)) {
   __ZN10emscripten8internal11noncopyableD2Ev($4); //@line 784 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
   STACKTOP = sp;return; //@line 784 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  }
 }
 $10 = ___cxa_find_matching_catch_3(0|0)|0;
 $11 = tempRet0;
 $2 = $10; //@line 784 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $3 = $11; //@line 784 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 __ZN10emscripten8internal11noncopyableD2Ev($4); //@line 784 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $12 = $2; //@line 784 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 ___clang_call_terminate($12); //@line 784 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 // unreachable; //@line 784 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10emscripten12value_objectI10HeapRegionI10InstrumentEEC2EPKc($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $3 = 0, $4 = 0;
 var $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $4 = $0;
 $5 = $1;
 $10 = $4;
 __ZN10emscripten8internal11noncopyableC2Ev($10); //@line 766 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $6 = 108; //@line 769 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $7 = 109; //@line 770 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 __THREW__ = 0;
 $11 = (invoke_i(110)|0); //@line 773 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $12 = __THREW__; __THREW__ = 0;
 $13 = $12&1;
 if (!($13)) {
  $14 = $5; //@line 774 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $15 = $6; //@line 775 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $3 = $15;
  $16 = (__ZN10emscripten8internal19getGenericSignatureIJiEEEPKcv()|0); //@line 399 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $17 = $6; //@line 776 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $18 = $7; //@line 777 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $2 = $18;
  $19 = (__ZN10emscripten8internal19getGenericSignatureIJviEEEPKcv()|0); //@line 399 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $20 = $7; //@line 778 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  __THREW__ = 0;
  invoke_viiiiii(89,($11|0),($14|0),($16|0),($17|0),($19|0),($20|0)); //@line 772 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $21 = __THREW__; __THREW__ = 0;
  $22 = $21&1;
  if (!($22)) {
   STACKTOP = sp;return; //@line 779 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  }
 }
 $23 = ___cxa_find_matching_catch_2()|0;
 $24 = tempRet0;
 $8 = $23; //@line 779 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $9 = $24; //@line 779 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 __ZN10emscripten8internal11noncopyableD2Ev($10); //@line 779 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $25 = $8; //@line 779 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $26 = $9; //@line 779 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 ___resumeException($25|0);
 // unreachable;
}
function __ZN10emscripten12value_objectI10HeapRegionI10InstrumentEE5fieldIS3_jEERS4_PKcMT_T0_($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $7 = sp + 8|0;
 $5 = $0;
 $6 = $1;
 HEAP32[$7>>2] = $2;
 $10 = $5;
 $8 = 111; //@line 790 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $9 = 112; //@line 792 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $11 = (__ZN10emscripten8internal6TypeIDI10HeapRegionI10InstrumentEE3getEv()|0); //@line 796 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $12 = $6; //@line 797 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $13 = (__ZN10emscripten8internal6TypeIDIjE3getEv()|0); //@line 798 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $14 = $8; //@line 799 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $4 = $14;
 $15 = (__ZN10emscripten8internal19getGenericSignatureIJiiiEEEPKcv()|0); //@line 399 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $16 = $8; //@line 800 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $17 = (__ZN10emscripten8internal10getContextIM10HeapRegionI10InstrumentEjEEPT_RKS6_($7)|0); //@line 801 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $18 = (__ZN10emscripten8internal6TypeIDIjE3getEv()|0); //@line 802 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $19 = $9; //@line 803 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $3 = $19;
 $20 = (__ZN10emscripten8internal19getGenericSignatureIJviiiEEEPKcv()|0); //@line 399 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $21 = $9; //@line 804 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $22 = (__ZN10emscripten8internal10getContextIM10HeapRegionI10InstrumentEjEEPT_RKS6_($7)|0); //@line 805 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 __embind_register_value_object_field(($11|0),($12|0),($13|0),($15|0),($16|0),($17|0),($18|0),($20|0),($21|0),($22|0)); //@line 795 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 STACKTOP = sp;return ($10|0); //@line 806 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10emscripten12value_objectI10HeapRegionI10InstrumentEED2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $4 = $1;
 __THREW__ = 0;
 $5 = (invoke_i(110)|0); //@line 783 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $6 = __THREW__; __THREW__ = 0;
 $7 = $6&1;
 if (!($7)) {
  __THREW__ = 0;
  invoke_vi(92,($5|0)); //@line 783 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $8 = __THREW__; __THREW__ = 0;
  $9 = $8&1;
  if (!($9)) {
   __ZN10emscripten8internal11noncopyableD2Ev($4); //@line 784 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
   STACKTOP = sp;return; //@line 784 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  }
 }
 $10 = ___cxa_find_matching_catch_3(0|0)|0;
 $11 = tempRet0;
 $2 = $10; //@line 784 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $3 = $11; //@line 784 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 __ZN10emscripten8internal11noncopyableD2Ev($4); //@line 784 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $12 = $2; //@line 784 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 ___clang_call_terminate($12); //@line 784 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 // unreachable; //@line 784 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZL13getSampleRatev() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return +19801.980198019803; //@line 19 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
}
function __ZN10emscripten8functionIdJEJEEEvPKcPFT_DpT0_EDpT1_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $5 = sp + 16|0;
 $3 = $0;
 $4 = $1;
 $6 = 113; //@line 420 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $7 = $3; //@line 422 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $8 = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJdEE8getCountEv($5)|0); //@line 423 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $9 = (__ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJdEE8getTypesEv($5)|0); //@line 424 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $10 = $6; //@line 425 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $2 = $10;
 $11 = (__ZN10emscripten8internal19getGenericSignatureIJdiEEEPKcv()|0); //@line 399 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $12 = $6; //@line 426 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $13 = $4; //@line 427 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 __embind_register_function(($7|0),($8|0),($9|0),($11|0),($12|0),($13|0)); //@line 421 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 STACKTOP = sp;return; //@line 428 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZL8getSynthv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (36136|0); //@line 15 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten\bindings.cpp"
}
function __ZN10emscripten8functionIP9MidiSynthJEJNS_17allow_raw_pointerINS_7ret_valEEEEEEvPKcPFT_DpT0_EDpT1_($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $6 = sp + 16|0;
 $4 = $0;
 $5 = $1;
 $7 = 72; //@line 420 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $8 = $4; //@line 422 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $9 = (__ZNK10emscripten8internal12WithPoliciesIJNS_17allow_raw_pointerINS_7ret_valEEEEE11ArgTypeListIJP9MidiSynthEE8getCountEv($6)|0); //@line 423 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $10 = (__ZNK10emscripten8internal12WithPoliciesIJNS_17allow_raw_pointerINS_7ret_valEEEEE11ArgTypeListIJP9MidiSynthEE8getTypesEv($6)|0); //@line 424 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $11 = $7; //@line 425 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $3 = $11;
 $12 = (__ZN10emscripten8internal19getGenericSignatureIJiiEEEPKcv()|0); //@line 399 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $13 = $7; //@line 426 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $14 = $5; //@line 427 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 __embind_register_function(($8|0),($9|0),($10|0),($12|0),($13|0),($14|0)); //@line 421 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 STACKTOP = sp;return; //@line 428 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10emscripten8internal11NoBaseClass6verifyI9LerpStageEEvv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return; //@line 1009 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10emscripten8internal13getActualTypeI9LerpStageEEPKvPT_($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1; //@line 1029 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $3 = (__ZN10emscripten8internal14getLightTypeIDI9LerpStageEEPKvRKT_($2)|0); //@line 1029 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 STACKTOP = sp;return ($3|0); //@line 1029 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10emscripten8internal11NoBaseClass11getUpcasterI9LerpStageEEPFvvEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (0|0); //@line 1017 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10emscripten8internal11NoBaseClass13getDowncasterI9LerpStageEEPFvvEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (0|0); //@line 1022 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10emscripten8internal14raw_destructorI9LerpStageEEvPT_($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1; //@line 452 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $3 = ($2|0)==(0|0); //@line 452 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 if (!($3)) {
  __ZdlPv($2); //@line 452 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 }
 STACKTOP = sp;return; //@line 453 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10emscripten8internal6TypeIDI9LerpStageE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDI9LerpStageE3getEv()|0); //@line 98 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 return ($0|0); //@line 98 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal6TypeIDINS0_17AllowedRawPointerI9LerpStageEEE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDIP9LerpStageE3getEv()|0); //@line 121 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 return ($0|0); //@line 121 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal6TypeIDINS0_17AllowedRawPointerIK9LerpStageEEE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDIPK9LerpStageE3getEv()|0); //@line 121 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 return ($0|0); //@line 121 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal11NoBaseClass3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (0|0); //@line 1012 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10emscripten8internal19getGenericSignatureIJiiEEEPKcv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (6010|0); //@line 389 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10emscripten8internal19getGenericSignatureIJvEEEPKcv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (6008|0); //@line 389 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10emscripten8internal19getGenericSignatureIJviEEEPKcv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (6005|0); //@line 389 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10emscripten8internal11NoBaseClass6verifyI11LerpProgramEEvv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return; //@line 1009 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10emscripten8internal13getActualTypeI11LerpProgramEEPKvPT_($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1; //@line 1029 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $3 = (__ZN10emscripten8internal14getLightTypeIDI11LerpProgramEEPKvRKT_($2)|0); //@line 1029 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 STACKTOP = sp;return ($3|0); //@line 1029 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10emscripten8internal11NoBaseClass11getUpcasterI11LerpProgramEEPFvvEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (0|0); //@line 1017 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10emscripten8internal11NoBaseClass13getDowncasterI11LerpProgramEEPFvvEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (0|0); //@line 1022 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10emscripten8internal14raw_destructorI11LerpProgramEEvPT_($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1; //@line 452 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $3 = ($2|0)==(0|0); //@line 452 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 if (!($3)) {
  __ZdlPv($2); //@line 452 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 }
 STACKTOP = sp;return; //@line 453 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10emscripten8internal6TypeIDI11LerpProgramE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDI11LerpProgramE3getEv()|0); //@line 98 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 return ($0|0); //@line 98 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal6TypeIDINS0_17AllowedRawPointerI11LerpProgramEEE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDIP11LerpProgramE3getEv()|0); //@line 121 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 return ($0|0); //@line 121 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal6TypeIDINS0_17AllowedRawPointerIK11LerpProgramEEE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDIPK11LerpProgramE3getEv()|0); //@line 121 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 return ($0|0); //@line 121 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal11NoBaseClass6verifyI10InstrumentEEvv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return; //@line 1009 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10emscripten8internal13getActualTypeI10InstrumentEEPKvPT_($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1; //@line 1029 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $3 = (__ZN10emscripten8internal14getLightTypeIDI10InstrumentEEPKvRKT_($2)|0); //@line 1029 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 STACKTOP = sp;return ($3|0); //@line 1029 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10emscripten8internal11NoBaseClass11getUpcasterI10InstrumentEEPFvvEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (0|0); //@line 1017 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10emscripten8internal11NoBaseClass13getDowncasterI10InstrumentEEPFvvEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (0|0); //@line 1022 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10emscripten8internal14raw_destructorI10InstrumentEEvPT_($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1; //@line 452 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $3 = ($2|0)==(0|0); //@line 452 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 if (!($3)) {
  __ZdlPv($2); //@line 452 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 }
 STACKTOP = sp;return; //@line 453 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10emscripten8internal6TypeIDI10InstrumentE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDI10InstrumentE3getEv()|0); //@line 98 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 return ($0|0); //@line 98 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal6TypeIDINS0_17AllowedRawPointerI10InstrumentEEE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDIP10InstrumentE3getEv()|0); //@line 121 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 return ($0|0); //@line 121 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal6TypeIDINS0_17AllowedRawPointerIK10InstrumentEEE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDIPK10InstrumentE3getEv()|0); //@line 121 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 return ($0|0); //@line 121 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal11NoBaseClass6verifyI4LerpEEvv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return; //@line 1009 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10emscripten8internal13getActualTypeI4LerpEEPKvPT_($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1; //@line 1029 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $3 = (__ZN10emscripten8internal14getLightTypeIDI4LerpEEPKvRKT_($2)|0); //@line 1029 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 STACKTOP = sp;return ($3|0); //@line 1029 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10emscripten8internal11NoBaseClass11getUpcasterI4LerpEEPFvvEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (0|0); //@line 1017 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10emscripten8internal11NoBaseClass13getDowncasterI4LerpEEPFvvEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (0|0); //@line 1022 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10emscripten8internal14raw_destructorI4LerpEEvPT_($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1; //@line 452 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $3 = ($2|0)==(0|0); //@line 452 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 if (!($3)) {
  __ZdlPv($2); //@line 452 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 }
 STACKTOP = sp;return; //@line 453 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10emscripten8internal6TypeIDI4LerpE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDI4LerpE3getEv()|0); //@line 98 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 return ($0|0); //@line 98 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal6TypeIDINS0_17AllowedRawPointerI4LerpEEE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDIP4LerpE3getEv()|0); //@line 121 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 return ($0|0); //@line 121 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal6TypeIDINS0_17AllowedRawPointerIK4LerpEEE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDIPK4LerpE3getEv()|0); //@line 121 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 return ($0|0); //@line 121 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal12operator_newI4LerpJEEEPT_DpOT0_() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__Znwj(10)|0); //@line 433 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 ;HEAP32[$0>>2]=0|0;HEAP32[$0+4>>2]=0|0;HEAP16[$0+8>>1]=0|0; //@line 433 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 __ZN4LerpC2Ev($0); //@line 433 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 return ($0|0); //@line 433 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10emscripten8internal7InvokerIP4LerpJEE6invokeEPFS3_vE($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1; //@line 330 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $3 = (FUNCTION_TABLE_i[$2 & 127]()|0); //@line 330 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $4 = (__ZN10emscripten8internal11BindingTypeIP4LerpE10toWireTypeES3_($3)|0); //@line 329 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 STACKTOP = sp;return ($4|0); //@line 329 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZNK10emscripten8internal12WithPoliciesIJNS_18allow_raw_pointersEEE11ArgTypeListIJP4LerpEE8getCountEv($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 STACKTOP = sp;return 1; //@line 224 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZNK10emscripten8internal12WithPoliciesIJNS_18allow_raw_pointersEEE11ArgTypeListIJP4LerpEE8getTypesEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJNS0_17AllowedRawPointerI4LerpEEEEEE3getEv()|0); //@line 228 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 STACKTOP = sp;return ($2|0); //@line 228 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN4Lerp8sampleEmEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = (__ZNV4Lerp6sampleEv($2)|0); //@line 67 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
 STACKTOP = sp;return ($3|0); //@line 67 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
}
function __ZN10emscripten8internal13MethodInvokerIM4LerpFhvEhPS2_JEE6invokeERKS4_S5_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$field = 0, $$field2 = 0, $$index1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $4 = sp + 8|0;
 $2 = $0;
 $3 = $1;
 $5 = $3; //@line 494 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $6 = (__ZN10emscripten8internal11BindingTypeIP4LerpE12fromWireTypeES3_($5)|0); //@line 494 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $7 = $2; //@line 494 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $$field = HEAP32[$7>>2]|0; //@line 494 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $$index1 = ((($7)) + 4|0); //@line 494 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $$field2 = HEAP32[$$index1>>2]|0; //@line 494 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $8 = $$field2 >> 1; //@line 494 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $9 = (($6) + ($8)|0); //@line 494 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $10 = $$field2 & 1; //@line 494 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $11 = ($10|0)!=(0); //@line 494 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 if ($11) {
  $12 = HEAP32[$9>>2]|0; //@line 494 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $13 = (($12) + ($$field)|0); //@line 494 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $14 = HEAP32[$13>>2]|0; //@line 494 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $16 = $14;
 } else {
  $15 = $$field; //@line 494 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $16 = $15;
 }
 $17 = (FUNCTION_TABLE_ii[$16 & 127]($9)|0); //@line 494 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 HEAP8[$4>>0] = $17; //@line 494 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $18 = (__ZN10emscripten8internal11BindingTypeIhE10toWireTypeERKh($4)|0); //@line 493 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 STACKTOP = sp;return ($18|0); //@line 493 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJhNS0_17AllowedRawPointerI4LerpEEEE8getCountEv($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 STACKTOP = sp;return 2; //@line 224 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJhNS0_17AllowedRawPointerI4LerpEEEE8getTypesEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJhNS0_17AllowedRawPointerI4LerpEEEEEE3getEv()|0); //@line 228 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 STACKTOP = sp;return ($2|0); //@line 228 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal19getGenericSignatureIJiiiEEEPKcv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (5906|0); //@line 389 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10emscripten8internal10getContextIM4LerpFhvEEEPT_RKS5_($0) {
 $0 = $0|0;
 var $$field = 0, $$field2 = 0, $$index1 = 0, $$index5 = 0, $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__Znwj(8)|0); //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $3 = $1; //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $$field = HEAP32[$3>>2]|0; //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $$index1 = ((($3)) + 4|0); //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $$field2 = HEAP32[$$index1>>2]|0; //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 HEAP32[$2>>2] = $$field; //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $$index5 = ((($2)) + 4|0); //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 HEAP32[$$index5>>2] = $$field2; //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 STACKTOP = sp;return ($2|0); //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN4Lerp7startEmEhh($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $6 = $3;
 $7 = $4; //@line 68 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
 $8 = $5; //@line 68 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
 __ZNV4Lerp5startEhh($6,$7,$8); //@line 68 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
 STACKTOP = sp;return; //@line 68 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
}
function __ZN10emscripten8internal13MethodInvokerIM4LerpFvhhEvPS2_JhhEE6invokeERKS4_S5_hh($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $$field = 0, $$field2 = 0, $$index1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $4 = 0, $5 = 0, $6 = 0;
 var $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $4 = $0;
 $5 = $1;
 $6 = $2;
 $7 = $3;
 $8 = $5; //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $9 = (__ZN10emscripten8internal11BindingTypeIP4LerpE12fromWireTypeES3_($8)|0); //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $10 = $4; //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $$field = HEAP32[$10>>2]|0; //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $$index1 = ((($10)) + 4|0); //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $$field2 = HEAP32[$$index1>>2]|0; //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $11 = $$field2 >> 1; //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $12 = (($9) + ($11)|0); //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $13 = $$field2 & 1; //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $14 = ($13|0)!=(0); //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 if ($14) {
  $15 = HEAP32[$12>>2]|0; //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $16 = (($15) + ($$field)|0); //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $17 = HEAP32[$16>>2]|0; //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $23 = $17;
 } else {
  $18 = $$field; //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $23 = $18;
 }
 $19 = $6; //@line 511 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $20 = (__ZN10emscripten8internal11BindingTypeIhE12fromWireTypeEh($19)|0); //@line 511 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $21 = $7; //@line 511 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $22 = (__ZN10emscripten8internal11BindingTypeIhE12fromWireTypeEh($21)|0); //@line 511 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 FUNCTION_TABLE_viii[$23 & 127]($12,$20,$22); //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 STACKTOP = sp;return; //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJvNS0_17AllowedRawPointerI4LerpEEhhEE8getCountEv($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 STACKTOP = sp;return 4; //@line 224 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJvNS0_17AllowedRawPointerI4LerpEEhhEE8getTypesEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJvNS0_17AllowedRawPointerI4LerpEEhhEEEE3getEv()|0); //@line 228 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 STACKTOP = sp;return ($2|0); //@line 228 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal19getGenericSignatureIJviiiiEEEPKcv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (5900|0); //@line 389 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10emscripten8internal10getContextIM4LerpFvhhEEEPT_RKS5_($0) {
 $0 = $0|0;
 var $$field = 0, $$field2 = 0, $$index1 = 0, $$index5 = 0, $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__Znwj(8)|0); //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $3 = $1; //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $$field = HEAP32[$3>>2]|0; //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $$index1 = ((($3)) + 4|0); //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $$field2 = HEAP32[$$index1>>2]|0; //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 HEAP32[$2>>2] = $$field; //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $$index5 = ((($2)) + 4|0); //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 HEAP32[$$index5>>2] = $$field2; //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 STACKTOP = sp;return ($2|0); //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN4Lerp6stopEmEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 __ZNV4Lerp4stopEv($2); //@line 69 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
 STACKTOP = sp;return; //@line 69 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
}
function __ZN10emscripten8internal13MethodInvokerIM4LerpFvvEvPS2_JEE6invokeERKS4_S5_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$field = 0, $$field2 = 0, $$index1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $3; //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $5 = (__ZN10emscripten8internal11BindingTypeIP4LerpE12fromWireTypeES3_($4)|0); //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $6 = $2; //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $$field = HEAP32[$6>>2]|0; //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $$index1 = ((($6)) + 4|0); //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $$field2 = HEAP32[$$index1>>2]|0; //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $7 = $$field2 >> 1; //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $8 = (($5) + ($7)|0); //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $9 = $$field2 & 1; //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $10 = ($9|0)!=(0); //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 if ($10) {
  $11 = HEAP32[$8>>2]|0; //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $12 = (($11) + ($$field)|0); //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $13 = HEAP32[$12>>2]|0; //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $15 = $13;
  FUNCTION_TABLE_vi[$15 & 127]($8); //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  STACKTOP = sp;return; //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 } else {
  $14 = $$field; //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $15 = $14;
  FUNCTION_TABLE_vi[$15 & 127]($8); //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  STACKTOP = sp;return; //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 }
}
function __ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJvNS0_17AllowedRawPointerI4LerpEEEE8getCountEv($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 STACKTOP = sp;return 2; //@line 224 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJvNS0_17AllowedRawPointerI4LerpEEEE8getTypesEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJvNS0_17AllowedRawPointerI4LerpEEEEEE3getEv()|0); //@line 228 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 STACKTOP = sp;return ($2|0); //@line 228 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal19getGenericSignatureIJviiEEEPKcv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (5883|0); //@line 389 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10emscripten8internal10getContextIM4LerpFvvEEEPT_RKS5_($0) {
 $0 = $0|0;
 var $$field = 0, $$field2 = 0, $$index1 = 0, $$index5 = 0, $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__Znwj(8)|0); //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $3 = $1; //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $$field = HEAP32[$3>>2]|0; //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $$index1 = ((($3)) + 4|0); //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $$field2 = HEAP32[$$index1>>2]|0; //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 HEAP32[$2>>2] = $$field; //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $$index5 = ((($2)) + 4|0); //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 HEAP32[$$index5>>2] = $$field2; //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 STACKTOP = sp;return ($2|0); //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10emscripten8internal11NoBaseClass6verifyI5SynthEEvv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return; //@line 1009 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10emscripten8internal13getActualTypeI5SynthEEPKvPT_($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1; //@line 1029 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $3 = (__ZN10emscripten8internal14getLightTypeIDI5SynthEEPKvRKT_($2)|0); //@line 1029 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 STACKTOP = sp;return ($3|0); //@line 1029 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10emscripten8internal11NoBaseClass11getUpcasterI5SynthEEPFvvEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (0|0); //@line 1017 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10emscripten8internal11NoBaseClass13getDowncasterI5SynthEEPFvvEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (0|0); //@line 1022 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10emscripten8internal14raw_destructorI5SynthEEvPT_($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1; //@line 452 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $3 = ($2|0)==(0|0); //@line 452 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 if (!($3)) {
  __ZdlPv($2); //@line 452 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 }
 STACKTOP = sp;return; //@line 453 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10emscripten8internal6TypeIDI5SynthE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDI5SynthE3getEv()|0); //@line 98 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 return ($0|0); //@line 98 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal6TypeIDINS0_17AllowedRawPointerI5SynthEEE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDIP5SynthE3getEv()|0); //@line 121 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 return ($0|0); //@line 121 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal6TypeIDINS0_17AllowedRawPointerIK5SynthEEE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDIPK5SynthE3getEv()|0); //@line 121 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 return ($0|0); //@line 121 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal12operator_newI5SynthJEEEPT_DpOT0_() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__Znwj(12)|0); //@line 433 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 ;HEAP32[$0>>2]=0|0;HEAP32[$0+4>>2]=0|0;HEAP32[$0+8>>2]=0|0; //@line 433 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 return ($0|0); //@line 433 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10emscripten8internal7InvokerIP5SynthJEE6invokeEPFS3_vE($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1; //@line 330 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $3 = (FUNCTION_TABLE_i[$2 & 127]()|0); //@line 330 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $4 = (__ZN10emscripten8internal11BindingTypeIP5SynthE10toWireTypeES3_($3)|0); //@line 329 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 STACKTOP = sp;return ($4|0); //@line 329 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZNK10emscripten8internal12WithPoliciesIJNS_18allow_raw_pointersEEE11ArgTypeListIJP5SynthEE8getCountEv($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 STACKTOP = sp;return 1; //@line 224 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZNK10emscripten8internal12WithPoliciesIJNS_18allow_raw_pointersEEE11ArgTypeListIJP5SynthEE8getTypesEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJNS0_17AllowedRawPointerI5SynthEEEEEE3getEv()|0); //@line 228 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 STACKTOP = sp;return ($2|0); //@line 228 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal13MethodInvokerIM5SynthFtvEtPS2_JEE6invokeERKS4_S5_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$field = 0, $$field2 = 0, $$index1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $4 = sp + 8|0;
 $2 = $0;
 $3 = $1;
 $5 = $3; //@line 494 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $6 = (__ZN10emscripten8internal11BindingTypeIP5SynthE12fromWireTypeES3_($5)|0); //@line 494 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $7 = $2; //@line 494 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $$field = HEAP32[$7>>2]|0; //@line 494 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $$index1 = ((($7)) + 4|0); //@line 494 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $$field2 = HEAP32[$$index1>>2]|0; //@line 494 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $8 = $$field2 >> 1; //@line 494 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $9 = (($6) + ($8)|0); //@line 494 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $10 = $$field2 & 1; //@line 494 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $11 = ($10|0)!=(0); //@line 494 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 if ($11) {
  $12 = HEAP32[$9>>2]|0; //@line 494 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $13 = (($12) + ($$field)|0); //@line 494 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $14 = HEAP32[$13>>2]|0; //@line 494 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $16 = $14;
 } else {
  $15 = $$field; //@line 494 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $16 = $15;
 }
 $17 = (FUNCTION_TABLE_ii[$16 & 127]($9)|0); //@line 494 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 HEAP16[$4>>1] = $17; //@line 494 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $18 = (__ZN10emscripten8internal11BindingTypeItE10toWireTypeERKt($4)|0); //@line 493 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 STACKTOP = sp;return ($18|0); //@line 493 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJtNS0_17AllowedRawPointerI5SynthEEEE8getCountEv($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 STACKTOP = sp;return 2; //@line 224 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJtNS0_17AllowedRawPointerI5SynthEEEE8getTypesEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJtNS0_17AllowedRawPointerI5SynthEEEEEE3getEv()|0); //@line 228 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 STACKTOP = sp;return ($2|0); //@line 228 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal10getContextIM5SynthFtvEEEPT_RKS5_($0) {
 $0 = $0|0;
 var $$field = 0, $$field2 = 0, $$index1 = 0, $$index5 = 0, $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__Znwj(8)|0); //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $3 = $1; //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $$field = HEAP32[$3>>2]|0; //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $$index1 = ((($3)) + 4|0); //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $$field2 = HEAP32[$$index1>>2]|0; //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 HEAP32[$2>>2] = $$field; //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $$index5 = ((($2)) + 4|0); //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 HEAP32[$$index5>>2] = $$field2; //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 STACKTOP = sp;return ($2|0); //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN5Synth8noteOnEmEhhhh($0,$1,$2,$3,$4) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $5 = $0;
 $6 = $1;
 $7 = $2;
 $8 = $3;
 $9 = $4;
 $10 = $5;
 $11 = $9; //@line 51 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../synth.h"
 __ZN11Instruments13getInstrumentEhR10Instrument($11,$10); //@line 51 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../synth.h"
 $12 = $6; //@line 52 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../synth.h"
 $13 = $7; //@line 52 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../synth.h"
 $14 = $8; //@line 52 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../synth.h"
 __ZN5Synth6noteOnEhhhRK10Instrument($10,$12,$13,$14,$10); //@line 52 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../synth.h"
 STACKTOP = sp;return; //@line 53 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../synth.h"
}
function __ZN10emscripten8internal13MethodInvokerIM5SynthFvhhhhEvPS2_JhhhhEE6invokeERKS4_S5_hhhh($0,$1,$2,$3,$4,$5) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 $5 = $5|0;
 var $$field = 0, $$field2 = 0, $$index1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $6 = $0;
 $7 = $1;
 $8 = $2;
 $9 = $3;
 $10 = $4;
 $11 = $5;
 $12 = $7; //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $13 = (__ZN10emscripten8internal11BindingTypeIP5SynthE12fromWireTypeES3_($12)|0); //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $14 = $6; //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $$field = HEAP32[$14>>2]|0; //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $$index1 = ((($14)) + 4|0); //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $$field2 = HEAP32[$$index1>>2]|0; //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $15 = $$field2 >> 1; //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $16 = (($13) + ($15)|0); //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $17 = $$field2 & 1; //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $18 = ($17|0)!=(0); //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 if ($18) {
  $19 = HEAP32[$16>>2]|0; //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $20 = (($19) + ($$field)|0); //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $21 = HEAP32[$20>>2]|0; //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $31 = $21;
 } else {
  $22 = $$field; //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $31 = $22;
 }
 $23 = $8; //@line 511 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $24 = (__ZN10emscripten8internal11BindingTypeIhE12fromWireTypeEh($23)|0); //@line 511 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $25 = $9; //@line 511 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $26 = (__ZN10emscripten8internal11BindingTypeIhE12fromWireTypeEh($25)|0); //@line 511 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $27 = $10; //@line 511 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $28 = (__ZN10emscripten8internal11BindingTypeIhE12fromWireTypeEh($27)|0); //@line 511 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $29 = $11; //@line 511 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $30 = (__ZN10emscripten8internal11BindingTypeIhE12fromWireTypeEh($29)|0); //@line 511 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 FUNCTION_TABLE_viiiii[$31 & 127]($16,$24,$26,$28,$30); //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 STACKTOP = sp;return; //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJvNS0_17AllowedRawPointerI5SynthEEhhhhEE8getCountEv($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 STACKTOP = sp;return 6; //@line 224 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJvNS0_17AllowedRawPointerI5SynthEEhhhhEE8getTypesEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJvNS0_17AllowedRawPointerI5SynthEEhhhhEEEE3getEv()|0); //@line 228 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 STACKTOP = sp;return ($2|0); //@line 228 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal19getGenericSignatureIJviiiiiiEEEPKcv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (5866|0); //@line 389 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10emscripten8internal10getContextIM5SynthFvhhhhEEEPT_RKS5_($0) {
 $0 = $0|0;
 var $$field = 0, $$field2 = 0, $$index1 = 0, $$index5 = 0, $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__Znwj(8)|0); //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $3 = $1; //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $$field = HEAP32[$3>>2]|0; //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $$index1 = ((($3)) + 4|0); //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $$field2 = HEAP32[$$index1>>2]|0; //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 HEAP32[$2>>2] = $$field; //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $$index5 = ((($2)) + 4|0); //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 HEAP32[$$index5>>2] = $$field2; //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 STACKTOP = sp;return ($2|0); //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10emscripten8internal13MethodInvokerIM5SynthFvhEvPS2_JhEE6invokeERKS4_S5_h($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$field = 0, $$field2 = 0, $$index1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $6 = $4; //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $7 = (__ZN10emscripten8internal11BindingTypeIP5SynthE12fromWireTypeES3_($6)|0); //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $8 = $3; //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $$field = HEAP32[$8>>2]|0; //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $$index1 = ((($8)) + 4|0); //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $$field2 = HEAP32[$$index1>>2]|0; //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $9 = $$field2 >> 1; //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $10 = (($7) + ($9)|0); //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $11 = $$field2 & 1; //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $12 = ($11|0)!=(0); //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 if ($12) {
  $13 = HEAP32[$10>>2]|0; //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $14 = (($13) + ($$field)|0); //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $15 = HEAP32[$14>>2]|0; //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $19 = $15;
 } else {
  $16 = $$field; //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $19 = $16;
 }
 $17 = $5; //@line 511 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $18 = (__ZN10emscripten8internal11BindingTypeIhE12fromWireTypeEh($17)|0); //@line 511 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 FUNCTION_TABLE_vii[$19 & 127]($10,$18); //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 STACKTOP = sp;return; //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJvNS0_17AllowedRawPointerI5SynthEEhEE8getCountEv($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 STACKTOP = sp;return 3; //@line 224 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJvNS0_17AllowedRawPointerI5SynthEEhEE8getTypesEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJvNS0_17AllowedRawPointerI5SynthEEhEEEE3getEv()|0); //@line 228 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 STACKTOP = sp;return ($2|0); //@line 228 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal19getGenericSignatureIJviiiEEEPKcv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (5853|0); //@line 389 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10emscripten8internal10getContextIM5SynthFvhEEEPT_RKS5_($0) {
 $0 = $0|0;
 var $$field = 0, $$field2 = 0, $$index1 = 0, $$index5 = 0, $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__Znwj(8)|0); //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $3 = $1; //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $$field = HEAP32[$3>>2]|0; //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $$index1 = ((($3)) + 4|0); //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $$field2 = HEAP32[$$index1>>2]|0; //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 HEAP32[$2>>2] = $$field; //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $$index5 = ((($2)) + 4|0); //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 HEAP32[$$index5>>2] = $$field2; //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 STACKTOP = sp;return ($2|0); //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10emscripten4baseI5SynthE6verifyI9MidiSynthEEvv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return; //@line 1041 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10emscripten8internal13getActualTypeI9MidiSynthEEPKvPT_($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1; //@line 1029 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $3 = (__ZN10emscripten8internal14getLightTypeIDI9MidiSynthEEPKvRKT_($2)|0); //@line 1029 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 STACKTOP = sp;return ($3|0); //@line 1029 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10emscripten4baseI5SynthE11getUpcasterI9MidiSynthEEPFPS1_PT_Ev() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (114|0); //@line 1055 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10emscripten4baseI5SynthE13getDowncasterI9MidiSynthEEPFPT_PS1_Ev() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (115|0); //@line 1060 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10emscripten8internal14raw_destructorI9MidiSynthEEvPT_($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1; //@line 452 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $3 = ($2|0)==(0|0); //@line 452 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 if (!($3)) {
  __ZdlPv($2); //@line 452 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 }
 STACKTOP = sp;return; //@line 453 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10emscripten8internal6TypeIDI9MidiSynthE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDI9MidiSynthE3getEv()|0); //@line 98 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 return ($0|0); //@line 98 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal6TypeIDINS0_17AllowedRawPointerI9MidiSynthEEE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDIP9MidiSynthE3getEv()|0); //@line 121 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 return ($0|0); //@line 121 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal6TypeIDINS0_17AllowedRawPointerIK9MidiSynthEEE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDIPK9MidiSynthE3getEv()|0); //@line 121 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 return ($0|0); //@line 121 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten4baseI5SynthE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal6TypeIDI5SynthE3getEv()|0); //@line 1044 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 return ($0|0); //@line 1044 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10emscripten8internal12operator_newI9MidiSynthJEEEPT_DpOT0_() {
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = (__Znwj(236)|0); //@line 433 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 __THREW__ = 0;
 invoke_vi(116,($2|0)); //@line 433 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $3 = __THREW__; __THREW__ = 0;
 $4 = $3&1;
 if ($4) {
  $5 = ___cxa_find_matching_catch_2()|0;
  $6 = tempRet0;
  $0 = $5; //@line 434 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $1 = $6; //@line 434 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  __ZdlPv($2); //@line 433 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $7 = $0; //@line 433 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $8 = $1; //@line 433 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  ___resumeException($7|0);
  // unreachable;
 } else {
  STACKTOP = sp;return ($2|0); //@line 433 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 }
 return (0)|0;
}
function __ZN10emscripten8internal7InvokerIP9MidiSynthJEE6invokeEPFS3_vE($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1; //@line 330 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $3 = (FUNCTION_TABLE_i[$2 & 127]()|0); //@line 330 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $4 = (__ZN10emscripten8internal11BindingTypeIP9MidiSynthE10toWireTypeES3_($3)|0); //@line 329 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 STACKTOP = sp;return ($4|0); //@line 329 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZNK10emscripten8internal12WithPoliciesIJNS_18allow_raw_pointersEEE11ArgTypeListIJP9MidiSynthEE8getCountEv($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 STACKTOP = sp;return 1; //@line 224 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZNK10emscripten8internal12WithPoliciesIJNS_18allow_raw_pointersEEE11ArgTypeListIJP9MidiSynthEE8getTypesEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJNS0_17AllowedRawPointerI9MidiSynthEEEEEE3getEv()|0); //@line 228 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 STACKTOP = sp;return ($2|0); //@line 228 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN9MidiSynth10midiNoteOnEhhh($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $$ = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0;
 var $48 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $4 = $0;
 $5 = $1;
 $6 = $2;
 $7 = $3;
 $11 = $4;
 $12 = $5; //@line 29 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
 $13 = $12&255; //@line 29 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
 $14 = ($13|0)==(9); //@line 29 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
 if ($14) {
  $15 = $6; //@line 30 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
  $16 = $15&255; //@line 30 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
  $17 = (($16) - 35)|0; //@line 30 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
  $18 = $17&255; //@line 30 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
  $8 = $18; //@line 30 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
  $19 = $8; //@line 31 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
  $20 = $19&255; //@line 31 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
  $21 = ($20|0)>=(46); //@line 31 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
  $$ = $21 ? 45 : $18; //@line 31 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
  $8 = $$;
  $22 = $8; //@line 33 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
  $23 = (__ZN11Instruments17getPercussionNoteEh($22)|0); //@line 33 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
  $6 = $23; //@line 33 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
  $24 = $8; //@line 35 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
  $25 = $24&255; //@line 35 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
  $26 = (128 + ($25))|0; //@line 35 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
  $27 = $26&255; //@line 35 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
  $28 = ((($11)) + 44|0); //@line 35 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
  $29 = ((($28)) + 108|0); //@line 35 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
  __ZN11Instruments13getInstrumentEhR10Instrument($27,$29); //@line 35 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
 }
 $30 = (__ZN5Synth12getNextVoiceEv($11)|0); //@line 38 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
 $9 = $30; //@line 38 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
 $31 = ((($11)) + 44|0); //@line 39 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
 $32 = $5; //@line 39 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
 $33 = $32&255; //@line 39 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
 $34 = (($31) + (($33*12)|0)|0); //@line 39 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
 $10 = $34; //@line 39 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
 $35 = $9; //@line 41 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
 $36 = $6; //@line 41 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
 $37 = $7; //@line 41 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
 $38 = $10; //@line 41 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
 __ZN5Synth6noteOnEhhhRK10Instrument($11,$35,$36,$37,$38); //@line 41 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
 $39 = $6; //@line 43 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
 $40 = ((($11)) + 12|0); //@line 43 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
 $41 = $9; //@line 43 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
 $42 = $41&255; //@line 43 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
 $43 = (($40) + ($42)|0); //@line 43 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
 HEAP8[$43>>0] = $39; //@line 43 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
 $44 = $5; //@line 44 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
 $45 = ((($11)) + 28|0); //@line 44 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
 $46 = $9; //@line 44 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
 $47 = $46&255; //@line 44 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
 $48 = (($45) + ($47)|0); //@line 44 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
 HEAP8[$48>>0] = $44; //@line 44 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
 STACKTOP = sp;return; //@line 45 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
}
function __ZN10emscripten8internal13MethodInvokerIM9MidiSynthFvhhhEvPS2_JhhhEE6invokeERKS4_S5_hhh($0,$1,$2,$3,$4) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 var $$field = 0, $$field2 = 0, $$index1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $5 = $0;
 $6 = $1;
 $7 = $2;
 $8 = $3;
 $9 = $4;
 $10 = $6; //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $11 = (__ZN10emscripten8internal11BindingTypeIP9MidiSynthE12fromWireTypeES3_($10)|0); //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $12 = $5; //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $$field = HEAP32[$12>>2]|0; //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $$index1 = ((($12)) + 4|0); //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $$field2 = HEAP32[$$index1>>2]|0; //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $13 = $$field2 >> 1; //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $14 = (($11) + ($13)|0); //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $15 = $$field2 & 1; //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $16 = ($15|0)!=(0); //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 if ($16) {
  $17 = HEAP32[$14>>2]|0; //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $18 = (($17) + ($$field)|0); //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $19 = HEAP32[$18>>2]|0; //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $27 = $19;
 } else {
  $20 = $$field; //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $27 = $20;
 }
 $21 = $7; //@line 511 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $22 = (__ZN10emscripten8internal11BindingTypeIhE12fromWireTypeEh($21)|0); //@line 511 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $23 = $8; //@line 511 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $24 = (__ZN10emscripten8internal11BindingTypeIhE12fromWireTypeEh($23)|0); //@line 511 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $25 = $9; //@line 511 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $26 = (__ZN10emscripten8internal11BindingTypeIhE12fromWireTypeEh($25)|0); //@line 511 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 FUNCTION_TABLE_viiii[$27 & 127]($14,$22,$24,$26); //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 STACKTOP = sp;return; //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJvNS0_17AllowedRawPointerI9MidiSynthEEhhhEE8getCountEv($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 STACKTOP = sp;return 5; //@line 224 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJvNS0_17AllowedRawPointerI9MidiSynthEEhhhEE8getTypesEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJvNS0_17AllowedRawPointerI9MidiSynthEEhhhEEEE3getEv()|0); //@line 228 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 STACKTOP = sp;return ($2|0); //@line 228 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal19getGenericSignatureIJviiiiiEEEPKcv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (5833|0); //@line 389 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10emscripten8internal10getContextIM9MidiSynthFvhhhEEEPT_RKS5_($0) {
 $0 = $0|0;
 var $$field = 0, $$field2 = 0, $$index1 = 0, $$index5 = 0, $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__Znwj(8)|0); //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $3 = $1; //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $$field = HEAP32[$3>>2]|0; //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $$index1 = ((($3)) + 4|0); //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $$field2 = HEAP32[$$index1>>2]|0; //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 HEAP32[$2>>2] = $$field; //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $$index5 = ((($2)) + 4|0); //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 HEAP32[$$index5>>2] = $$field2; //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 STACKTOP = sp;return ($2|0); //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN9MidiSynth11midiNoteOffEhh($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $7 = $3;
 $6 = 15; //@line 48 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
 while(1) {
  $8 = $6; //@line 48 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
  $9 = $8 << 24 >> 24; //@line 48 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
  $10 = ($9|0)>=(0); //@line 48 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
  if (!($10)) {
   break;
  }
  $11 = ((($7)) + 12|0); //@line 49 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
  $12 = $6; //@line 49 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
  $13 = $12 << 24 >> 24; //@line 49 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
  $14 = (($11) + ($13)|0); //@line 49 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
  $15 = HEAP8[$14>>0]|0; //@line 49 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
  $16 = $15&255; //@line 49 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
  $17 = $5; //@line 49 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
  $18 = $17&255; //@line 49 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
  $19 = ($16|0)==($18|0); //@line 49 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
  if ($19) {
   $20 = ((($7)) + 28|0); //@line 49 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
   $21 = $6; //@line 49 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
   $22 = $21 << 24 >> 24; //@line 49 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
   $23 = (($20) + ($22)|0); //@line 49 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
   $24 = HEAP8[$23>>0]|0; //@line 49 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
   $25 = $24&255; //@line 49 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
   $26 = $4; //@line 49 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
   $27 = $26&255; //@line 49 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
   $28 = ($25|0)==($27|0); //@line 49 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
   if ($28) {
    $29 = $6; //@line 50 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
    __ZN5Synth7noteOffEh($7,$29); //@line 50 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
    $30 = ((($7)) + 28|0); //@line 51 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
    $31 = $6; //@line 51 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
    $32 = $31 << 24 >> 24; //@line 51 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
    $33 = (($30) + ($32)|0); //@line 51 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
    HEAP8[$33>>0] = -1; //@line 51 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
    $34 = ((($7)) + 12|0); //@line 52 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
    $35 = $6; //@line 52 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
    $36 = $35 << 24 >> 24; //@line 52 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
    $37 = (($34) + ($36)|0); //@line 52 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
    HEAP8[$37>>0] = -1; //@line 52 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
   }
  }
  $38 = $6; //@line 48 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
  $39 = (($38) + -1)<<24>>24; //@line 48 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
  $6 = $39; //@line 48 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
 }
 STACKTOP = sp;return; //@line 55 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
}
function __ZN10emscripten8internal13MethodInvokerIM9MidiSynthFvhhEvPS2_JhhEE6invokeERKS4_S5_hh($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $$field = 0, $$field2 = 0, $$index1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $4 = 0, $5 = 0, $6 = 0;
 var $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $4 = $0;
 $5 = $1;
 $6 = $2;
 $7 = $3;
 $8 = $5; //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $9 = (__ZN10emscripten8internal11BindingTypeIP9MidiSynthE12fromWireTypeES3_($8)|0); //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $10 = $4; //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $$field = HEAP32[$10>>2]|0; //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $$index1 = ((($10)) + 4|0); //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $$field2 = HEAP32[$$index1>>2]|0; //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $11 = $$field2 >> 1; //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $12 = (($9) + ($11)|0); //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $13 = $$field2 & 1; //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $14 = ($13|0)!=(0); //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 if ($14) {
  $15 = HEAP32[$12>>2]|0; //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $16 = (($15) + ($$field)|0); //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $17 = HEAP32[$16>>2]|0; //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $23 = $17;
 } else {
  $18 = $$field; //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $23 = $18;
 }
 $19 = $6; //@line 511 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $20 = (__ZN10emscripten8internal11BindingTypeIhE12fromWireTypeEh($19)|0); //@line 511 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $21 = $7; //@line 511 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $22 = (__ZN10emscripten8internal11BindingTypeIhE12fromWireTypeEh($21)|0); //@line 511 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 FUNCTION_TABLE_viii[$23 & 127]($12,$20,$22); //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 STACKTOP = sp;return; //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJvNS0_17AllowedRawPointerI9MidiSynthEEhhEE8getCountEv($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 STACKTOP = sp;return 4; //@line 224 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJvNS0_17AllowedRawPointerI9MidiSynthEEhhEE8getTypesEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJvNS0_17AllowedRawPointerI9MidiSynthEEhhEEEE3getEv()|0); //@line 228 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 STACKTOP = sp;return ($2|0); //@line 228 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal10getContextIM9MidiSynthFvhhEEEPT_RKS5_($0) {
 $0 = $0|0;
 var $$field = 0, $$field2 = 0, $$index1 = 0, $$index5 = 0, $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__Znwj(8)|0); //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $3 = $1; //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $$field = HEAP32[$3>>2]|0; //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $$index1 = ((($3)) + 4|0); //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $$field2 = HEAP32[$$index1>>2]|0; //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 HEAP32[$2>>2] = $$field; //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $$index5 = ((($2)) + 4|0); //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 HEAP32[$$index5>>2] = $$field2; //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 STACKTOP = sp;return ($2|0); //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN9MidiSynth17midiProgramChangeEhh($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $6 = $3;
 $7 = $5; //@line 58 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
 $8 = ((($6)) + 44|0); //@line 58 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
 $9 = $4; //@line 58 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
 $10 = $9&255; //@line 58 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
 $11 = (($8) + (($10*12)|0)|0); //@line 58 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
 __ZN11Instruments13getInstrumentEhR10Instrument($7,$11); //@line 58 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
 STACKTOP = sp;return; //@line 59 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
}
function __ZN9MidiSynth13midiPitchBendEhs($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0;
 var $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $7 = $3;
 $6 = 15; //@line 62 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
 while(1) {
  $8 = $6; //@line 62 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
  $9 = $8 << 24 >> 24; //@line 62 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
  $10 = ($9|0)>=(0); //@line 62 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
  if (!($10)) {
   break;
  }
  $11 = ((($7)) + 28|0); //@line 63 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
  $12 = $6; //@line 63 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
  $13 = $12 << 24 >> 24; //@line 63 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
  $14 = (($11) + ($13)|0); //@line 63 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
  $15 = HEAP8[$14>>0]|0; //@line 63 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
  $16 = $15&255; //@line 63 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
  $17 = $4; //@line 63 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
  $18 = $17&255; //@line 63 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
  $19 = ($16|0)==($18|0); //@line 63 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
  if ($19) {
   $20 = $6; //@line 64 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
   $21 = $5; //@line 64 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
   __ZN5Synth9pitchBendEhs($7,$20,$21); //@line 64 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
  }
  $22 = $6; //@line 62 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
  $23 = (($22) + -1)<<24>>24; //@line 62 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
  $6 = $23; //@line 62 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
 }
 STACKTOP = sp;return; //@line 67 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
}
function __ZN10emscripten8internal13MethodInvokerIM9MidiSynthFvhsEvPS2_JhsEE6invokeERKS4_S5_hs($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $$field = 0, $$field2 = 0, $$index1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $4 = 0, $5 = 0, $6 = 0;
 var $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $4 = $0;
 $5 = $1;
 $6 = $2;
 $7 = $3;
 $8 = $5; //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $9 = (__ZN10emscripten8internal11BindingTypeIP9MidiSynthE12fromWireTypeES3_($8)|0); //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $10 = $4; //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $$field = HEAP32[$10>>2]|0; //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $$index1 = ((($10)) + 4|0); //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $$field2 = HEAP32[$$index1>>2]|0; //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $11 = $$field2 >> 1; //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $12 = (($9) + ($11)|0); //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $13 = $$field2 & 1; //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $14 = ($13|0)!=(0); //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 if ($14) {
  $15 = HEAP32[$12>>2]|0; //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $16 = (($15) + ($$field)|0); //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $17 = HEAP32[$16>>2]|0; //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $23 = $17;
 } else {
  $18 = $$field; //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $23 = $18;
 }
 $19 = $6; //@line 511 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $20 = (__ZN10emscripten8internal11BindingTypeIhE12fromWireTypeEh($19)|0); //@line 511 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $21 = $7; //@line 511 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $22 = (__ZN10emscripten8internal11BindingTypeIsE12fromWireTypeEs($21)|0); //@line 511 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 FUNCTION_TABLE_viii[$23 & 127]($12,$20,$22); //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 STACKTOP = sp;return; //@line 510 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJvNS0_17AllowedRawPointerI9MidiSynthEEhsEE8getCountEv($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 STACKTOP = sp;return 4; //@line 224 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJvNS0_17AllowedRawPointerI9MidiSynthEEhsEE8getTypesEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJvNS0_17AllowedRawPointerI9MidiSynthEEhsEEEE3getEv()|0); //@line 228 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 STACKTOP = sp;return ($2|0); //@line 228 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal10getContextIM9MidiSynthFvhsEEEPT_RKS5_($0) {
 $0 = $0|0;
 var $$field = 0, $$field2 = 0, $$index1 = 0, $$index5 = 0, $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__Znwj(8)|0); //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $3 = $1; //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $$field = HEAP32[$3>>2]|0; //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $$index1 = ((($3)) + 4|0); //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $$field2 = HEAP32[$$index1>>2]|0; //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 HEAP32[$2>>2] = $$field; //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $$index5 = ((($2)) + 4|0); //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 HEAP32[$$index5>>2] = $$field2; //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 STACKTOP = sp;return ($2|0); //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJvNS0_17AllowedRawPointerI9MidiSynthEEhsEEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (736|0); //@line 208 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal11BindingTypeIP9MidiSynthE12fromWireTypeES3_($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1; //@line 344 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 STACKTOP = sp;return ($2|0); //@line 344 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal11BindingTypeIhE12fromWireTypeEh($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1; //@line 254 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 STACKTOP = sp;return ($2|0); //@line 254 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal11BindingTypeIsE12fromWireTypeEs($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1; //@line 255 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 STACKTOP = sp;return ($2|0); //@line 255 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJvNS0_17AllowedRawPointerI9MidiSynthEEhhEEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (752|0); //@line 208 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJvNS0_17AllowedRawPointerI9MidiSynthEEhhhEEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (768|0); //@line 208 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJNS0_17AllowedRawPointerI9MidiSynthEEEEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (788|0); //@line 208 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal11BindingTypeIP9MidiSynthE10toWireTypeES3_($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1; //@line 341 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 STACKTOP = sp;return ($2|0); //@line 341 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN9MidiSynthC2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $3 = 0;
 var $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $4 = $1;
 ;HEAP32[$4>>2]=0|0;HEAP32[$4+4>>2]=0|0;HEAP32[$4+8>>2]=0|0; //@line 17 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
 $2 = 16; //@line 18 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
 while(1) {
  $5 = $2; //@line 18 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
  $6 = $5 << 24 >> 24; //@line 18 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
  $7 = ($6|0)>=(0); //@line 18 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
  if (!($7)) {
   break;
  }
  $8 = ((($4)) + 44|0); //@line 19 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
  $9 = $2; //@line 19 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
  $10 = $9 << 24 >> 24; //@line 19 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
  $11 = (($8) + (($10*12)|0)|0); //@line 19 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
  __ZN11Instruments13getInstrumentEhR10Instrument(0,$11); //@line 19 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
  $12 = $2; //@line 18 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
  $13 = (($12) + -1)<<24>>24; //@line 18 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
  $2 = $13; //@line 18 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
 }
 $3 = 15; //@line 22 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
 while(1) {
  $14 = $3; //@line 22 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
  $15 = $14 << 24 >> 24; //@line 22 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
  $16 = ($15|0)>=(0); //@line 22 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
  if (!($16)) {
   break;
  }
  $17 = ((($4)) + 12|0); //@line 23 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
  $18 = $3; //@line 23 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
  $19 = $18 << 24 >> 24; //@line 23 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
  $20 = (($17) + ($19)|0); //@line 23 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
  HEAP8[$20>>0] = -1; //@line 23 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
  $21 = ((($4)) + 28|0); //@line 24 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
  $22 = $3; //@line 24 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
  $23 = $22 << 24 >> 24; //@line 24 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
  $24 = (($21) + ($23)|0); //@line 24 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
  HEAP8[$24>>0] = -1; //@line 24 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
  $25 = $3; //@line 22 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
  $26 = (($25) + -1)<<24>>24; //@line 22 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
  $3 = $26; //@line 22 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
 }
 STACKTOP = sp;return; //@line 26 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../midisynth.h"
}
function __ZN10emscripten8internal11LightTypeIDIPK9MidiSynthE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (48|0); //@line 62 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal11LightTypeIDIP9MidiSynthE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (8|0); //@line 62 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal11LightTypeIDI9MidiSynthE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (24|0); //@line 62 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten4baseI5SynthE14convertPointerIS1_9MidiSynthEEPT0_PT_($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1; //@line 1065 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 STACKTOP = sp;return ($2|0); //@line 1065 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10emscripten4baseI5SynthE14convertPointerI9MidiSynthS1_EEPT0_PT_($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1; //@line 1065 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 STACKTOP = sp;return ($2|0); //@line 1065 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10emscripten8internal14getLightTypeIDI9MidiSynthEEPKvRKT_($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 STACKTOP = sp;return (24|0); //@line 82 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJvNS0_17AllowedRawPointerI5SynthEEhEEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (792|0); //@line 208 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal11BindingTypeIP5SynthE12fromWireTypeES3_($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1; //@line 344 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 STACKTOP = sp;return ($2|0); //@line 344 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJvNS0_17AllowedRawPointerI5SynthEEhhhhEEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (804|0); //@line 208 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJtNS0_17AllowedRawPointerI5SynthEEEEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (828|0); //@line 208 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal11BindingTypeItE10toWireTypeERKt($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1; //@line 256 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 $3 = HEAP16[$2>>1]|0; //@line 256 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 STACKTOP = sp;return ($3|0); //@line 256 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJNS0_17AllowedRawPointerI5SynthEEEEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (836|0); //@line 208 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal11BindingTypeIP5SynthE10toWireTypeES3_($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1; //@line 341 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 STACKTOP = sp;return ($2|0); //@line 341 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal11LightTypeIDIPK5SynthE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (80|0); //@line 62 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal11LightTypeIDIP5SynthE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (64|0); //@line 62 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal11LightTypeIDI5SynthE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (40|0); //@line 62 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal14getLightTypeIDI5SynthEEPKvRKT_($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 STACKTOP = sp;return (40|0); //@line 82 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJvNS0_17AllowedRawPointerI4LerpEEEEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (840|0); //@line 208 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal11BindingTypeIP4LerpE12fromWireTypeES3_($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1; //@line 344 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 STACKTOP = sp;return ($2|0); //@line 344 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZNV4Lerp4stopEv($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 $3 = ((($2)) + 3|0); //@line 57 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
 $4 = HEAP8[$3>>0]|0; //@line 57 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
 $5 = $4&255; //@line 57 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
 $6 = ((($2)) + 2|0); //@line 57 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
 $7 = HEAP8[$6>>0]|0; //@line 57 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
 $8 = $7&255; //@line 57 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
 $9 = ($5|0)<($8|0); //@line 57 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
 if (!($9)) {
  STACKTOP = sp;return; //@line 61 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
 }
 $10 = ((($2)) + 2|0); //@line 58 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
 $11 = HEAP8[$10>>0]|0; //@line 58 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
 $12 = ((($2)) + 3|0); //@line 58 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
 HEAP8[$12>>0] = $11; //@line 58 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
 __ZNV4Lerp9loadStageEv($2); //@line 59 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
 STACKTOP = sp;return; //@line 61 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
}
function __ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJvNS0_17AllowedRawPointerI4LerpEEhhEEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (848|0); //@line 208 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJhNS0_17AllowedRawPointerI4LerpEEEEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (864|0); //@line 208 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal11BindingTypeIhE10toWireTypeERKh($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1; //@line 254 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 $3 = HEAP8[$2>>0]|0; //@line 254 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 STACKTOP = sp;return ($3|0); //@line 254 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZNV4Lerp6sampleEv($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0;
 var $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $7 = 0;
 var $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $4 = $1;
 $5 = ((($4)) + 6|0); //@line 33 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
 $6 = HEAP16[$5>>1]|0; //@line 33 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
 $7 = $6 << 16 >> 16; //@line 33 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
 $8 = ((($4)) + 4|0); //@line 33 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
 $9 = HEAP16[$8>>1]|0; //@line 33 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
 $10 = $9 << 16 >> 16; //@line 33 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
 $11 = (($10) + ($7))|0; //@line 33 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
 $12 = $11&65535; //@line 33 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
 HEAP16[$8>>1] = $12; //@line 33 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
 $13 = ((($4)) + 4|0); //@line 34 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
 $14 = HEAP16[$13>>1]|0; //@line 34 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
 $15 = $14 << 16 >> 16; //@line 34 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
 $16 = $15 >> 8; //@line 34 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
 $17 = $16&255; //@line 34 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
 $2 = $17; //@line 34 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
 $18 = $2; //@line 36 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
 $19 = $18 << 24 >> 24; //@line 36 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
 $20 = ($19|0)<(0); //@line 36 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
 if ($20) {
  label = 3;
 } else {
  $21 = ((($4)) + 6|0); //@line 37 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
  $22 = HEAP16[$21>>1]|0; //@line 37 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
  $23 = $22 << 16 >> 16; //@line 37 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
  $24 = ($23|0)<=(0); //@line 37 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
  if ($24) {
   label = 3;
  } else {
   $31 = $2; //@line 39 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
   $32 = $31 << 24 >> 24; //@line 39 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
   $33 = ((($4)) + 8|0); //@line 39 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
   $34 = HEAP8[$33>>0]|0; //@line 39 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
   $35 = $34 << 24 >> 24; //@line 39 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
   $36 = ($32|0)>($35|0); //@line 39 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
   $38 = $36;
  }
 }
 if ((label|0) == 3) {
  $25 = $2; //@line 38 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
  $26 = $25 << 24 >> 24; //@line 38 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
  $27 = ((($4)) + 8|0); //@line 38 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
  $28 = HEAP8[$27>>0]|0; //@line 38 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
  $29 = $28 << 24 >> 24; //@line 38 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
  $30 = ($26|0)<($29|0); //@line 38 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
  $38 = $30;
 }
 $37 = $38&1; //@line 36 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
 $3 = $37; //@line 36 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
 $39 = $3; //@line 41 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
 $40 = $39&1; //@line 41 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
 if (!($40)) {
  $62 = $2; //@line 51 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
  STACKTOP = sp;return ($62|0); //@line 51 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
 }
 $41 = ((($4)) + 8|0); //@line 42 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
 $42 = HEAP8[$41>>0]|0; //@line 42 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
 $2 = $42; //@line 42 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
 $43 = ((($4)) + 8|0); //@line 43 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
 $44 = HEAP8[$43>>0]|0; //@line 43 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
 $45 = $44 << 24 >> 24; //@line 43 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
 $46 = $45 << 8; //@line 43 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
 $47 = $46&65535; //@line 43 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
 $48 = ((($4)) + 4|0); //@line 43 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
 HEAP16[$48>>1] = $47; //@line 43 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
 $49 = ((($4)) + 3|0); //@line 44 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
 $50 = HEAP8[$49>>0]|0; //@line 44 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
 $51 = (($50) + 1)<<24>>24; //@line 44 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
 HEAP8[$49>>0] = $51; //@line 44 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
 $52 = ((($4)) + 3|0); //@line 45 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
 $53 = HEAP8[$52>>0]|0; //@line 45 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
 $54 = $53&255; //@line 45 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
 $55 = ((($4)) + 2|0); //@line 45 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
 $56 = HEAP8[$55>>0]|0; //@line 45 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
 $57 = $56&255; //@line 45 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
 $58 = ($54|0)==($57|0); //@line 45 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
 if ($58) {
  $59 = ((($4)) + 1|0); //@line 46 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
  $60 = HEAP8[$59>>0]|0; //@line 46 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
  $61 = ((($4)) + 3|0); //@line 46 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
  HEAP8[$61>>0] = $60; //@line 46 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
 }
 __ZNV4Lerp9loadStageEv($4); //@line 48 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
 $62 = $2; //@line 51 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
 STACKTOP = sp;return ($62|0); //@line 51 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
}
function __ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJNS0_17AllowedRawPointerI4LerpEEEEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (872|0); //@line 208 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal11BindingTypeIP4LerpE10toWireTypeES3_($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1; //@line 341 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 STACKTOP = sp;return ($2|0); //@line 341 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN4LerpC2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1;
 HEAP8[$2>>0] = 0; //@line 21 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
 $3 = ((($2)) + 1|0); //@line 22 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
 HEAP8[$3>>0] = -1; //@line 22 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
 $4 = ((($2)) + 2|0); //@line 23 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
 HEAP8[$4>>0] = -1; //@line 23 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
 $5 = ((($2)) + 3|0); //@line 24 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
 HEAP8[$5>>0] = -1; //@line 24 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
 $6 = ((($2)) + 4|0); //@line 25 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
 HEAP16[$6>>1] = 0; //@line 25 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
 $7 = ((($2)) + 6|0); //@line 26 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
 HEAP16[$7>>1] = 0; //@line 26 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
 $8 = ((($2)) + 8|0); //@line 27 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
 HEAP8[$8>>0] = -128; //@line 27 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
 STACKTOP = sp;return; //@line 19 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../lerp.h"
}
function __ZN10emscripten8internal11LightTypeIDIPK4LerpE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (120|0); //@line 62 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal11LightTypeIDIP4LerpE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (96|0); //@line 62 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal11LightTypeIDI4LerpE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (112|0); //@line 62 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal14getLightTypeIDI4LerpEEPKvRKT_($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 STACKTOP = sp;return (112|0); //@line 82 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal11LightTypeIDIPK10InstrumentE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (136|0); //@line 62 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal11LightTypeIDIP10InstrumentE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (160|0); //@line 62 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal11LightTypeIDI10InstrumentE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (152|0); //@line 62 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal14getLightTypeIDI10InstrumentEEPKvRKT_($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 STACKTOP = sp;return (152|0); //@line 82 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal11LightTypeIDIPK11LerpProgramE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (176|0); //@line 62 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal11LightTypeIDIP11LerpProgramE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (200|0); //@line 62 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal11LightTypeIDI11LerpProgramE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (192|0); //@line 62 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal14getLightTypeIDI11LerpProgramEEPKvRKT_($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 STACKTOP = sp;return (192|0); //@line 82 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal11LightTypeIDIPK9LerpStageE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (216|0); //@line 62 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal11LightTypeIDIP9LerpStageE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (240|0); //@line 62 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal11LightTypeIDI9LerpStageE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (232|0); //@line 62 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal14getLightTypeIDI9LerpStageEEPKvRKT_($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 STACKTOP = sp;return (232|0); //@line 82 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZNK10emscripten8internal12WithPoliciesIJNS_17allow_raw_pointerINS_7ret_valEEEEE11ArgTypeListIJP9MidiSynthEE8getCountEv($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 STACKTOP = sp;return 1; //@line 224 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZNK10emscripten8internal12WithPoliciesIJNS_17allow_raw_pointerINS_7ret_valEEEEE11ArgTypeListIJP9MidiSynthEE8getTypesEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJNS0_17AllowedRawPointerI9MidiSynthEEEEEE3getEv()|0); //@line 228 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 STACKTOP = sp;return ($2|0); //@line 228 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal7InvokerIdJEE6invokeEPFdvE($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0.0, $5 = 0.0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = sp;
 $1 = $0;
 $3 = $1; //@line 330 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $4 = (+FUNCTION_TABLE_d[$3 & 63]()); //@line 330 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 HEAPF64[$2>>3] = $4; //@line 330 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $5 = (+__ZN10emscripten8internal11BindingTypeIdE10toWireTypeERKd($2)); //@line 329 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 STACKTOP = sp;return (+$5); //@line 329 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJdEE8getCountEv($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 STACKTOP = sp;return 1; //@line 224 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJdEE8getTypesEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJdEEEE3getEv()|0); //@line 228 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 STACKTOP = sp;return ($2|0); //@line 228 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal19getGenericSignatureIJdiEEEPKcv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (6049|0); //@line 389 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJdEEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (876|0); //@line 208 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal11BindingTypeIdE10toWireTypeERKd($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0.0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1; //@line 262 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 $3 = +HEAPF64[$2>>3]; //@line 262 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 STACKTOP = sp;return (+$3); //@line 262 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal6TypeIDI10HeapRegionI10InstrumentEE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDI10HeapRegionI10InstrumentEE3getEv()|0); //@line 98 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 return ($0|0); //@line 98 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal11noncopyableD2Ev($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 STACKTOP = sp;return; //@line 642 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function ___clang_call_terminate($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 (___cxa_begin_catch(($0|0))|0);
 __ZSt9terminatev();
 // unreachable;
}
function __ZN10emscripten8internal11LightTypeIDI10HeapRegionI10InstrumentEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (256|0); //@line 62 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal12MemberAccessI10HeapRegionI10InstrumentEjE7getWireIS4_EEjRKMS4_jRKT_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $3; //@line 527 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $5 = $2; //@line 527 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $6 = HEAP32[$5>>2]|0; //@line 527 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $7 = (($4) + ($6)|0); //@line 527 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $8 = (__ZN10emscripten8internal11BindingTypeIjE10toWireTypeERKj($7)|0); //@line 527 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 STACKTOP = sp;return ($8|0); //@line 527 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10emscripten8internal12MemberAccessI10HeapRegionI10InstrumentEjE7setWireIS4_EEvRKMS4_jRT_j($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $6 = $5; //@line 536 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $7 = (__ZN10emscripten8internal11BindingTypeIjE12fromWireTypeEj($6)|0); //@line 536 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $8 = $4; //@line 536 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $9 = $3; //@line 536 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $10 = HEAP32[$9>>2]|0; //@line 536 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $11 = (($8) + ($10)|0); //@line 536 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 HEAP32[$11>>2] = $7; //@line 536 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 STACKTOP = sp;return; //@line 537 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10emscripten8internal6TypeIDIjE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDIjE3getEv()|0); //@line 98 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 return ($0|0); //@line 98 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal10getContextIM10HeapRegionI10InstrumentEjEEPT_RKS6_($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__Znwj(4)|0); //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $3 = $1; //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $4 = HEAP32[$3>>2]|0; //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 HEAP32[$2>>2] = $4; //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 STACKTOP = sp;return ($2|0); //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10emscripten8internal11LightTypeIDIjE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (680|0); //@line 62 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal11BindingTypeIjE12fromWireTypeEj($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1; //@line 258 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 STACKTOP = sp;return ($2|0); //@line 258 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal11BindingTypeIjE10toWireTypeERKj($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1; //@line 258 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 $3 = HEAP32[$2>>2]|0; //@line 258 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 STACKTOP = sp;return ($3|0); //@line 258 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal11noncopyableC2Ev($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 STACKTOP = sp;return; //@line 641 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10emscripten8internal15raw_constructorI10HeapRegionI10InstrumentEJEEEPT_DpNS0_11BindingTypeIT0_E8WireTypeE() {
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = (__Znwj(8)|0); //@line 445 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 __THREW__ = 0;
 invoke_vi(117,($2|0)); //@line 445 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $3 = __THREW__; __THREW__ = 0;
 $4 = $3&1;
 if ($4) {
  $5 = ___cxa_find_matching_catch_2()|0;
  $6 = tempRet0;
  $0 = $5; //@line 448 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $1 = $6; //@line 448 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  __ZdlPv($2); //@line 445 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $7 = $0; //@line 445 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $8 = $1; //@line 445 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  ___resumeException($7|0);
  // unreachable;
 } else {
  STACKTOP = sp;return ($2|0); //@line 445 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 }
 return (0)|0;
}
function __ZN10emscripten8internal14raw_destructorI10HeapRegionI10InstrumentEEEvPT_($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1; //@line 452 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $3 = ($2|0)==(0|0); //@line 452 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 if (!($3)) {
  __ZdlPv($2); //@line 452 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 }
 STACKTOP = sp;return; //@line 453 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10emscripten8internal19getGenericSignatureIJiEEEPKcv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (6079|0); //@line 389 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10HeapRegionI10InstrumentEC2Ev($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 STACKTOP = sp;return; //@line 15 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../instruments.h"
}
function __ZN10emscripten8internal6TypeIDI10HeapRegionI11LerpProgramEE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDI10HeapRegionI11LerpProgramEE3getEv()|0); //@line 98 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 return ($0|0); //@line 98 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal11LightTypeIDI10HeapRegionI11LerpProgramEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (264|0); //@line 62 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal12MemberAccessI10HeapRegionI11LerpProgramEjE7getWireIS4_EEjRKMS4_jRKT_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $3; //@line 527 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $5 = $2; //@line 527 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $6 = HEAP32[$5>>2]|0; //@line 527 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $7 = (($4) + ($6)|0); //@line 527 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $8 = (__ZN10emscripten8internal11BindingTypeIjE10toWireTypeERKj($7)|0); //@line 527 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 STACKTOP = sp;return ($8|0); //@line 527 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10emscripten8internal12MemberAccessI10HeapRegionI11LerpProgramEjE7setWireIS4_EEvRKMS4_jRT_j($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $6 = $5; //@line 536 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $7 = (__ZN10emscripten8internal11BindingTypeIjE12fromWireTypeEj($6)|0); //@line 536 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $8 = $4; //@line 536 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $9 = $3; //@line 536 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $10 = HEAP32[$9>>2]|0; //@line 536 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $11 = (($8) + ($10)|0); //@line 536 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 HEAP32[$11>>2] = $7; //@line 536 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 STACKTOP = sp;return; //@line 537 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10emscripten8internal10getContextIM10HeapRegionI11LerpProgramEjEEPT_RKS6_($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__Znwj(4)|0); //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $3 = $1; //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $4 = HEAP32[$3>>2]|0; //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 HEAP32[$2>>2] = $4; //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 STACKTOP = sp;return ($2|0); //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10emscripten8internal15raw_constructorI10HeapRegionI11LerpProgramEJEEEPT_DpNS0_11BindingTypeIT0_E8WireTypeE() {
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = (__Znwj(8)|0); //@line 445 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 __THREW__ = 0;
 invoke_vi(118,($2|0)); //@line 445 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $3 = __THREW__; __THREW__ = 0;
 $4 = $3&1;
 if ($4) {
  $5 = ___cxa_find_matching_catch_2()|0;
  $6 = tempRet0;
  $0 = $5; //@line 448 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $1 = $6; //@line 448 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  __ZdlPv($2); //@line 445 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $7 = $0; //@line 445 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $8 = $1; //@line 445 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  ___resumeException($7|0);
  // unreachable;
 } else {
  STACKTOP = sp;return ($2|0); //@line 445 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 }
 return (0)|0;
}
function __ZN10emscripten8internal14raw_destructorI10HeapRegionI11LerpProgramEEEvPT_($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1; //@line 452 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $3 = ($2|0)==(0|0); //@line 452 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 if (!($3)) {
  __ZdlPv($2); //@line 452 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 }
 STACKTOP = sp;return; //@line 453 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10HeapRegionI11LerpProgramEC2Ev($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 STACKTOP = sp;return; //@line 15 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../instruments.h"
}
function __ZN10emscripten8internal6TypeIDI10HeapRegionI9LerpStageEE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDI10HeapRegionI9LerpStageEE3getEv()|0); //@line 98 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 return ($0|0); //@line 98 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal11LightTypeIDI10HeapRegionI9LerpStageEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (272|0); //@line 62 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal12MemberAccessI10HeapRegionI9LerpStageEjE7getWireIS4_EEjRKMS4_jRKT_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $3; //@line 527 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $5 = $2; //@line 527 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $6 = HEAP32[$5>>2]|0; //@line 527 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $7 = (($4) + ($6)|0); //@line 527 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $8 = (__ZN10emscripten8internal11BindingTypeIjE10toWireTypeERKj($7)|0); //@line 527 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 STACKTOP = sp;return ($8|0); //@line 527 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10emscripten8internal12MemberAccessI10HeapRegionI9LerpStageEjE7setWireIS4_EEvRKMS4_jRT_j($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $6 = $5; //@line 536 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $7 = (__ZN10emscripten8internal11BindingTypeIjE12fromWireTypeEj($6)|0); //@line 536 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $8 = $4; //@line 536 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $9 = $3; //@line 536 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $10 = HEAP32[$9>>2]|0; //@line 536 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $11 = (($8) + ($10)|0); //@line 536 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 HEAP32[$11>>2] = $7; //@line 536 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 STACKTOP = sp;return; //@line 537 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10emscripten8internal10getContextIM10HeapRegionI9LerpStageEjEEPT_RKS6_($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__Znwj(4)|0); //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $3 = $1; //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $4 = HEAP32[$3>>2]|0; //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 HEAP32[$2>>2] = $4; //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 STACKTOP = sp;return ($2|0); //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10emscripten8internal15raw_constructorI10HeapRegionI9LerpStageEJEEEPT_DpNS0_11BindingTypeIT0_E8WireTypeE() {
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = (__Znwj(8)|0); //@line 445 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 __THREW__ = 0;
 invoke_vi(119,($2|0)); //@line 445 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $3 = __THREW__; __THREW__ = 0;
 $4 = $3&1;
 if ($4) {
  $5 = ___cxa_find_matching_catch_2()|0;
  $6 = tempRet0;
  $0 = $5; //@line 448 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $1 = $6; //@line 448 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  __ZdlPv($2); //@line 445 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $7 = $0; //@line 445 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $8 = $1; //@line 445 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  ___resumeException($7|0);
  // unreachable;
 } else {
  STACKTOP = sp;return ($2|0); //@line 445 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 }
 return (0)|0;
}
function __ZN10emscripten8internal14raw_destructorI10HeapRegionI9LerpStageEEEvPT_($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1; //@line 452 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $3 = ($2|0)==(0|0); //@line 452 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 if (!($3)) {
  __ZdlPv($2); //@line 452 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 }
 STACKTOP = sp;return; //@line 453 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10HeapRegionI9LerpStageEC2Ev($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 STACKTOP = sp;return; //@line 15 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../instruments.h"
}
function __ZN10emscripten8internal6TypeIDI10HeapRegionIhEE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDI10HeapRegionIhEE3getEv()|0); //@line 98 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 return ($0|0); //@line 98 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal11LightTypeIDI10HeapRegionIhEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (280|0); //@line 62 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal12MemberAccessI10HeapRegionIhEjE7getWireIS3_EEjRKMS3_jRKT_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $3; //@line 527 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $5 = $2; //@line 527 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $6 = HEAP32[$5>>2]|0; //@line 527 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $7 = (($4) + ($6)|0); //@line 527 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $8 = (__ZN10emscripten8internal11BindingTypeIjE10toWireTypeERKj($7)|0); //@line 527 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 STACKTOP = sp;return ($8|0); //@line 527 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10emscripten8internal12MemberAccessI10HeapRegionIhEjE7setWireIS3_EEvRKMS3_jRT_j($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $6 = $5; //@line 536 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $7 = (__ZN10emscripten8internal11BindingTypeIjE12fromWireTypeEj($6)|0); //@line 536 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $8 = $4; //@line 536 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $9 = $3; //@line 536 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $10 = HEAP32[$9>>2]|0; //@line 536 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $11 = (($8) + ($10)|0); //@line 536 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 HEAP32[$11>>2] = $7; //@line 536 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 STACKTOP = sp;return; //@line 537 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10emscripten8internal10getContextIM10HeapRegionIhEjEEPT_RKS5_($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__Znwj(4)|0); //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $3 = $1; //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $4 = HEAP32[$3>>2]|0; //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 HEAP32[$2>>2] = $4; //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 STACKTOP = sp;return ($2|0); //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10emscripten8internal15raw_constructorI10HeapRegionIhEJEEEPT_DpNS0_11BindingTypeIT0_E8WireTypeE() {
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = (__Znwj(8)|0); //@line 445 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 __THREW__ = 0;
 invoke_vi(120,($2|0)); //@line 445 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $3 = __THREW__; __THREW__ = 0;
 $4 = $3&1;
 if ($4) {
  $5 = ___cxa_find_matching_catch_2()|0;
  $6 = tempRet0;
  $0 = $5; //@line 448 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $1 = $6; //@line 448 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  __ZdlPv($2); //@line 445 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $7 = $0; //@line 445 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $8 = $1; //@line 445 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  ___resumeException($7|0);
  // unreachable;
 } else {
  STACKTOP = sp;return ($2|0); //@line 445 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 }
 return (0)|0;
}
function __ZN10emscripten8internal14raw_destructorI10HeapRegionIhEEEvPT_($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1; //@line 452 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $3 = ($2|0)==(0|0); //@line 452 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 if (!($3)) {
  __ZdlPv($2); //@line 452 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 }
 STACKTOP = sp;return; //@line 453 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10HeapRegionIhEC2Ev($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 STACKTOP = sp;return; //@line 15 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../instruments.h"
}
function __ZN10emscripten8internal6TypeIDI10HeapRegionIaEE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDI10HeapRegionIaEE3getEv()|0); //@line 98 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 return ($0|0); //@line 98 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal11LightTypeIDI10HeapRegionIaEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (288|0); //@line 62 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal12MemberAccessI10HeapRegionIaEjE7getWireIS3_EEjRKMS3_jRKT_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $3; //@line 527 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $5 = $2; //@line 527 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $6 = HEAP32[$5>>2]|0; //@line 527 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $7 = (($4) + ($6)|0); //@line 527 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $8 = (__ZN10emscripten8internal11BindingTypeIjE10toWireTypeERKj($7)|0); //@line 527 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 STACKTOP = sp;return ($8|0); //@line 527 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10emscripten8internal12MemberAccessI10HeapRegionIaEjE7setWireIS3_EEvRKMS3_jRT_j($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $6 = $5; //@line 536 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $7 = (__ZN10emscripten8internal11BindingTypeIjE12fromWireTypeEj($6)|0); //@line 536 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $8 = $4; //@line 536 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $9 = $3; //@line 536 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $10 = HEAP32[$9>>2]|0; //@line 536 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $11 = (($8) + ($10)|0); //@line 536 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 HEAP32[$11>>2] = $7; //@line 536 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 STACKTOP = sp;return; //@line 537 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10emscripten8internal10getContextIM10HeapRegionIaEjEEPT_RKS5_($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__Znwj(4)|0); //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $3 = $1; //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $4 = HEAP32[$3>>2]|0; //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 HEAP32[$2>>2] = $4; //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 STACKTOP = sp;return ($2|0); //@line 558 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10emscripten8internal15raw_constructorI10HeapRegionIaEJEEEPT_DpNS0_11BindingTypeIT0_E8WireTypeE() {
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = (__Znwj(8)|0); //@line 445 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 __THREW__ = 0;
 invoke_vi(121,($2|0)); //@line 445 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $3 = __THREW__; __THREW__ = 0;
 $4 = $3&1;
 if ($4) {
  $5 = ___cxa_find_matching_catch_2()|0;
  $6 = tempRet0;
  $0 = $5; //@line 448 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $1 = $6; //@line 448 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  __ZdlPv($2); //@line 445 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $7 = $0; //@line 445 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  $8 = $1; //@line 445 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
  ___resumeException($7|0);
  // unreachable;
 } else {
  STACKTOP = sp;return ($2|0); //@line 445 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 }
 return (0)|0;
}
function __ZN10emscripten8internal14raw_destructorI10HeapRegionIaEEEvPT_($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1; //@line 452 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $3 = ($2|0)==(0|0); //@line 452 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 if (!($3)) {
  __ZdlPv($2); //@line 452 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 }
 STACKTOP = sp;return; //@line 453 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZN10HeapRegionIaEC2Ev($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 STACKTOP = sp;return; //@line 15 "d:\gh\my\x\src\firmware\arduino-gm-synth\emscripten/../instruments.h"
}
function __ZN10emscripten8internal7InvokerIK10HeapRegionI10InstrumentEJEE6invokeEPFS5_vE($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = sp;
 $1 = $0;
 $3 = $1; //@line 330 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 FUNCTION_TABLE_vi[$3 & 127]($2); //@line 330 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $4 = (__ZN10emscripten8internal18GenericBindingTypeI10HeapRegionI10InstrumentEE10toWireTypeERKS4_($2)|0); //@line 329 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 STACKTOP = sp;return ($4|0); //@line 329 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJK10HeapRegionI10InstrumentEEE8getCountEv($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 STACKTOP = sp;return 1; //@line 224 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJK10HeapRegionI10InstrumentEEE8getTypesEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJK10HeapRegionI10InstrumentEEEEE3getEv()|0); //@line 228 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 STACKTOP = sp;return ($2|0); //@line 228 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJK10HeapRegionI10InstrumentEEEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (880|0); //@line 208 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal18GenericBindingTypeI10HeapRegionI10InstrumentEE10toWireTypeERKS4_($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__Znwj(8)|0); //@line 354 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 $3 = $1; //@line 354 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 ;HEAP32[$2>>2]=HEAP32[$3>>2]|0;HEAP32[$2+4>>2]=HEAP32[$3+4>>2]|0; //@line 354 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 STACKTOP = sp;return ($2|0); //@line 354 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal7InvokerIK10HeapRegionI11LerpProgramEJEE6invokeEPFS5_vE($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = sp;
 $1 = $0;
 $3 = $1; //@line 330 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 FUNCTION_TABLE_vi[$3 & 127]($2); //@line 330 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $4 = (__ZN10emscripten8internal18GenericBindingTypeI10HeapRegionI11LerpProgramEE10toWireTypeERKS4_($2)|0); //@line 329 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 STACKTOP = sp;return ($4|0); //@line 329 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJK10HeapRegionI11LerpProgramEEE8getCountEv($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 STACKTOP = sp;return 1; //@line 224 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJK10HeapRegionI11LerpProgramEEE8getTypesEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJK10HeapRegionI11LerpProgramEEEEE3getEv()|0); //@line 228 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 STACKTOP = sp;return ($2|0); //@line 228 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJK10HeapRegionI11LerpProgramEEEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (884|0); //@line 208 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal18GenericBindingTypeI10HeapRegionI11LerpProgramEE10toWireTypeERKS4_($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__Znwj(8)|0); //@line 354 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 $3 = $1; //@line 354 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 ;HEAP32[$2>>2]=HEAP32[$3>>2]|0;HEAP32[$2+4>>2]=HEAP32[$3+4>>2]|0; //@line 354 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 STACKTOP = sp;return ($2|0); //@line 354 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal7InvokerIK10HeapRegionI9LerpStageEJEE6invokeEPFS5_vE($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = sp;
 $1 = $0;
 $3 = $1; //@line 330 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 FUNCTION_TABLE_vi[$3 & 127]($2); //@line 330 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $4 = (__ZN10emscripten8internal18GenericBindingTypeI10HeapRegionI9LerpStageEE10toWireTypeERKS4_($2)|0); //@line 329 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 STACKTOP = sp;return ($4|0); //@line 329 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJK10HeapRegionI9LerpStageEEE8getCountEv($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 STACKTOP = sp;return 1; //@line 224 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJK10HeapRegionI9LerpStageEEE8getTypesEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJK10HeapRegionI9LerpStageEEEEE3getEv()|0); //@line 228 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 STACKTOP = sp;return ($2|0); //@line 228 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJK10HeapRegionI9LerpStageEEEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (888|0); //@line 208 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal18GenericBindingTypeI10HeapRegionI9LerpStageEE10toWireTypeERKS4_($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__Znwj(8)|0); //@line 354 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 $3 = $1; //@line 354 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 ;HEAP32[$2>>2]=HEAP32[$3>>2]|0;HEAP32[$2+4>>2]=HEAP32[$3+4>>2]|0; //@line 354 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 STACKTOP = sp;return ($2|0); //@line 354 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal7InvokerIK10HeapRegionIaEJEE6invokeEPFS4_vE($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = sp;
 $1 = $0;
 $3 = $1; //@line 330 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 FUNCTION_TABLE_vi[$3 & 127]($2); //@line 330 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $4 = (__ZN10emscripten8internal18GenericBindingTypeI10HeapRegionIaEE10toWireTypeERKS3_($2)|0); //@line 329 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 STACKTOP = sp;return ($4|0); //@line 329 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJK10HeapRegionIaEEE8getCountEv($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 STACKTOP = sp;return 1; //@line 224 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJK10HeapRegionIaEEE8getTypesEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJK10HeapRegionIaEEEEE3getEv()|0); //@line 228 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 STACKTOP = sp;return ($2|0); //@line 228 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJK10HeapRegionIaEEEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (892|0); //@line 208 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal18GenericBindingTypeI10HeapRegionIaEE10toWireTypeERKS3_($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__Znwj(8)|0); //@line 354 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 $3 = $1; //@line 354 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 ;HEAP32[$2>>2]=HEAP32[$3>>2]|0;HEAP32[$2+4>>2]=HEAP32[$3+4>>2]|0; //@line 354 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 STACKTOP = sp;return ($2|0); //@line 354 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal7InvokerIK10HeapRegionIhEJEE6invokeEPFS4_vE($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = sp;
 $1 = $0;
 $3 = $1; //@line 330 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 FUNCTION_TABLE_vi[$3 & 127]($2); //@line 330 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $4 = (__ZN10emscripten8internal18GenericBindingTypeI10HeapRegionIhEE10toWireTypeERKS3_($2)|0); //@line 329 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 STACKTOP = sp;return ($4|0); //@line 329 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJK10HeapRegionIhEEE8getCountEv($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 STACKTOP = sp;return 1; //@line 224 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJK10HeapRegionIhEEE8getTypesEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJK10HeapRegionIhEEEEE3getEv()|0); //@line 228 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 STACKTOP = sp;return ($2|0); //@line 228 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJK10HeapRegionIhEEEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (896|0); //@line 208 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal18GenericBindingTypeI10HeapRegionIhEE10toWireTypeERKS3_($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__Znwj(8)|0); //@line 354 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 $3 = $1; //@line 354 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 ;HEAP32[$2>>2]=HEAP32[$3>>2]|0;HEAP32[$2+4>>2]=HEAP32[$3+4>>2]|0; //@line 354 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 STACKTOP = sp;return ($2|0); //@line 354 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal7InvokerIvJhEE6invokeEPFvhEh($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $2; //@line 343 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $5 = $3; //@line 344 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 $6 = (__ZN10emscripten8internal11BindingTypeIhE12fromWireTypeEh($5)|0); //@line 344 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 FUNCTION_TABLE_vi[$4 & 127]($6); //@line 343 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
 STACKTOP = sp;return; //@line 343 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/bind.h"
}
function __ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJvhEE8getCountEv($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 STACKTOP = sp;return 2; //@line 224 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZNK10emscripten8internal12WithPoliciesIJEE11ArgTypeListIJvhEE8getTypesEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJvhEEEE3getEv()|0); //@line 228 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 STACKTOP = sp;return ($2|0); //@line 228 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal14ArgArrayGetterINS0_8TypeListIJvhEEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (900|0); //@line 208 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __GLOBAL__sub_I_main_cpp() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 ___cxx_global_var_init_4();
 ___cxx_global_var_init_1();
 return;
}
function ___cxx_global_var_init_4() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 __ZN7ssd1306C2Ev(37218); //@line 25 "d:\gh\my\x\src\firmware\arduino-gm-synth\main.cpp"
 return; //@line 25 "d:\gh\my\x\src\firmware\arduino-gm-synth\main.cpp"
}
function ___cxx_global_var_init_1() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 __ZN9MidiSynthC2Ev(36136); //@line 28 "d:\gh\my\x\src\firmware\arduino-gm-synth\main.cpp"
 return; //@line 28 "d:\gh\my\x\src\firmware\arduino-gm-synth\main.cpp"
}
function __Z6noteOnhhh($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $6 = $3; //@line 31 "d:\gh\my\x\src\firmware\arduino-gm-synth\main.cpp"
 $7 = $4; //@line 31 "d:\gh\my\x\src\firmware\arduino-gm-synth\main.cpp"
 $8 = $5; //@line 31 "d:\gh\my\x\src\firmware\arduino-gm-synth\main.cpp"
 __ZN9MidiSynth10midiNoteOnEhhh(36136,$6,$7,$8); //@line 31 "d:\gh\my\x\src\firmware\arduino-gm-synth\main.cpp"
 STACKTOP = sp;return; //@line 32 "d:\gh\my\x\src\firmware\arduino-gm-synth\main.cpp"
}
function __Z7noteOffhh($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $2; //@line 35 "d:\gh\my\x\src\firmware\arduino-gm-synth\main.cpp"
 $5 = $3; //@line 35 "d:\gh\my\x\src\firmware\arduino-gm-synth\main.cpp"
 __ZN9MidiSynth11midiNoteOffEhh(36136,$4,$5); //@line 35 "d:\gh\my\x\src\firmware\arduino-gm-synth\main.cpp"
 STACKTOP = sp;return; //@line 36 "d:\gh\my\x\src\firmware\arduino-gm-synth\main.cpp"
}
function __Z5sysexhPh($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 STACKTOP = sp;return; //@line 99 "d:\gh\my\x\src\firmware\arduino-gm-synth\main.cpp"
}
function __Z13controlChangehhh($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = $0;
 $4 = $1;
 $5 = $2;
 STACKTOP = sp;return; //@line 164 "d:\gh\my\x\src\firmware\arduino-gm-synth\main.cpp"
}
function __Z13programChangehh($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $2; //@line 167 "d:\gh\my\x\src\firmware\arduino-gm-synth\main.cpp"
 $5 = $3; //@line 167 "d:\gh\my\x\src\firmware\arduino-gm-synth\main.cpp"
 __ZN9MidiSynth17midiProgramChangeEhh(36136,$4,$5); //@line 167 "d:\gh\my\x\src\firmware\arduino-gm-synth\main.cpp"
 STACKTOP = sp;return; //@line 168 "d:\gh\my\x\src\firmware\arduino-gm-synth\main.cpp"
}
function __Z9pitchBendhs($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $2; //@line 171 "d:\gh\my\x\src\firmware\arduino-gm-synth\main.cpp"
 $5 = $3; //@line 171 "d:\gh\my\x\src\firmware\arduino-gm-synth\main.cpp"
 __ZN9MidiSynth13midiPitchBendEhs(36136,$4,$5); //@line 171 "d:\gh\my\x\src\firmware\arduino-gm-synth\main.cpp"
 STACKTOP = sp;return; //@line 172 "d:\gh\my\x\src\firmware\arduino-gm-synth\main.cpp"
}
function __Z17TIMER2_COMPA_vectv() {
 var $0 = 0, $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0;
 var $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0;
 var $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0;
 var $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0;
 var $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0;
 var $189 = 0, $19 = 0, $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $2 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0;
 var $206 = 0, $207 = 0, $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $218 = 0, $219 = 0, $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0;
 var $224 = 0, $225 = 0, $226 = 0, $227 = 0, $228 = 0, $229 = 0, $23 = 0, $230 = 0, $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0;
 var $242 = 0, $243 = 0, $244 = 0, $245 = 0, $246 = 0, $247 = 0, $248 = 0, $249 = 0, $25 = 0, $250 = 0, $251 = 0, $252 = 0, $253 = 0, $254 = 0, $255 = 0, $256 = 0, $257 = 0, $258 = 0, $259 = 0, $26 = 0;
 var $260 = 0, $261 = 0, $262 = 0, $263 = 0, $264 = 0, $265 = 0, $266 = 0, $267 = 0, $268 = 0, $269 = 0, $27 = 0, $270 = 0, $271 = 0, $272 = 0, $273 = 0, $274 = 0, $275 = 0, $276 = 0, $277 = 0, $278 = 0;
 var $279 = 0, $28 = 0, $280 = 0, $281 = 0, $282 = 0, $283 = 0, $284 = 0, $285 = 0, $286 = 0, $287 = 0, $288 = 0, $289 = 0, $29 = 0, $290 = 0, $291 = 0, $292 = 0, $293 = 0, $294 = 0, $295 = 0, $296 = 0;
 var $297 = 0, $298 = 0, $299 = 0, $3 = 0, $30 = 0, $300 = 0, $301 = 0, $302 = 0, $303 = 0, $304 = 0, $305 = 0, $306 = 0, $307 = 0, $308 = 0, $309 = 0, $31 = 0, $310 = 0, $311 = 0, $312 = 0, $313 = 0;
 var $314 = 0, $315 = 0, $316 = 0, $317 = 0, $318 = 0, $319 = 0, $32 = 0, $320 = 0, $321 = 0, $322 = 0, $323 = 0, $324 = 0, $325 = 0, $326 = 0, $327 = 0, $328 = 0, $329 = 0, $33 = 0, $330 = 0, $331 = 0;
 var $332 = 0, $333 = 0, $334 = 0, $335 = 0, $336 = 0, $337 = 0, $338 = 0, $339 = 0, $34 = 0, $340 = 0, $341 = 0, $342 = 0, $343 = 0, $344 = 0, $345 = 0, $346 = 0, $347 = 0, $348 = 0, $349 = 0, $35 = 0;
 var $350 = 0, $351 = 0, $352 = 0, $353 = 0, $354 = 0, $355 = 0, $356 = 0, $357 = 0, $358 = 0, $359 = 0, $36 = 0, $360 = 0, $361 = 0, $362 = 0, $363 = 0, $364 = 0, $365 = 0, $366 = 0, $367 = 0, $368 = 0;
 var $369 = 0, $37 = 0, $370 = 0, $371 = 0, $372 = 0, $373 = 0, $374 = 0, $375 = 0, $376 = 0, $377 = 0, $378 = 0, $379 = 0, $38 = 0, $380 = 0, $381 = 0, $382 = 0, $383 = 0, $384 = 0, $385 = 0, $386 = 0;
 var $387 = 0, $388 = 0, $389 = 0, $39 = 0, $390 = 0, $391 = 0, $392 = 0, $393 = 0, $394 = 0, $395 = 0, $396 = 0, $397 = 0, $398 = 0, $399 = 0, $4 = 0, $40 = 0, $400 = 0, $401 = 0, $402 = 0, $403 = 0;
 var $404 = 0, $405 = 0, $406 = 0, $407 = 0, $408 = 0, $409 = 0, $41 = 0, $410 = 0, $411 = 0, $412 = 0, $413 = 0, $414 = 0, $415 = 0, $416 = 0, $417 = 0, $418 = 0, $419 = 0, $42 = 0, $420 = 0, $421 = 0;
 var $422 = 0, $423 = 0, $424 = 0, $425 = 0, $426 = 0, $427 = 0, $428 = 0, $429 = 0, $43 = 0, $430 = 0, $431 = 0, $432 = 0, $433 = 0, $434 = 0, $435 = 0, $436 = 0, $437 = 0, $438 = 0, $439 = 0, $44 = 0;
 var $440 = 0, $441 = 0, $442 = 0, $443 = 0, $444 = 0, $445 = 0, $446 = 0, $447 = 0, $448 = 0, $449 = 0, $45 = 0, $450 = 0, $451 = 0, $452 = 0, $453 = 0, $454 = 0, $455 = 0, $456 = 0, $457 = 0, $458 = 0;
 var $459 = 0, $46 = 0, $460 = 0, $461 = 0, $462 = 0, $463 = 0, $464 = 0, $465 = 0, $466 = 0, $467 = 0, $468 = 0, $469 = 0, $47 = 0, $470 = 0, $471 = 0, $472 = 0, $473 = 0, $474 = 0, $475 = 0, $476 = 0;
 var $477 = 0, $478 = 0, $479 = 0, $48 = 0, $480 = 0, $481 = 0, $482 = 0, $483 = 0, $484 = 0, $485 = 0, $486 = 0, $487 = 0, $488 = 0, $489 = 0, $49 = 0, $490 = 0, $491 = 0, $492 = 0, $493 = 0, $494 = 0;
 var $495 = 0, $496 = 0, $497 = 0, $498 = 0, $499 = 0, $5 = 0, $50 = 0, $500 = 0, $501 = 0, $502 = 0, $503 = 0, $504 = 0, $505 = 0, $506 = 0, $507 = 0, $508 = 0, $509 = 0, $51 = 0, $510 = 0, $511 = 0;
 var $512 = 0, $513 = 0, $514 = 0, $515 = 0, $516 = 0, $517 = 0, $518 = 0, $519 = 0, $52 = 0, $520 = 0, $521 = 0, $522 = 0, $523 = 0, $524 = 0, $525 = 0, $526 = 0, $527 = 0, $528 = 0, $529 = 0, $53 = 0;
 var $530 = 0, $531 = 0, $532 = 0, $533 = 0, $534 = 0, $535 = 0, $536 = 0, $537 = 0, $538 = 0, $539 = 0, $54 = 0, $540 = 0, $541 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0;
 var $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0;
 var $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0;
 var $98 = 0, $99 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 48|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(48|0);
 __Z3seiv(); //@line 54 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $38 = HEAP16[2097]|0; //@line 58 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $39 = $38&65535; //@line 58 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $40 = $39 >> 1; //@line 58 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $41 = HEAP16[2097]|0; //@line 58 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $42 = $41&65535; //@line 58 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $43 = $42 & 1; //@line 58 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $44 = (0 - ($43))|0; //@line 58 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $45 = $44 & 46080; //@line 58 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $46 = $40 ^ $45; //@line 58 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $47 = $46&65535; //@line 58 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 HEAP16[2097] = $47; //@line 58 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $48 = HEAP8[37315]|0; //@line 61 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $49 = (($48) + 1)<<24>>24; //@line 61 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 HEAP8[37315] = $49; //@line 61 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $50 = HEAP8[37315]|0; //@line 63 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $51 = $50&255; //@line 63 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $52 = $51 & 15; //@line 63 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $53 = $52&255; //@line 63 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $0 = $53; //@line 63 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $54 = $0; //@line 65 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $55 = $54&255; //@line 65 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $56 = (37251 + ($55)|0); //@line 65 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $57 = HEAP8[$56>>0]|0; //@line 65 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $58 = $57&1; //@line 65 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 if ($58) {
  $59 = HEAP16[2097]|0; //@line 66 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $60 = $59&255; //@line 66 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $61 = $0; //@line 66 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $62 = $61&255; //@line 66 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $63 = (37219 + ($62)|0); //@line 66 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  HEAP8[$63>>0] = $60; //@line 66 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 }
 $64 = HEAP8[37315]|0; //@line 69 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $65 = $64&255; //@line 69 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $66 = $65 & 240; //@line 69 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $67 = $66&255; //@line 69 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $1 = $67; //@line 69 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $68 = $1; //@line 70 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $69 = $68&255; //@line 70 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $70 = (($69) - 0)|0; //@line 70 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $71 = $70 >>> 6; //@line 70 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $72 = $70 << 26; //@line 70 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $73 = $71 | $72; //@line 70 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 switch ($73|0) {
 case 0:  {
  $74 = $0; //@line 72 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $75 = $74&255; //@line 72 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $76 = (3872 + (($75*10)|0)|0); //@line 72 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $77 = (__ZNV4Lerp6sampleEv($76)|0); //@line 72 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $78 = $77&255; //@line 72 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $79 = (($78) - 64)|0; //@line 72 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $80 = $79&255; //@line 72 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $2 = $80; //@line 72 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $81 = $0; //@line 73 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $82 = $81&255; //@line 73 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $83 = (37184 + ($82<<1)|0); //@line 73 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $84 = HEAP16[$83>>1]|0; //@line 73 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $85 = $84&65535; //@line 73 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $86 = $2; //@line 73 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $87 = $86 << 24 >> 24; //@line 73 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $88 = (($85) + ($87))|0; //@line 73 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $89 = $88&65535; //@line 73 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $90 = $0; //@line 73 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $91 = $90&255; //@line 73 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $92 = (37120 + ($91<<1)|0); //@line 73 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  HEAP16[$92>>1] = $89; //@line 73 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  break;
 }
 case 2:  {
  $93 = $0; //@line 78 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $94 = $93&255; //@line 78 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $95 = (4032 + (($94*10)|0)|0); //@line 78 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $96 = (__ZNV4Lerp6sampleEv($95)|0); //@line 78 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $3 = $96; //@line 78 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $97 = $0; //@line 79 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $98 = $97&255; //@line 79 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $99 = (36436 + ($98<<2)|0); //@line 79 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $100 = HEAP32[$99>>2]|0; //@line 79 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $101 = $3; //@line 79 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $102 = $101 << 24 >> 24; //@line 79 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $103 = (($100) + ($102)|0); //@line 79 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $104 = $0; //@line 79 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $105 = $104&255; //@line 79 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $106 = (36372 + ($105<<2)|0); //@line 79 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  HEAP32[$106>>2] = $103; //@line 79 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  break;
 }
 case 3: case 1:  {
  $107 = $0; //@line 85 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $108 = $107&255; //@line 85 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $109 = (3712 + (($108*10)|0)|0); //@line 85 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $110 = (__ZNV4Lerp6sampleEv($109)|0); //@line 85 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $111 = $110&255; //@line 85 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $4 = $111; //@line 85 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $112 = $4; //@line 86 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $113 = $112&65535; //@line 86 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $114 = $0; //@line 86 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $115 = $114&255; //@line 86 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $116 = (37267 + ($115)|0); //@line 86 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $117 = HEAP8[$116>>0]|0; //@line 86 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $118 = $117&255; //@line 86 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $119 = Math_imul($113, $118)|0; //@line 86 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $120 = $119 >> 8; //@line 86 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $121 = $120&255; //@line 86 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $122 = $0; //@line 86 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $123 = $122&255; //@line 86 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $124 = (37235 + ($123)|0); //@line 86 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  HEAP8[$124>>0] = $121; //@line 86 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  break;
 }
 default: {
 }
 }
 $125 = HEAP8[37216]|0; //@line 96 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $126 = $125&255; //@line 96 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $127 = $126 & -5; //@line 96 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $128 = $127&255; //@line 96 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 HEAP8[37216] = $128; //@line 96 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $129 = HEAP16[18560]|0; //@line 118 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $130 = $129&65535; //@line 118 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $131 = HEAP16[18544]|0; //@line 118 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $132 = $131&65535; //@line 118 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $133 = (($132) + ($130))|0; //@line 118 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $134 = $133&65535; //@line 118 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 HEAP16[18544] = $134; //@line 118 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $135 = HEAP16[18544]|0; //@line 118 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $136 = $135&65535; //@line 118 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $137 = $136 >> 8; //@line 118 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $138 = $137&255; //@line 118 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $5 = $138; //@line 118 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $139 = HEAP16[(37122)>>1]|0; //@line 118 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $140 = $139&65535; //@line 118 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $141 = HEAP16[(37090)>>1]|0; //@line 118 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $142 = $141&65535; //@line 118 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $143 = (($142) + ($140))|0; //@line 118 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $144 = $143&65535; //@line 118 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 HEAP16[(37090)>>1] = $144; //@line 118 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $145 = HEAP16[(37090)>>1]|0; //@line 118 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $146 = $145&65535; //@line 118 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $147 = $146 >> 8; //@line 118 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $148 = $147&255; //@line 118 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $6 = $148; //@line 118 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $149 = HEAP16[(37124)>>1]|0; //@line 118 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $150 = $149&65535; //@line 118 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $151 = HEAP16[(37092)>>1]|0; //@line 118 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $152 = $151&65535; //@line 118 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $153 = (($152) + ($150))|0; //@line 118 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $154 = $153&65535; //@line 118 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 HEAP16[(37092)>>1] = $154; //@line 118 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $155 = HEAP16[(37092)>>1]|0; //@line 118 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $156 = $155&65535; //@line 118 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $157 = $156 >> 8; //@line 118 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $158 = $157&255; //@line 118 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $7 = $158; //@line 118 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $159 = HEAP16[(37126)>>1]|0; //@line 118 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $160 = $159&65535; //@line 118 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $161 = HEAP16[(37094)>>1]|0; //@line 118 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $162 = $161&65535; //@line 118 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $163 = (($162) + ($160))|0; //@line 118 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $164 = $163&65535; //@line 118 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 HEAP16[(37094)>>1] = $164; //@line 118 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $165 = HEAP16[(37094)>>1]|0; //@line 118 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $166 = $165&65535; //@line 118 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $167 = $166 >> 8; //@line 118 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $168 = $167&255; //@line 118 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $8 = $168; //@line 118 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $169 = HEAP16[(37128)>>1]|0; //@line 119 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $170 = $169&65535; //@line 119 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $171 = HEAP16[(37096)>>1]|0; //@line 119 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $172 = $171&65535; //@line 119 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $173 = (($172) + ($170))|0; //@line 119 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $174 = $173&65535; //@line 119 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 HEAP16[(37096)>>1] = $174; //@line 119 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $175 = HEAP16[(37096)>>1]|0; //@line 119 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $176 = $175&65535; //@line 119 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $177 = $176 >> 8; //@line 119 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $178 = $177&255; //@line 119 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $9 = $178; //@line 119 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $179 = HEAP16[(37130)>>1]|0; //@line 119 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $180 = $179&65535; //@line 119 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $181 = HEAP16[(37098)>>1]|0; //@line 119 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $182 = $181&65535; //@line 119 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $183 = (($182) + ($180))|0; //@line 119 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $184 = $183&65535; //@line 119 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 HEAP16[(37098)>>1] = $184; //@line 119 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $185 = HEAP16[(37098)>>1]|0; //@line 119 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $186 = $185&65535; //@line 119 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $187 = $186 >> 8; //@line 119 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $188 = $187&255; //@line 119 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $10 = $188; //@line 119 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $189 = HEAP16[(37132)>>1]|0; //@line 119 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $190 = $189&65535; //@line 119 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $191 = HEAP16[(37100)>>1]|0; //@line 119 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $192 = $191&65535; //@line 119 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $193 = (($192) + ($190))|0; //@line 119 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $194 = $193&65535; //@line 119 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 HEAP16[(37100)>>1] = $194; //@line 119 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $195 = HEAP16[(37100)>>1]|0; //@line 119 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $196 = $195&65535; //@line 119 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $197 = $196 >> 8; //@line 119 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $198 = $197&255; //@line 119 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $11 = $198; //@line 119 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $199 = HEAP16[(37134)>>1]|0; //@line 119 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $200 = $199&65535; //@line 119 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $201 = HEAP16[(37102)>>1]|0; //@line 119 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $202 = $201&65535; //@line 119 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $203 = (($202) + ($200))|0; //@line 119 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $204 = $203&65535; //@line 119 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 HEAP16[(37102)>>1] = $204; //@line 119 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $205 = HEAP16[(37102)>>1]|0; //@line 119 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $206 = $205&65535; //@line 119 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $207 = $206 >> 8; //@line 119 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $208 = $207&255; //@line 119 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $12 = $208; //@line 119 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $209 = HEAP32[9093]|0; //@line 121 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $210 = $5; //@line 121 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $211 = $210&255; //@line 121 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $212 = (($209) + ($211)|0); //@line 121 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $213 = (__Z13pgm_read_bytePVKv($212)|0); //@line 121 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $13 = $213; //@line 121 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $214 = HEAP32[(36376)>>2]|0; //@line 121 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $215 = $6; //@line 121 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $216 = $215&255; //@line 121 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $217 = (($214) + ($216)|0); //@line 121 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $218 = (__Z13pgm_read_bytePVKv($217)|0); //@line 121 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $14 = $218; //@line 121 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $219 = HEAP32[(36380)>>2]|0; //@line 121 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $220 = $7; //@line 121 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $221 = $220&255; //@line 121 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $222 = (($219) + ($221)|0); //@line 121 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $223 = (__Z13pgm_read_bytePVKv($222)|0); //@line 121 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $15 = $223; //@line 121 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $224 = HEAP32[(36384)>>2]|0; //@line 121 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $225 = $8; //@line 121 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $226 = $225&255; //@line 121 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $227 = (($224) + ($226)|0); //@line 121 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $228 = (__Z13pgm_read_bytePVKv($227)|0); //@line 121 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $16 = $228; //@line 121 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $229 = HEAP32[(36388)>>2]|0; //@line 122 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $230 = $9; //@line 122 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $231 = $230&255; //@line 122 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $232 = (($229) + ($231)|0); //@line 122 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $233 = (__Z13pgm_read_bytePVKv($232)|0); //@line 122 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $17 = $233; //@line 122 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $234 = HEAP32[(36392)>>2]|0; //@line 122 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $235 = $10; //@line 122 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $236 = $235&255; //@line 122 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $237 = (($234) + ($236)|0); //@line 122 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $238 = (__Z13pgm_read_bytePVKv($237)|0); //@line 122 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $18 = $238; //@line 122 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $239 = HEAP32[(36396)>>2]|0; //@line 122 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $240 = $11; //@line 122 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $241 = $240&255; //@line 122 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $242 = (($239) + ($241)|0); //@line 122 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $243 = (__Z13pgm_read_bytePVKv($242)|0); //@line 122 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $19 = $243; //@line 122 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $244 = HEAP32[(36400)>>2]|0; //@line 122 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $245 = $12; //@line 122 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $246 = $245&255; //@line 122 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $247 = (($244) + ($246)|0); //@line 122 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $248 = (__Z13pgm_read_bytePVKv($247)|0); //@line 122 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $20 = $248; //@line 122 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $249 = $13; //@line 124 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $250 = $249 << 24 >> 24; //@line 124 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $251 = HEAP8[37219]|0; //@line 124 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $252 = $251 << 24 >> 24; //@line 124 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $253 = $250 ^ $252; //@line 124 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $254 = HEAP8[37235]|0; //@line 124 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $255 = $254&255; //@line 124 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $256 = Math_imul($253, $255)|0; //@line 124 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $257 = $14; //@line 124 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $258 = $257 << 24 >> 24; //@line 124 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $259 = HEAP8[(37220)>>0]|0; //@line 124 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $260 = $259 << 24 >> 24; //@line 124 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $261 = $258 ^ $260; //@line 124 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $262 = HEAP8[(37236)>>0]|0; //@line 124 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $263 = $262&255; //@line 124 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $264 = Math_imul($261, $263)|0; //@line 124 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $265 = (($256) + ($264))|0; //@line 124 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $266 = $15; //@line 124 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $267 = $266 << 24 >> 24; //@line 124 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $268 = HEAP8[(37221)>>0]|0; //@line 124 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $269 = $268 << 24 >> 24; //@line 124 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $270 = $267 ^ $269; //@line 124 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $271 = HEAP8[(37237)>>0]|0; //@line 124 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $272 = $271&255; //@line 124 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $273 = Math_imul($270, $272)|0; //@line 124 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $274 = (($265) + ($273))|0; //@line 124 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $275 = $16; //@line 124 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $276 = $275 << 24 >> 24; //@line 124 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $277 = HEAP8[(37222)>>0]|0; //@line 124 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $278 = $277 << 24 >> 24; //@line 124 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $279 = $276 ^ $278; //@line 124 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $280 = HEAP8[(37238)>>0]|0; //@line 124 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $281 = $280&255; //@line 124 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $282 = Math_imul($279, $281)|0; //@line 124 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $283 = (($274) + ($282))|0; //@line 124 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $284 = $283 >> 1; //@line 124 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $285 = $284&65535; //@line 124 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $21 = $285; //@line 124 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $286 = $17; //@line 125 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $287 = $286 << 24 >> 24; //@line 125 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $288 = HEAP8[(37223)>>0]|0; //@line 125 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $289 = $288 << 24 >> 24; //@line 125 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $290 = $287 ^ $289; //@line 125 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $291 = HEAP8[(37239)>>0]|0; //@line 125 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $292 = $291&255; //@line 125 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $293 = Math_imul($290, $292)|0; //@line 125 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $294 = $18; //@line 125 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $295 = $294 << 24 >> 24; //@line 125 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $296 = HEAP8[(37224)>>0]|0; //@line 125 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $297 = $296 << 24 >> 24; //@line 125 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $298 = $295 ^ $297; //@line 125 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $299 = HEAP8[(37240)>>0]|0; //@line 125 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $300 = $299&255; //@line 125 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $301 = Math_imul($298, $300)|0; //@line 125 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $302 = (($293) + ($301))|0; //@line 125 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $303 = $19; //@line 125 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $304 = $303 << 24 >> 24; //@line 125 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $305 = HEAP8[(37225)>>0]|0; //@line 125 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $306 = $305 << 24 >> 24; //@line 125 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $307 = $304 ^ $306; //@line 125 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $308 = HEAP8[(37241)>>0]|0; //@line 125 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $309 = $308&255; //@line 125 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $310 = Math_imul($307, $309)|0; //@line 125 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $311 = (($302) + ($310))|0; //@line 125 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $312 = $20; //@line 125 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $313 = $312 << 24 >> 24; //@line 125 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $314 = HEAP8[(37226)>>0]|0; //@line 125 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $315 = $314 << 24 >> 24; //@line 125 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $316 = $313 ^ $315; //@line 125 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $317 = HEAP8[(37242)>>0]|0; //@line 125 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $318 = $317&255; //@line 125 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $319 = Math_imul($316, $318)|0; //@line 125 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $320 = (($311) + ($319))|0; //@line 125 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $321 = $320 >> 1; //@line 125 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $322 = $21; //@line 125 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $323 = $322 << 16 >> 16; //@line 125 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $324 = (($323) + ($321))|0; //@line 125 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $325 = $324&65535; //@line 125 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $21 = $325; //@line 125 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 while(1) {
  $326 = 128; //@line 128 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $327 = $326 & 128; //@line 128 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $328 = ($327|0)!=(0); //@line 128 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $329 = $328 ^ 1; //@line 128 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  if (!($329)) {
   break;
  }
 }
 $330 = HEAP16[(37136)>>1]|0; //@line 132 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $331 = $330&65535; //@line 132 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $332 = HEAP16[(37104)>>1]|0; //@line 132 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $333 = $332&65535; //@line 132 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $334 = (($333) + ($331))|0; //@line 132 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $335 = $334&65535; //@line 132 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 HEAP16[(37104)>>1] = $335; //@line 132 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $336 = HEAP16[(37104)>>1]|0; //@line 132 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $337 = $336&65535; //@line 132 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $338 = $337 >> 8; //@line 132 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $339 = $338&255; //@line 132 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $22 = $339; //@line 132 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $340 = HEAP16[(37138)>>1]|0; //@line 132 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $341 = $340&65535; //@line 132 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $342 = HEAP16[(37106)>>1]|0; //@line 132 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $343 = $342&65535; //@line 132 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $344 = (($343) + ($341))|0; //@line 132 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $345 = $344&65535; //@line 132 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 HEAP16[(37106)>>1] = $345; //@line 132 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $346 = HEAP16[(37106)>>1]|0; //@line 132 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $347 = $346&65535; //@line 132 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $348 = $347 >> 8; //@line 132 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $349 = $348&255; //@line 132 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $23 = $349; //@line 132 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $350 = HEAP16[(37140)>>1]|0; //@line 132 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $351 = $350&65535; //@line 132 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $352 = HEAP16[(37108)>>1]|0; //@line 132 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $353 = $352&65535; //@line 132 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $354 = (($353) + ($351))|0; //@line 132 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $355 = $354&65535; //@line 132 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 HEAP16[(37108)>>1] = $355; //@line 132 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $356 = HEAP16[(37108)>>1]|0; //@line 132 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $357 = $356&65535; //@line 132 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $358 = $357 >> 8; //@line 132 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $359 = $358&255; //@line 132 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $24 = $359; //@line 132 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $360 = HEAP16[(37142)>>1]|0; //@line 132 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $361 = $360&65535; //@line 132 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $362 = HEAP16[(37110)>>1]|0; //@line 132 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $363 = $362&65535; //@line 132 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $364 = (($363) + ($361))|0; //@line 132 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $365 = $364&65535; //@line 132 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 HEAP16[(37110)>>1] = $365; //@line 132 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $366 = HEAP16[(37110)>>1]|0; //@line 132 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $367 = $366&65535; //@line 132 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $368 = $367 >> 8; //@line 132 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $369 = $368&255; //@line 132 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $25 = $369; //@line 132 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $370 = HEAP16[(37144)>>1]|0; //@line 133 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $371 = $370&65535; //@line 133 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $372 = HEAP16[(37112)>>1]|0; //@line 133 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $373 = $372&65535; //@line 133 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $374 = (($373) + ($371))|0; //@line 133 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $375 = $374&65535; //@line 133 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 HEAP16[(37112)>>1] = $375; //@line 133 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $376 = HEAP16[(37112)>>1]|0; //@line 133 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $377 = $376&65535; //@line 133 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $378 = $377 >> 8; //@line 133 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $379 = $378&255; //@line 133 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $26 = $379; //@line 133 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $380 = HEAP16[(37146)>>1]|0; //@line 133 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $381 = $380&65535; //@line 133 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $382 = HEAP16[(37114)>>1]|0; //@line 133 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $383 = $382&65535; //@line 133 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $384 = (($383) + ($381))|0; //@line 133 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $385 = $384&65535; //@line 133 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 HEAP16[(37114)>>1] = $385; //@line 133 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $386 = HEAP16[(37114)>>1]|0; //@line 133 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $387 = $386&65535; //@line 133 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $388 = $387 >> 8; //@line 133 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $389 = $388&255; //@line 133 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $27 = $389; //@line 133 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $390 = HEAP16[(37148)>>1]|0; //@line 133 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $391 = $390&65535; //@line 133 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $392 = HEAP16[(37116)>>1]|0; //@line 133 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $393 = $392&65535; //@line 133 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $394 = (($393) + ($391))|0; //@line 133 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $395 = $394&65535; //@line 133 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 HEAP16[(37116)>>1] = $395; //@line 133 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $396 = HEAP16[(37116)>>1]|0; //@line 133 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $397 = $396&65535; //@line 133 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $398 = $397 >> 8; //@line 133 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $399 = $398&255; //@line 133 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $28 = $399; //@line 133 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $400 = HEAP16[(37150)>>1]|0; //@line 133 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $401 = $400&65535; //@line 133 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $402 = HEAP16[(37118)>>1]|0; //@line 133 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $403 = $402&65535; //@line 133 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $404 = (($403) + ($401))|0; //@line 133 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $405 = $404&65535; //@line 133 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 HEAP16[(37118)>>1] = $405; //@line 133 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $406 = HEAP16[(37118)>>1]|0; //@line 133 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $407 = $406&65535; //@line 133 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $408 = $407 >> 8; //@line 133 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $409 = $408&255; //@line 133 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $29 = $409; //@line 133 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $410 = HEAP32[(36404)>>2]|0; //@line 135 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $411 = $22; //@line 135 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $412 = $411&255; //@line 135 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $413 = (($410) + ($412)|0); //@line 135 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $414 = (__Z13pgm_read_bytePVKv($413)|0); //@line 135 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $30 = $414; //@line 135 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $415 = HEAP32[(36408)>>2]|0; //@line 135 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $416 = $23; //@line 135 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $417 = $416&255; //@line 135 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $418 = (($415) + ($417)|0); //@line 135 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $419 = (__Z13pgm_read_bytePVKv($418)|0); //@line 135 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $31 = $419; //@line 135 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $420 = HEAP32[(36412)>>2]|0; //@line 135 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $421 = $24; //@line 135 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $422 = $421&255; //@line 135 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $423 = (($420) + ($422)|0); //@line 135 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $424 = (__Z13pgm_read_bytePVKv($423)|0); //@line 135 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $32 = $424; //@line 135 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $425 = HEAP32[(36416)>>2]|0; //@line 135 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $426 = $25; //@line 135 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $427 = $426&255; //@line 135 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $428 = (($425) + ($427)|0); //@line 135 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $429 = (__Z13pgm_read_bytePVKv($428)|0); //@line 135 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $33 = $429; //@line 135 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $430 = HEAP32[(36420)>>2]|0; //@line 136 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $431 = $26; //@line 136 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $432 = $431&255; //@line 136 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $433 = (($430) + ($432)|0); //@line 136 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $434 = (__Z13pgm_read_bytePVKv($433)|0); //@line 136 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $34 = $434; //@line 136 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $435 = HEAP32[(36424)>>2]|0; //@line 136 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $436 = $27; //@line 136 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $437 = $436&255; //@line 136 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $438 = (($435) + ($437)|0); //@line 136 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $439 = (__Z13pgm_read_bytePVKv($438)|0); //@line 136 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $35 = $439; //@line 136 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $440 = HEAP32[(36428)>>2]|0; //@line 136 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $441 = $28; //@line 136 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $442 = $441&255; //@line 136 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $443 = (($440) + ($442)|0); //@line 136 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $444 = (__Z13pgm_read_bytePVKv($443)|0); //@line 136 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $36 = $444; //@line 136 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $445 = HEAP32[(36432)>>2]|0; //@line 136 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $446 = $29; //@line 136 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $447 = $446&255; //@line 136 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $448 = (($445) + ($447)|0); //@line 136 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $449 = (__Z13pgm_read_bytePVKv($448)|0); //@line 136 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $37 = $449; //@line 136 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $450 = $30; //@line 138 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $451 = $450 << 24 >> 24; //@line 138 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $452 = HEAP8[(37227)>>0]|0; //@line 138 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $453 = $452 << 24 >> 24; //@line 138 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $454 = $451 ^ $453; //@line 138 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $455 = HEAP8[(37243)>>0]|0; //@line 138 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $456 = $455&255; //@line 138 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $457 = Math_imul($454, $456)|0; //@line 138 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $458 = $31; //@line 138 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $459 = $458 << 24 >> 24; //@line 138 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $460 = HEAP8[(37228)>>0]|0; //@line 138 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $461 = $460 << 24 >> 24; //@line 138 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $462 = $459 ^ $461; //@line 138 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $463 = HEAP8[(37244)>>0]|0; //@line 138 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $464 = $463&255; //@line 138 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $465 = Math_imul($462, $464)|0; //@line 138 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $466 = (($457) + ($465))|0; //@line 138 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $467 = $32; //@line 138 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $468 = $467 << 24 >> 24; //@line 138 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $469 = HEAP8[(37229)>>0]|0; //@line 138 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $470 = $469 << 24 >> 24; //@line 138 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $471 = $468 ^ $470; //@line 138 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $472 = HEAP8[(37245)>>0]|0; //@line 138 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $473 = $472&255; //@line 138 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $474 = Math_imul($471, $473)|0; //@line 138 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $475 = (($466) + ($474))|0; //@line 138 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $476 = $33; //@line 138 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $477 = $476 << 24 >> 24; //@line 138 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $478 = HEAP8[(37230)>>0]|0; //@line 138 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $479 = $478 << 24 >> 24; //@line 138 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $480 = $477 ^ $479; //@line 138 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $481 = HEAP8[(37246)>>0]|0; //@line 138 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $482 = $481&255; //@line 138 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $483 = Math_imul($480, $482)|0; //@line 138 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $484 = (($475) + ($483))|0; //@line 138 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $485 = $484 >> 1; //@line 138 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $486 = $21; //@line 138 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $487 = $486 << 16 >> 16; //@line 138 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $488 = (($487) + ($485))|0; //@line 138 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $489 = $488&65535; //@line 138 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $21 = $489; //@line 138 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $490 = $34; //@line 139 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $491 = $490 << 24 >> 24; //@line 139 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $492 = HEAP8[(37231)>>0]|0; //@line 139 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $493 = $492 << 24 >> 24; //@line 139 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $494 = $491 ^ $493; //@line 139 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $495 = HEAP8[(37247)>>0]|0; //@line 139 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $496 = $495&255; //@line 139 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $497 = Math_imul($494, $496)|0; //@line 139 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $498 = $35; //@line 139 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $499 = $498 << 24 >> 24; //@line 139 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $500 = HEAP8[(37232)>>0]|0; //@line 139 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $501 = $500 << 24 >> 24; //@line 139 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $502 = $499 ^ $501; //@line 139 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $503 = HEAP8[(37248)>>0]|0; //@line 139 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $504 = $503&255; //@line 139 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $505 = Math_imul($502, $504)|0; //@line 139 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $506 = (($497) + ($505))|0; //@line 139 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $507 = $36; //@line 139 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $508 = $507 << 24 >> 24; //@line 139 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $509 = HEAP8[(37233)>>0]|0; //@line 139 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $510 = $509 << 24 >> 24; //@line 139 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $511 = $508 ^ $510; //@line 139 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $512 = HEAP8[(37249)>>0]|0; //@line 139 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $513 = $512&255; //@line 139 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $514 = Math_imul($511, $513)|0; //@line 139 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $515 = (($506) + ($514))|0; //@line 139 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $516 = $37; //@line 139 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $517 = $516 << 24 >> 24; //@line 139 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $518 = HEAP8[(37234)>>0]|0; //@line 139 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $519 = $518 << 24 >> 24; //@line 139 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $520 = $517 ^ $519; //@line 139 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $521 = HEAP8[(37250)>>0]|0; //@line 139 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $522 = $521&255; //@line 139 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $523 = Math_imul($520, $522)|0; //@line 139 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $524 = (($515) + ($523))|0; //@line 139 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $525 = $524 >> 1; //@line 139 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $526 = $21; //@line 139 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $527 = $526 << 16 >> 16; //@line 139 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $528 = (($527) + ($525))|0; //@line 139 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $529 = $528&65535; //@line 139 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $21 = $529; //@line 139 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $530 = $21; //@line 141 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $531 = $530 << 16 >> 16; //@line 141 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $532 = (($531) + 32768)|0; //@line 141 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $533 = $532&65535; //@line 141 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 HEAP16[2096] = $533; //@line 141 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 while(1) {
  $534 = 128; //@line 144 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $535 = $534 & 128; //@line 144 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $536 = ($535|0)!=(0); //@line 144 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $537 = $536 ^ 1; //@line 144 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  if (!($537)) {
   break;
  }
 }
 $538 = HEAP8[37216]|0; //@line 145 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $539 = $538&255; //@line 145 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $540 = $539 | 4; //@line 145 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $541 = $540&255; //@line 145 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 HEAP8[37216] = $541; //@line 145 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 STACKTOP = sp;return; //@line 154 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
}
function __ZN5Synth6sampleEv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 __Z17TIMER2_COMPA_vectv(); //@line 158 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $2 = HEAP16[2096]|0; //@line 159 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 STACKTOP = sp;return ($2|0); //@line 159 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
}
function __ZN5Synth12getNextVoiceEv($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0;
 var $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0;
 var $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $1 = $0;
 $2 = 15; //@line 166 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $11 = $2; //@line 171 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $12 = $11&255; //@line 171 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $13 = (3712 + (($12*10)|0)|0); //@line 171 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $5 = $13; //@line 171 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $14 = $5; //@line 172 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $15 = ((($14)) + 3|0); //@line 172 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $16 = HEAP8[$15>>0]|0; //@line 172 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $3 = $16; //@line 172 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $17 = $5; //@line 173 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $18 = ((($17)) + 4|0); //@line 173 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $19 = HEAP16[$18>>1]|0; //@line 173 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $20 = $19&255; //@line 173 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $4 = $20; //@line 173 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $6 = 14; //@line 176 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 while(1) {
  $21 = $6; //@line 176 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $22 = $21 << 24 >> 24; //@line 176 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $23 = ($22|0)>=(0); //@line 176 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  if (!($23)) {
   break;
  }
  $24 = $6; //@line 177 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $25 = $24 << 24 >> 24; //@line 177 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $26 = (3712 + (($25*10)|0)|0); //@line 177 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $7 = $26; //@line 177 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $27 = $7; //@line 178 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $28 = ((($27)) + 3|0); //@line 178 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $29 = HEAP8[$28>>0]|0; //@line 178 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $8 = $29; //@line 178 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $30 = $8; //@line 180 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $31 = $30&255; //@line 180 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $32 = $3; //@line 180 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $33 = $32&255; //@line 180 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $34 = ($31|0)>=($33|0); //@line 180 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  do {
   if ($34) {
    $35 = $8; //@line 181 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
    $36 = $35&255; //@line 181 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
    $37 = $3; //@line 181 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
    $38 = $37&255; //@line 181 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
    $39 = ($36|0)==($38|0); //@line 181 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
    if (!($39)) {
     $62 = $6; //@line 194 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
     $2 = $62; //@line 194 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
     $63 = $8; //@line 195 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
     $3 = $63; //@line 195 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
     $64 = $7; //@line 196 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
     $65 = ((($64)) + 4|0); //@line 196 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
     $66 = HEAP16[$65>>1]|0; //@line 196 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
     $67 = $66&255; //@line 196 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
     $4 = $67; //@line 196 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
     break;
    }
    $40 = $7; //@line 182 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
    $41 = ((($40)) + 4|0); //@line 182 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
    $42 = HEAP16[$41>>1]|0; //@line 182 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
    $43 = $42&255; //@line 182 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
    $9 = $43; //@line 182 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
    $44 = $7; //@line 184 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
    $45 = ((($44)) + 6|0); //@line 184 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
    $46 = HEAP16[$45>>1]|0; //@line 184 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
    $47 = $46 << 16 >> 16; //@line 184 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
    $48 = ($47|0)>(0); //@line 184 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
    $49 = $9;
    $50 = $49 << 24 >> 24;
    $51 = $4;
    $52 = $51 << 24 >> 24;
    $53 = ($50|0)>=($52|0); //@line 185 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
    $54 = ($50|0)<=($52|0); //@line 186 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
    $55 = $48 ? $53 : $54; //@line 184 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
    $56 = $55&1; //@line 184 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
    $10 = $56; //@line 184 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
    $57 = $10; //@line 188 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
    $58 = $57&1; //@line 188 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
    if ($58) {
     $59 = $6; //@line 189 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
     $2 = $59; //@line 189 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
     $60 = $8; //@line 190 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
     $3 = $60; //@line 190 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
     $61 = $9; //@line 191 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
     $4 = $61; //@line 191 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
    }
   }
  } while(0);
  $68 = $6; //@line 176 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $69 = (($68) + -1)<<24>>24; //@line 176 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $6 = $69; //@line 176 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 }
 $70 = $2; //@line 201 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 STACKTOP = sp;return ($70|0); //@line 201 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
}
function __ZN5Synth6noteOnEhhhRK10Instrument($0,$1,$2,$3,$4) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 var $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0;
 var $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0;
 var $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0;
 var $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0;
 var $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0;
 var $99 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $7 = $0;
 $8 = $1;
 $9 = $2;
 $10 = $3;
 $11 = $4;
 $14 = $7;
 $15 = $11; //@line 205 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $16 = ((($15)) + 8|0); //@line 205 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $17 = HEAP8[$16>>0]|0; //@line 205 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $18 = $17&255; //@line 205 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $19 = $18 & 2; //@line 205 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $20 = ($19|0)!=(0); //@line 205 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 if ($20) {
  $21 = $10; //@line 206 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $22 = $21&255; //@line 206 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $23 = $22 >> 1; //@line 206 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $24 = $23&255; //@line 206 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $10 = $24; //@line 206 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 }
 $25 = $11; //@line 208 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $26 = ((($25)) + 8|0); //@line 208 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $27 = HEAP8[$26>>0]|0; //@line 208 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $28 = $8; //@line 208 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $29 = $28&255; //@line 208 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $30 = (37299 + ($29)|0); //@line 208 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 HEAP8[$30>>0] = $27; //@line 208 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $31 = $11; //@line 210 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $32 = ((($31)) + 8|0); //@line 210 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $33 = HEAP8[$32>>0]|0; //@line 210 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $34 = $33&255; //@line 210 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $35 = $34 & 1; //@line 210 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $36 = ($35|0)!=(0); //@line 210 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $37 = $36&1; //@line 210 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $12 = $37; //@line 210 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $38 = $9; //@line 212 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $39 = $8; //@line 212 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $40 = $39&255; //@line 212 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $41 = (37283 + ($40)|0); //@line 212 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 HEAP8[$41>>0] = $38; //@line 212 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $42 = $9; //@line 214 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $43 = $42&255; //@line 214 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $44 = (4196 + ($43<<1)|0); //@line 214 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $45 = (__Z13pgm_read_wordPVKv($44)|0); //@line 214 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $13 = $45; //@line 214 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $6 = $14;
 __Z3cliv(); //@line 35 "d:\gh\my\x\src\firmware\arduino-gm-synth/synth.h"
 __Z3seiv(); //@line 37 "d:\gh\my\x\src\firmware\arduino-gm-synth/synth.h"
 $46 = $11; //@line 221 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $47 = HEAP32[$46>>2]|0; //@line 221 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $48 = $8; //@line 221 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $49 = $48&255; //@line 221 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $50 = (36436 + ($49<<2)|0); //@line 221 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 HEAP32[$50>>2] = $47; //@line 221 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $51 = $8; //@line 221 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $52 = $51&255; //@line 221 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $53 = (36372 + ($52<<2)|0); //@line 221 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 HEAP32[$53>>2] = $47; //@line 221 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $54 = $8; //@line 222 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $55 = $54&255; //@line 222 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $56 = (37088 + ($55<<1)|0); //@line 222 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 HEAP16[$56>>1] = 0; //@line 222 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $57 = $13; //@line 223 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $58 = $8; //@line 223 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $59 = $58&255; //@line 223 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $60 = (37152 + ($59<<1)|0); //@line 223 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 HEAP16[$60>>1] = $57; //@line 223 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $61 = HEAP16[$60>>1]|0; //@line 223 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $62 = $8; //@line 223 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $63 = $62&255; //@line 223 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $64 = (37184 + ($63<<1)|0); //@line 223 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 HEAP16[$64>>1] = $61; //@line 223 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $65 = HEAP16[$64>>1]|0; //@line 223 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $66 = $8; //@line 223 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $67 = $66&255; //@line 223 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $68 = (37120 + ($67<<1)|0); //@line 223 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 HEAP16[$68>>1] = $65; //@line 223 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $69 = $11; //@line 224 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $70 = ((($69)) + 7|0); //@line 224 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $71 = HEAP8[$70>>0]|0; //@line 224 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $72 = $8; //@line 224 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $73 = $72&255; //@line 224 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $74 = (37219 + ($73)|0); //@line 224 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 HEAP8[$74>>0] = $71; //@line 224 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $75 = $8; //@line 225 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $76 = $75&255; //@line 225 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $77 = (37235 + ($76)|0); //@line 225 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 HEAP8[$77>>0] = 0; //@line 225 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $78 = $12; //@line 226 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $79 = $78&1; //@line 226 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $80 = $8; //@line 226 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $81 = $80&255; //@line 226 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $82 = (37251 + ($81)|0); //@line 226 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $83 = $79&1; //@line 226 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 HEAP8[$82>>0] = $83; //@line 226 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $84 = $10; //@line 227 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $85 = $8; //@line 227 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $86 = $85&255; //@line 227 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $87 = (37267 + ($86)|0); //@line 227 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 HEAP8[$87>>0] = $84; //@line 227 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $88 = $8; //@line 228 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $89 = $88&255; //@line 228 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $90 = (3712 + (($89*10)|0)|0); //@line 228 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $91 = $11; //@line 228 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $92 = ((($91)) + 4|0); //@line 228 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $93 = HEAP8[$92>>0]|0; //@line 228 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 __ZNV4Lerp5startEhh($90,$93,0); //@line 228 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $94 = $8; //@line 229 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $95 = $94&255; //@line 229 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $96 = (3872 + (($95*10)|0)|0); //@line 229 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $97 = $11; //@line 229 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $98 = ((($97)) + 5|0); //@line 229 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $99 = HEAP8[$98>>0]|0; //@line 229 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 __ZNV4Lerp5startEhh($96,$99,64); //@line 229 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $100 = $8; //@line 230 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $101 = $100&255; //@line 230 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $102 = (4032 + (($101*10)|0)|0); //@line 230 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $103 = $11; //@line 230 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $104 = ((($103)) + 6|0); //@line 230 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $105 = HEAP8[$104>>0]|0; //@line 230 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 __ZNV4Lerp5startEhh($102,$105,0); //@line 230 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $5 = $14;
 STACKTOP = sp;return; //@line 233 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
}
function __ZN5Synth7noteOffEh($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $4 = $0;
 $5 = $1;
 $6 = $4;
 $3 = $6;
 __Z3cliv(); //@line 35 "d:\gh\my\x\src\firmware\arduino-gm-synth/synth.h"
 __Z3seiv(); //@line 37 "d:\gh\my\x\src\firmware\arduino-gm-synth/synth.h"
 $7 = $5; //@line 238 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $8 = $7&255; //@line 238 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $9 = (3712 + (($8*10)|0)|0); //@line 238 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 __ZNV4Lerp4stopEv($9); //@line 238 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $2 = $6;
 STACKTOP = sp;return; //@line 240 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
}
function __ZN5Synth9pitchBendEhs($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0;
 var $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $5 = $0;
 $6 = $1;
 $7 = $2;
 $12 = $5;
 $13 = $6; //@line 243 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $14 = $13&255; //@line 243 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $15 = (37152 + ($14<<1)|0); //@line 243 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $16 = HEAP16[$15>>1]|0; //@line 243 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $8 = $16; //@line 243 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $17 = $7; //@line 246 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $18 = $17 << 16 >> 16; //@line 246 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $19 = ($18|0)>(0); //@line 246 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 if ($19) {
  $20 = $8; //@line 247 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $10 = $20; //@line 247 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $21 = $6; //@line 248 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $22 = $21&255; //@line 248 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $23 = (37283 + ($22)|0); //@line 248 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $24 = HEAP8[$23>>0]|0; //@line 248 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $25 = $24&255; //@line 248 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $26 = (($25) + 2)|0; //@line 248 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $27 = (4196 + ($26<<1)|0); //@line 248 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $28 = (__Z13pgm_read_wordPVKv($27)|0); //@line 248 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $9 = $28; //@line 248 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 } else {
  $29 = $6; //@line 250 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $30 = $29&255; //@line 250 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $31 = (37283 + ($30)|0); //@line 250 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $32 = HEAP8[$31>>0]|0; //@line 250 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $33 = $32&255; //@line 250 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $34 = (($33) - 2)|0; //@line 250 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $35 = (4196 + ($34<<1)|0); //@line 250 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $36 = (__Z13pgm_read_wordPVKv($35)|0); //@line 250 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $10 = $36; //@line 250 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $37 = $8; //@line 251 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
  $9 = $37; //@line 251 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 }
 $38 = $9; //@line 254 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $39 = $38&65535; //@line 254 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $40 = $10; //@line 254 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $41 = $40&65535; //@line 254 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $42 = (($39) - ($41))|0; //@line 254 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $11 = $42; //@line 254 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $43 = $11; //@line 255 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $44 = $7; //@line 255 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $45 = $44 << 16 >> 16; //@line 255 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $46 = Math_imul($43, $45)|0; //@line 255 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $47 = (($46|0) / 8192)&-1; //@line 255 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $48 = $47&65535; //@line 255 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $49 = $48 << 16 >> 16; //@line 255 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $50 = $8; //@line 255 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $51 = $50&65535; //@line 255 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $52 = (($51) + ($49))|0; //@line 255 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $53 = $52&65535; //@line 255 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $8 = $53; //@line 255 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $4 = $12;
 __Z3cliv(); //@line 35 "d:\gh\my\x\src\firmware\arduino-gm-synth/synth.h"
 __Z3seiv(); //@line 37 "d:\gh\my\x\src\firmware\arduino-gm-synth/synth.h"
 $54 = $8; //@line 259 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $55 = $6; //@line 259 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $56 = $55&255; //@line 259 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $57 = (37184 + ($56<<1)|0); //@line 259 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 HEAP16[$57>>1] = $54; //@line 259 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
 $3 = $12;
 STACKTOP = sp;return; //@line 261 "d:\gh\my\x\src\firmware\arduino-gm-synth\synth.cpp"
}
function __ZN11Instruments13getInstrumentEhR10Instrument($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $2; //@line 10 "d:\gh\my\x\src\firmware\arduino-gm-synth\instruments.cpp"
 $5 = $4&255; //@line 10 "d:\gh\my\x\src\firmware\arduino-gm-synth\instruments.cpp"
 $6 = (908 + (($5*12)|0)|0); //@line 10 "d:\gh\my\x\src\firmware\arduino-gm-synth\instruments.cpp"
 $7 = $3; //@line 10 "d:\gh\my\x\src\firmware\arduino-gm-synth\instruments.cpp"
 __Z20PROGMEM_readAnythingI10InstrumentEvPKT_RS1_($6,$7); //@line 10 "d:\gh\my\x\src\firmware\arduino-gm-synth\instruments.cpp"
 STACKTOP = sp;return; //@line 11 "d:\gh\my\x\src\firmware\arduino-gm-synth\instruments.cpp"
}
function __Z20PROGMEM_readAnythingI10InstrumentEvPKT_RS1_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $3; //@line 6 "d:\gh\my\x\src\firmware\arduino-gm-synth\instruments.cpp"
 $5 = $2; //@line 6 "d:\gh\my\x\src\firmware\arduino-gm-synth\instruments.cpp"
 ;HEAP32[$4>>2]=HEAP32[$5>>2]|0;HEAP32[$4+4>>2]=HEAP32[$5+4>>2]|0;HEAP32[$4+8>>2]=HEAP32[$5+8>>2]|0; //@line 6 "d:\gh\my\x\src\firmware\arduino-gm-synth\instruments.cpp"
 STACKTOP = sp;return; //@line 7 "d:\gh\my\x\src\firmware\arduino-gm-synth\instruments.cpp"
}
function __ZN11Instruments17getPercussionNoteEh($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = $1; //@line 14 "d:\gh\my\x\src\firmware\arduino-gm-synth\instruments.cpp"
 $3 = $2&255; //@line 14 "d:\gh\my\x\src\firmware\arduino-gm-synth\instruments.cpp"
 $4 = (30742 + ($3)|0); //@line 14 "d:\gh\my\x\src\firmware\arduino-gm-synth\instruments.cpp"
 $5 = (__Z13pgm_read_bytePVKv($4)|0); //@line 14 "d:\gh\my\x\src\firmware\arduino-gm-synth\instruments.cpp"
 STACKTOP = sp;return ($5|0); //@line 14 "d:\gh\my\x\src\firmware\arduino-gm-synth\instruments.cpp"
}
function __ZN11Instruments14getLerpProgramEhR11LerpProgram($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $2; //@line 18 "d:\gh\my\x\src\firmware\arduino-gm-synth\instruments.cpp"
 $5 = $4&255; //@line 18 "d:\gh\my\x\src\firmware\arduino-gm-synth\instruments.cpp"
 $6 = (30789 + ($5<<1)|0); //@line 18 "d:\gh\my\x\src\firmware\arduino-gm-synth\instruments.cpp"
 $7 = $3; //@line 18 "d:\gh\my\x\src\firmware\arduino-gm-synth\instruments.cpp"
 __Z20PROGMEM_readAnythingI11LerpProgramEvPKT_RS1_($6,$7); //@line 18 "d:\gh\my\x\src\firmware\arduino-gm-synth\instruments.cpp"
 STACKTOP = sp;return; //@line 19 "d:\gh\my\x\src\firmware\arduino-gm-synth\instruments.cpp"
}
function __Z20PROGMEM_readAnythingI11LerpProgramEvPKT_RS1_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $3; //@line 6 "d:\gh\my\x\src\firmware\arduino-gm-synth\instruments.cpp"
 $5 = $2; //@line 6 "d:\gh\my\x\src\firmware\arduino-gm-synth\instruments.cpp"
 ;HEAP8[$4>>0]=HEAP8[$5>>0]|0;HEAP8[$4+1>>0]=HEAP8[$5+1>>0]|0; //@line 6 "d:\gh\my\x\src\firmware\arduino-gm-synth\instruments.cpp"
 STACKTOP = sp;return; //@line 7 "d:\gh\my\x\src\firmware\arduino-gm-synth\instruments.cpp"
}
function __ZN11Instruments12getLerpStageEhhR9LerpStage($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $7 = $3; //@line 22 "d:\gh\my\x\src\firmware\arduino-gm-synth\instruments.cpp"
 $8 = $7&255; //@line 22 "d:\gh\my\x\src\firmware\arduino-gm-synth\instruments.cpp"
 $9 = $4; //@line 22 "d:\gh\my\x\src\firmware\arduino-gm-synth\instruments.cpp"
 $10 = $9&255; //@line 22 "d:\gh\my\x\src\firmware\arduino-gm-synth\instruments.cpp"
 $11 = (($8) + ($10))|0; //@line 22 "d:\gh\my\x\src\firmware\arduino-gm-synth\instruments.cpp"
 $12 = (31301 + ($11)|0); //@line 22 "d:\gh\my\x\src\firmware\arduino-gm-synth\instruments.cpp"
 $13 = (__Z13pgm_read_bytePVKv($12)|0); //@line 22 "d:\gh\my\x\src\firmware\arduino-gm-synth\instruments.cpp"
 $6 = $13; //@line 22 "d:\gh\my\x\src\firmware\arduino-gm-synth\instruments.cpp"
 $14 = $6; //@line 23 "d:\gh\my\x\src\firmware\arduino-gm-synth\instruments.cpp"
 $15 = $14&255; //@line 23 "d:\gh\my\x\src\firmware\arduino-gm-synth\instruments.cpp"
 $16 = (4452 + ($15<<2)|0); //@line 23 "d:\gh\my\x\src\firmware\arduino-gm-synth\instruments.cpp"
 $17 = $5; //@line 23 "d:\gh\my\x\src\firmware\arduino-gm-synth\instruments.cpp"
 __Z20PROGMEM_readAnythingI9LerpStageEvPKT_RS1_($16,$17); //@line 23 "d:\gh\my\x\src\firmware\arduino-gm-synth\instruments.cpp"
 STACKTOP = sp;return; //@line 24 "d:\gh\my\x\src\firmware\arduino-gm-synth\instruments.cpp"
}
function __Z20PROGMEM_readAnythingI9LerpStageEvPKT_RS1_($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $1;
 $4 = $3; //@line 6 "d:\gh\my\x\src\firmware\arduino-gm-synth\instruments.cpp"
 $5 = $2; //@line 6 "d:\gh\my\x\src\firmware\arduino-gm-synth\instruments.cpp"
 ;HEAP16[$4>>1]=HEAP16[$5>>1]|0;HEAP16[$4+2>>1]=HEAP16[$5+2>>1]|0; //@line 6 "d:\gh\my\x\src\firmware\arduino-gm-synth\instruments.cpp"
 STACKTOP = sp;return; //@line 7 "d:\gh\my\x\src\firmware\arduino-gm-synth\instruments.cpp"
}
function __ZN11Instruments18getPercussionNotesEv($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 __ZN10HeapRegionIhEC2EPKhj($0,30742,47); //@line 29 "d:\gh\my\x\src\firmware\arduino-gm-synth\instruments.cpp"
 return; //@line 29 "d:\gh\my\x\src\firmware\arduino-gm-synth\instruments.cpp"
}
function __ZN10HeapRegionIhEC2EPKhj($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $6 = $3;
 $7 = $4; //@line 18 "d:\gh\my\x\src\firmware\arduino-gm-synth/instruments.h"
 $8 = $7; //@line 18 "d:\gh\my\x\src\firmware\arduino-gm-synth/instruments.h"
 HEAP32[$6>>2] = $8; //@line 18 "d:\gh\my\x\src\firmware\arduino-gm-synth/instruments.h"
 $9 = HEAP32[$6>>2]|0; //@line 19 "d:\gh\my\x\src\firmware\arduino-gm-synth/instruments.h"
 $10 = $5; //@line 19 "d:\gh\my\x\src\firmware\arduino-gm-synth/instruments.h"
 $11 = (($9) + ($10))|0; //@line 19 "d:\gh\my\x\src\firmware\arduino-gm-synth/instruments.h"
 $12 = ((($6)) + 4|0); //@line 19 "d:\gh\my\x\src\firmware\arduino-gm-synth/instruments.h"
 HEAP32[$12>>2] = $11; //@line 19 "d:\gh\my\x\src\firmware\arduino-gm-synth/instruments.h"
 STACKTOP = sp;return; //@line 20 "d:\gh\my\x\src\firmware\arduino-gm-synth/instruments.h"
}
function __ZN11Instruments12getWavetableEv($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 __ZN10HeapRegionIaEC2EPKaj($0,6166,24576); //@line 33 "d:\gh\my\x\src\firmware\arduino-gm-synth\instruments.cpp"
 return; //@line 33 "d:\gh\my\x\src\firmware\arduino-gm-synth\instruments.cpp"
}
function __ZN10HeapRegionIaEC2EPKaj($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $6 = $3;
 $7 = $4; //@line 18 "d:\gh\my\x\src\firmware\arduino-gm-synth/instruments.h"
 $8 = $7; //@line 18 "d:\gh\my\x\src\firmware\arduino-gm-synth/instruments.h"
 HEAP32[$6>>2] = $8; //@line 18 "d:\gh\my\x\src\firmware\arduino-gm-synth/instruments.h"
 $9 = HEAP32[$6>>2]|0; //@line 19 "d:\gh\my\x\src\firmware\arduino-gm-synth/instruments.h"
 $10 = $5; //@line 19 "d:\gh\my\x\src\firmware\arduino-gm-synth/instruments.h"
 $11 = (($9) + ($10))|0; //@line 19 "d:\gh\my\x\src\firmware\arduino-gm-synth/instruments.h"
 $12 = ((($6)) + 4|0); //@line 19 "d:\gh\my\x\src\firmware\arduino-gm-synth/instruments.h"
 HEAP32[$12>>2] = $11; //@line 19 "d:\gh\my\x\src\firmware\arduino-gm-synth/instruments.h"
 STACKTOP = sp;return; //@line 20 "d:\gh\my\x\src\firmware\arduino-gm-synth/instruments.h"
}
function __ZN11Instruments15getLerpProgramsEv($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 __ZN10HeapRegionI11LerpProgramEC2EPKS0_j($0,30789,512); //@line 37 "d:\gh\my\x\src\firmware\arduino-gm-synth\instruments.cpp"
 return; //@line 37 "d:\gh\my\x\src\firmware\arduino-gm-synth\instruments.cpp"
}
function __ZN10HeapRegionI11LerpProgramEC2EPKS0_j($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $6 = $3;
 $7 = $4; //@line 18 "d:\gh\my\x\src\firmware\arduino-gm-synth/instruments.h"
 $8 = $7; //@line 18 "d:\gh\my\x\src\firmware\arduino-gm-synth/instruments.h"
 HEAP32[$6>>2] = $8; //@line 18 "d:\gh\my\x\src\firmware\arduino-gm-synth/instruments.h"
 $9 = HEAP32[$6>>2]|0; //@line 19 "d:\gh\my\x\src\firmware\arduino-gm-synth/instruments.h"
 $10 = $5; //@line 19 "d:\gh\my\x\src\firmware\arduino-gm-synth/instruments.h"
 $11 = (($9) + ($10))|0; //@line 19 "d:\gh\my\x\src\firmware\arduino-gm-synth/instruments.h"
 $12 = ((($6)) + 4|0); //@line 19 "d:\gh\my\x\src\firmware\arduino-gm-synth/instruments.h"
 HEAP32[$12>>2] = $11; //@line 19 "d:\gh\my\x\src\firmware\arduino-gm-synth/instruments.h"
 STACKTOP = sp;return; //@line 20 "d:\gh\my\x\src\firmware\arduino-gm-synth/instruments.h"
}
function __ZN11Instruments19getLerpProgressionsEv($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 __ZN10HeapRegionIhEC2EPKhj($0,31301,256); //@line 41 "d:\gh\my\x\src\firmware\arduino-gm-synth\instruments.cpp"
 return; //@line 41 "d:\gh\my\x\src\firmware\arduino-gm-synth\instruments.cpp"
}
function __ZN11Instruments13getLerpStagesEv($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 __ZN10HeapRegionI9LerpStageEC2EPKS0_j($0,4452,1024); //@line 45 "d:\gh\my\x\src\firmware\arduino-gm-synth\instruments.cpp"
 return; //@line 45 "d:\gh\my\x\src\firmware\arduino-gm-synth\instruments.cpp"
}
function __ZN10HeapRegionI9LerpStageEC2EPKS0_j($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $6 = $3;
 $7 = $4; //@line 18 "d:\gh\my\x\src\firmware\arduino-gm-synth/instruments.h"
 $8 = $7; //@line 18 "d:\gh\my\x\src\firmware\arduino-gm-synth/instruments.h"
 HEAP32[$6>>2] = $8; //@line 18 "d:\gh\my\x\src\firmware\arduino-gm-synth/instruments.h"
 $9 = HEAP32[$6>>2]|0; //@line 19 "d:\gh\my\x\src\firmware\arduino-gm-synth/instruments.h"
 $10 = $5; //@line 19 "d:\gh\my\x\src\firmware\arduino-gm-synth/instruments.h"
 $11 = (($9) + ($10))|0; //@line 19 "d:\gh\my\x\src\firmware\arduino-gm-synth/instruments.h"
 $12 = ((($6)) + 4|0); //@line 19 "d:\gh\my\x\src\firmware\arduino-gm-synth/instruments.h"
 HEAP32[$12>>2] = $11; //@line 19 "d:\gh\my\x\src\firmware\arduino-gm-synth/instruments.h"
 STACKTOP = sp;return; //@line 20 "d:\gh\my\x\src\firmware\arduino-gm-synth/instruments.h"
}
function __ZN11Instruments14getInstrumentsEv($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 __ZN10HeapRegionI10InstrumentEC2EPKS0_j($0,908,2100); //@line 49 "d:\gh\my\x\src\firmware\arduino-gm-synth\instruments.cpp"
 return; //@line 49 "d:\gh\my\x\src\firmware\arduino-gm-synth\instruments.cpp"
}
function __ZN10HeapRegionI10InstrumentEC2EPKS0_j($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $6 = $3;
 $7 = $4; //@line 18 "d:\gh\my\x\src\firmware\arduino-gm-synth/instruments.h"
 $8 = $7; //@line 18 "d:\gh\my\x\src\firmware\arduino-gm-synth/instruments.h"
 HEAP32[$6>>2] = $8; //@line 18 "d:\gh\my\x\src\firmware\arduino-gm-synth/instruments.h"
 $9 = HEAP32[$6>>2]|0; //@line 19 "d:\gh\my\x\src\firmware\arduino-gm-synth/instruments.h"
 $10 = $5; //@line 19 "d:\gh\my\x\src\firmware\arduino-gm-synth/instruments.h"
 $11 = (($9) + ($10))|0; //@line 19 "d:\gh\my\x\src\firmware\arduino-gm-synth/instruments.h"
 $12 = ((($6)) + 4|0); //@line 19 "d:\gh\my\x\src\firmware\arduino-gm-synth/instruments.h"
 HEAP32[$12>>2] = $11; //@line 19 "d:\gh\my\x\src\firmware\arduino-gm-synth/instruments.h"
 STACKTOP = sp;return; //@line 20 "d:\gh\my\x\src\firmware\arduino-gm-synth/instruments.h"
}
function __Z15dispatchCommandv() {
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = HEAP32[752]|0; //@line 63 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
 switch ($1|0) {
 case 0:  {
  $2 = HEAP8[31565]|0; //@line 65 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
  $3 = HEAP8[37317]|0; //@line 65 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
  __Z7noteOffhh($2,$3); //@line 65 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
  STACKTOP = sp;return; //@line 95 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
  break;
 }
 case 1:  {
  $4 = HEAP8[(37318)>>0]|0; //@line 69 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
  $5 = $4&255; //@line 69 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
  $6 = ($5|0)==(0); //@line 69 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
  $7 = HEAP8[31565]|0;
  $8 = HEAP8[37317]|0;
  if ($6) {
   __Z7noteOffhh($7,$8); //@line 70 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
   STACKTOP = sp;return; //@line 95 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
  } else {
   $9 = HEAP8[(37318)>>0]|0; //@line 72 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
   __Z6noteOnhhh($7,$8,$9); //@line 72 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
   STACKTOP = sp;return; //@line 95 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
  }
  break;
 }
 case 6:  {
  $10 = HEAP8[(37318)>>0]|0; //@line 77 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
  $11 = $10&255; //@line 77 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
  $0 = $11; //@line 77 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
  $12 = $0; //@line 78 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
  $13 = $12 << 16 >> 16; //@line 78 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
  $14 = $13 << 7; //@line 78 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
  $15 = $14&65535; //@line 78 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
  $0 = $15; //@line 78 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
  $16 = HEAP8[37317]|0; //@line 79 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
  $17 = $16&255; //@line 79 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
  $18 = $0; //@line 79 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
  $19 = $18 << 16 >> 16; //@line 79 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
  $20 = $19 | $17; //@line 79 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
  $21 = $20&65535; //@line 79 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
  $0 = $21; //@line 79 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
  $22 = $0; //@line 80 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
  $23 = $22 << 16 >> 16; //@line 80 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
  $24 = (($23) - 8192)|0; //@line 80 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
  $25 = $24&65535; //@line 80 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
  $0 = $25; //@line 80 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
  $26 = HEAP8[31565]|0; //@line 81 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
  $27 = $0; //@line 81 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
  __Z9pitchBendhs($26,$27); //@line 81 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
  STACKTOP = sp;return; //@line 95 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
  break;
 }
 case 3:  {
  $28 = HEAP8[31565]|0; //@line 85 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
  $29 = HEAP8[37317]|0; //@line 85 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
  $30 = HEAP8[(37318)>>0]|0; //@line 85 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
  __Z13controlChangehhh($28,$29,$30); //@line 85 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
  STACKTOP = sp;return; //@line 95 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
  break;
 }
 case 4:  {
  $31 = HEAP8[31565]|0; //@line 89 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
  $32 = HEAP8[37317]|0; //@line 89 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
  __Z13programChangehh($31,$32); //@line 89 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
  STACKTOP = sp;return; //@line 95 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
  break;
 }
 default: {
  STACKTOP = sp;return; //@line 95 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
 }
 }
}
function __Z16midi_decode_byteh($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $3 = $1; //@line 98 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
 $4 = $3&255; //@line 98 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
 $5 = $4 & 128; //@line 98 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
 $6 = ($5|0)!=(0); //@line 98 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
 if ($6) {
  $7 = HEAP32[752]|0; //@line 99 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
  $8 = ($7|0)==(7); //@line 99 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
  if ($8) {
   $9 = HEAP8[37316]|0; //@line 100 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
   __Z5sysexhPh($9,37317); //@line 100 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
   $10 = $1; //@line 101 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
   $11 = $10&255; //@line 101 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
   $12 = ($11|0)==(247); //@line 101 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
   if ($12) {
    STACKTOP = sp;return; //@line 122 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
   }
  }
  $13 = $1; //@line 106 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
  $14 = $13&255; //@line 106 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
  $15 = $14 >> 4; //@line 106 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
  $16 = (($15) - 8)|0; //@line 106 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
  $2 = $16; //@line 106 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
  HEAP8[37316] = 0; //@line 107 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
  $17 = $2; //@line 108 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
  $18 = (31557 + ($17)|0); //@line 108 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
  $19 = HEAP8[$18>>0]|0; //@line 108 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
  HEAP8[31566] = $19; //@line 108 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
  $20 = $2; //@line 109 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
  HEAP32[752] = $20; //@line 109 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
  $21 = $1; //@line 110 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
  $22 = $21&255; //@line 110 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
  $23 = $22 & 15; //@line 110 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
  $24 = $23&255; //@line 110 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
  HEAP8[31565] = $24; //@line 110 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
  STACKTOP = sp;return; //@line 122 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
 }
 $25 = HEAP8[31566]|0; //@line 113 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
 $26 = $25 << 24 >> 24; //@line 113 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
 $27 = ($26|0)>(0); //@line 113 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
 if ($27) {
  $28 = $1; //@line 114 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
  $29 = HEAP8[37316]|0; //@line 114 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
  $30 = (($29) + 1)<<24>>24; //@line 114 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
  HEAP8[37316] = $30; //@line 114 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
  $31 = $29&255; //@line 114 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
  $32 = (37317 + ($31)|0); //@line 114 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
  HEAP8[$32>>0] = $28; //@line 114 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
  $33 = HEAP8[31566]|0; //@line 115 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
  $34 = (($33) + -1)<<24>>24; //@line 115 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
  HEAP8[31566] = $34; //@line 115 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
 }
 $35 = HEAP8[31566]|0; //@line 117 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
 $36 = $35 << 24 >> 24; //@line 117 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
 $37 = ($36|0)==(0); //@line 117 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
 if (!($37)) {
  STACKTOP = sp;return; //@line 122 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
 }
 __Z15dispatchCommandv(); //@line 118 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
 $38 = HEAP8[31566]|0; //@line 119 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
 $39 = (($38) + -1)<<24>>24; //@line 119 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
 HEAP8[31566] = $39; //@line 119 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
 STACKTOP = sp;return; //@line 122 "d:\gh\my\x\src\firmware\arduino-gm-synth\midi.cpp"
}
function __ZNV4Lerp5startEhh($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $3 = 0, $4 = 0;
 var $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $6 = sp + 4|0;
 $3 = $0;
 $4 = $1;
 $5 = $2;
 $7 = $3;
 $8 = $5; //@line 5 "d:\gh\my\x\src\firmware\arduino-gm-synth\lerp.cpp"
 $9 = $8&255; //@line 5 "d:\gh\my\x\src\firmware\arduino-gm-synth\lerp.cpp"
 $10 = $9 << 8; //@line 5 "d:\gh\my\x\src\firmware\arduino-gm-synth\lerp.cpp"
 $11 = $10&65535; //@line 5 "d:\gh\my\x\src\firmware\arduino-gm-synth\lerp.cpp"
 $12 = ((($7)) + 4|0); //@line 5 "d:\gh\my\x\src\firmware\arduino-gm-synth\lerp.cpp"
 HEAP16[$12>>1] = $11; //@line 5 "d:\gh\my\x\src\firmware\arduino-gm-synth\lerp.cpp"
 $13 = ((($7)) + 3|0); //@line 6 "d:\gh\my\x\src\firmware\arduino-gm-synth\lerp.cpp"
 HEAP8[$13>>0] = 0; //@line 6 "d:\gh\my\x\src\firmware\arduino-gm-synth\lerp.cpp"
 $14 = $4; //@line 9 "d:\gh\my\x\src\firmware\arduino-gm-synth\lerp.cpp"
 __ZN11Instruments14getLerpProgramEhR11LerpProgram($14,$6); //@line 9 "d:\gh\my\x\src\firmware\arduino-gm-synth\lerp.cpp"
 $15 = HEAP8[$6>>0]|0; //@line 11 "d:\gh\my\x\src\firmware\arduino-gm-synth\lerp.cpp"
 HEAP8[$7>>0] = $15; //@line 11 "d:\gh\my\x\src\firmware\arduino-gm-synth\lerp.cpp"
 $16 = ((($6)) + 1|0); //@line 12 "d:\gh\my\x\src\firmware\arduino-gm-synth\lerp.cpp"
 $17 = HEAP8[$16>>0]|0; //@line 12 "d:\gh\my\x\src\firmware\arduino-gm-synth\lerp.cpp"
 $18 = $17&255; //@line 12 "d:\gh\my\x\src\firmware\arduino-gm-synth\lerp.cpp"
 $19 = $18 >> 4; //@line 12 "d:\gh\my\x\src\firmware\arduino-gm-synth\lerp.cpp"
 $20 = $19&255; //@line 12 "d:\gh\my\x\src\firmware\arduino-gm-synth\lerp.cpp"
 $21 = ((($7)) + 1|0); //@line 12 "d:\gh\my\x\src\firmware\arduino-gm-synth\lerp.cpp"
 HEAP8[$21>>0] = $20; //@line 12 "d:\gh\my\x\src\firmware\arduino-gm-synth\lerp.cpp"
 $22 = ((($6)) + 1|0); //@line 13 "d:\gh\my\x\src\firmware\arduino-gm-synth\lerp.cpp"
 $23 = HEAP8[$22>>0]|0; //@line 13 "d:\gh\my\x\src\firmware\arduino-gm-synth\lerp.cpp"
 $24 = $23&255; //@line 13 "d:\gh\my\x\src\firmware\arduino-gm-synth\lerp.cpp"
 $25 = $24 & 15; //@line 13 "d:\gh\my\x\src\firmware\arduino-gm-synth\lerp.cpp"
 $26 = $25&255; //@line 13 "d:\gh\my\x\src\firmware\arduino-gm-synth\lerp.cpp"
 $27 = ((($7)) + 2|0); //@line 13 "d:\gh\my\x\src\firmware\arduino-gm-synth\lerp.cpp"
 HEAP8[$27>>0] = $26; //@line 13 "d:\gh\my\x\src\firmware\arduino-gm-synth\lerp.cpp"
 __ZNV4Lerp9loadStageEv($7); //@line 15 "d:\gh\my\x\src\firmware\arduino-gm-synth\lerp.cpp"
 STACKTOP = sp;return; //@line 16 "d:\gh\my\x\src\firmware\arduino-gm-synth\lerp.cpp"
}
function __ZNV4Lerp9loadStageEv($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = sp + 4|0;
 $1 = $0;
 $3 = $1;
 $4 = HEAP8[$3>>0]|0; //@line 20 "d:\gh\my\x\src\firmware\arduino-gm-synth\lerp.cpp"
 $5 = ((($3)) + 3|0); //@line 20 "d:\gh\my\x\src\firmware\arduino-gm-synth\lerp.cpp"
 $6 = HEAP8[$5>>0]|0; //@line 20 "d:\gh\my\x\src\firmware\arduino-gm-synth\lerp.cpp"
 __ZN11Instruments12getLerpStageEhhR9LerpStage($4,$6,$2); //@line 20 "d:\gh\my\x\src\firmware\arduino-gm-synth\lerp.cpp"
 $7 = HEAP16[$2>>1]|0; //@line 21 "d:\gh\my\x\src\firmware\arduino-gm-synth\lerp.cpp"
 $8 = ((($3)) + 6|0); //@line 21 "d:\gh\my\x\src\firmware\arduino-gm-synth\lerp.cpp"
 HEAP16[$8>>1] = $7; //@line 21 "d:\gh\my\x\src\firmware\arduino-gm-synth\lerp.cpp"
 $9 = ((($2)) + 2|0); //@line 22 "d:\gh\my\x\src\firmware\arduino-gm-synth\lerp.cpp"
 $10 = HEAP8[$9>>0]|0; //@line 22 "d:\gh\my\x\src\firmware\arduino-gm-synth\lerp.cpp"
 $11 = ((($3)) + 8|0); //@line 22 "d:\gh\my\x\src\firmware\arduino-gm-synth\lerp.cpp"
 HEAP8[$11>>0] = $10; //@line 22 "d:\gh\my\x\src\firmware\arduino-gm-synth\lerp.cpp"
 STACKTOP = sp;return; //@line 23 "d:\gh\my\x\src\firmware\arduino-gm-synth\lerp.cpp"
}
function __ZN7ssd1306C2Ev($0) {
 $0 = $0|0;
 var $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 STACKTOP = sp;return; //@line 32 "d:\gh\my\x\src\firmware\arduino-gm-synth\ssd1306.cpp"
}
function __GLOBAL__sub_I_bind_cpp() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 ___cxx_global_var_init_58();
 return;
}
function ___cxx_global_var_init_58() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 __ZN53EmscriptenBindingInitializer_native_and_builtin_typesC2Ev(37349); //@line 95 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 return; //@line 95 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
}
function __ZN53EmscriptenBindingInitializer_native_and_builtin_typesC2Ev($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal6TypeIDIvE3getEv()|0); //@line 98 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 __embind_register_void(($2|0),(31567|0)); //@line 98 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 $3 = (__ZN10emscripten8internal6TypeIDIbE3getEv()|0); //@line 100 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 __embind_register_bool(($3|0),(31572|0),1,1,0); //@line 100 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 __ZN12_GLOBAL__N_1L16register_integerIcEEvPKc(31577); //@line 102 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 __ZN12_GLOBAL__N_1L16register_integerIaEEvPKc(31582); //@line 103 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 __ZN12_GLOBAL__N_1L16register_integerIhEEvPKc(31594); //@line 104 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 __ZN12_GLOBAL__N_1L16register_integerIsEEvPKc(31608); //@line 105 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 __ZN12_GLOBAL__N_1L16register_integerItEEvPKc(31614); //@line 106 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 __ZN12_GLOBAL__N_1L16register_integerIiEEvPKc(31629); //@line 107 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 __ZN12_GLOBAL__N_1L16register_integerIjEEvPKc(31633); //@line 108 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 __ZN12_GLOBAL__N_1L16register_integerIlEEvPKc(31646); //@line 109 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 __ZN12_GLOBAL__N_1L16register_integerImEEvPKc(31651); //@line 110 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 __ZN12_GLOBAL__N_1L14register_floatIfEEvPKc(31665); //@line 112 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 __ZN12_GLOBAL__N_1L14register_floatIdEEvPKc(31671); //@line 113 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 $4 = (__ZN10emscripten8internal6TypeIDINSt3__212basic_stringIcNS2_11char_traitsIcEENS2_9allocatorIcEEEEE3getEv()|0); //@line 115 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 __embind_register_std_string(($4|0),(31678|0)); //@line 115 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 $5 = (__ZN10emscripten8internal6TypeIDINSt3__212basic_stringIhNS2_11char_traitsIhEENS2_9allocatorIhEEEEE3getEv()|0); //@line 116 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 __embind_register_std_string(($5|0),(31690|0)); //@line 116 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 $6 = (__ZN10emscripten8internal6TypeIDINSt3__212basic_stringIwNS2_11char_traitsIwEENS2_9allocatorIwEEEEE3getEv()|0); //@line 117 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 __embind_register_std_wstring(($6|0),4,(31723|0)); //@line 117 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 $7 = (__ZN10emscripten8internal6TypeIDINS_3valEE3getEv()|0); //@line 118 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 __embind_register_emval(($7|0),(31736|0)); //@line 118 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 __ZN12_GLOBAL__N_1L20register_memory_viewIcEEvPKc(31752); //@line 126 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 __ZN12_GLOBAL__N_1L20register_memory_viewIaEEvPKc(31782); //@line 127 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 __ZN12_GLOBAL__N_1L20register_memory_viewIhEEvPKc(31819); //@line 128 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 __ZN12_GLOBAL__N_1L20register_memory_viewIsEEvPKc(31858); //@line 130 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 __ZN12_GLOBAL__N_1L20register_memory_viewItEEvPKc(31889); //@line 131 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 __ZN12_GLOBAL__N_1L20register_memory_viewIiEEvPKc(31929); //@line 132 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 __ZN12_GLOBAL__N_1L20register_memory_viewIjEEvPKc(31958); //@line 133 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 __ZN12_GLOBAL__N_1L20register_memory_viewIlEEvPKc(31996); //@line 134 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 __ZN12_GLOBAL__N_1L20register_memory_viewImEEvPKc(32026); //@line 135 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 __ZN12_GLOBAL__N_1L20register_memory_viewIaEEvPKc(32065); //@line 137 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 __ZN12_GLOBAL__N_1L20register_memory_viewIhEEvPKc(32097); //@line 138 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 __ZN12_GLOBAL__N_1L20register_memory_viewIsEEvPKc(32130); //@line 139 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 __ZN12_GLOBAL__N_1L20register_memory_viewItEEvPKc(32163); //@line 140 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 __ZN12_GLOBAL__N_1L20register_memory_viewIiEEvPKc(32197); //@line 141 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 __ZN12_GLOBAL__N_1L20register_memory_viewIjEEvPKc(32230); //@line 142 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 __ZN12_GLOBAL__N_1L20register_memory_viewIfEEvPKc(32264); //@line 144 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 __ZN12_GLOBAL__N_1L20register_memory_viewIdEEvPKc(32295); //@line 145 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 __ZN12_GLOBAL__N_1L20register_memory_viewIeEEvPKc(32327); //@line 147 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 STACKTOP = sp;return; //@line 149 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
}
function __ZN10emscripten8internal6TypeIDIvE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDIvE3getEv()|0); //@line 98 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 return ($0|0); //@line 98 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal6TypeIDIbE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDIbE3getEv()|0); //@line 98 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 return ($0|0); //@line 98 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN12_GLOBAL__N_1L16register_integerIcEEvPKc($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal6TypeIDIcE3getEv()|0); //@line 51 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 $3 = $1; //@line 51 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 $4 = -128 << 24 >> 24; //@line 51 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 $5 = 127 << 24 >> 24; //@line 51 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 __embind_register_integer(($2|0),($3|0),1,($4|0),($5|0)); //@line 51 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 STACKTOP = sp;return; //@line 52 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
}
function __ZN12_GLOBAL__N_1L16register_integerIaEEvPKc($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal6TypeIDIaE3getEv()|0); //@line 51 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 $3 = $1; //@line 51 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 $4 = -128 << 24 >> 24; //@line 51 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 $5 = 127 << 24 >> 24; //@line 51 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 __embind_register_integer(($2|0),($3|0),1,($4|0),($5|0)); //@line 51 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 STACKTOP = sp;return; //@line 52 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
}
function __ZN12_GLOBAL__N_1L16register_integerIhEEvPKc($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal6TypeIDIhE3getEv()|0); //@line 51 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 $3 = $1; //@line 51 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 $4 = 0; //@line 51 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 $5 = 255; //@line 51 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 __embind_register_integer(($2|0),($3|0),1,($4|0),($5|0)); //@line 51 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 STACKTOP = sp;return; //@line 52 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
}
function __ZN12_GLOBAL__N_1L16register_integerIsEEvPKc($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal6TypeIDIsE3getEv()|0); //@line 51 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 $3 = $1; //@line 51 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 $4 = -32768 << 16 >> 16; //@line 51 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 $5 = 32767 << 16 >> 16; //@line 51 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 __embind_register_integer(($2|0),($3|0),2,($4|0),($5|0)); //@line 51 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 STACKTOP = sp;return; //@line 52 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
}
function __ZN12_GLOBAL__N_1L16register_integerItEEvPKc($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal6TypeIDItE3getEv()|0); //@line 51 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 $3 = $1; //@line 51 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 $4 = 0; //@line 51 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 $5 = 65535; //@line 51 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 __embind_register_integer(($2|0),($3|0),2,($4|0),($5|0)); //@line 51 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 STACKTOP = sp;return; //@line 52 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
}
function __ZN12_GLOBAL__N_1L16register_integerIiEEvPKc($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal6TypeIDIiE3getEv()|0); //@line 51 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 $3 = $1; //@line 51 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 __embind_register_integer(($2|0),($3|0),4,-2147483648,2147483647); //@line 51 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 STACKTOP = sp;return; //@line 52 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
}
function __ZN12_GLOBAL__N_1L16register_integerIjEEvPKc($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal6TypeIDIjE3getEv()|0); //@line 51 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 $3 = $1; //@line 51 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 __embind_register_integer(($2|0),($3|0),4,0,-1); //@line 51 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 STACKTOP = sp;return; //@line 52 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
}
function __ZN12_GLOBAL__N_1L16register_integerIlEEvPKc($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal6TypeIDIlE3getEv()|0); //@line 51 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 $3 = $1; //@line 51 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 __embind_register_integer(($2|0),($3|0),4,-2147483648,2147483647); //@line 51 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 STACKTOP = sp;return; //@line 52 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
}
function __ZN12_GLOBAL__N_1L16register_integerImEEvPKc($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal6TypeIDImE3getEv()|0); //@line 51 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 $3 = $1; //@line 51 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 __embind_register_integer(($2|0),($3|0),4,0,-1); //@line 51 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 STACKTOP = sp;return; //@line 52 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
}
function __ZN12_GLOBAL__N_1L14register_floatIfEEvPKc($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal6TypeIDIfE3getEv()|0); //@line 57 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 $3 = $1; //@line 57 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 __embind_register_float(($2|0),($3|0),4); //@line 57 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 STACKTOP = sp;return; //@line 58 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
}
function __ZN12_GLOBAL__N_1L14register_floatIdEEvPKc($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal6TypeIDIdE3getEv()|0); //@line 57 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 $3 = $1; //@line 57 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 __embind_register_float(($2|0),($3|0),8); //@line 57 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 STACKTOP = sp;return; //@line 58 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
}
function __ZN10emscripten8internal6TypeIDINSt3__212basic_stringIcNS2_11char_traitsIcEENS2_9allocatorIcEEEEE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDINSt3__212basic_stringIcNS2_11char_traitsIcEENS2_9allocatorIcEEEEE3getEv()|0); //@line 98 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 return ($0|0); //@line 98 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal6TypeIDINSt3__212basic_stringIhNS2_11char_traitsIhEENS2_9allocatorIhEEEEE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDINSt3__212basic_stringIhNS2_11char_traitsIhEENS2_9allocatorIhEEEEE3getEv()|0); //@line 98 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 return ($0|0); //@line 98 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal6TypeIDINSt3__212basic_stringIwNS2_11char_traitsIwEENS2_9allocatorIwEEEEE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDINSt3__212basic_stringIwNS2_11char_traitsIwEENS2_9allocatorIwEEEEE3getEv()|0); //@line 98 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 return ($0|0); //@line 98 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal6TypeIDINS_3valEE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDINS_3valEE3getEv()|0); //@line 98 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 return ($0|0); //@line 98 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN12_GLOBAL__N_1L20register_memory_viewIcEEvPKc($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal6TypeIDINS_11memory_viewIcEEE3getEv()|0); //@line 91 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 $3 = (__ZN12_GLOBAL__N_118getTypedArrayIndexIcEENS_15TypedArrayIndexEv()|0); //@line 91 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 $4 = $1; //@line 91 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 __embind_register_memory_view(($2|0),($3|0),($4|0)); //@line 91 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 STACKTOP = sp;return; //@line 92 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
}
function __ZN12_GLOBAL__N_1L20register_memory_viewIaEEvPKc($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal6TypeIDINS_11memory_viewIaEEE3getEv()|0); //@line 91 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 $3 = (__ZN12_GLOBAL__N_118getTypedArrayIndexIaEENS_15TypedArrayIndexEv()|0); //@line 91 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 $4 = $1; //@line 91 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 __embind_register_memory_view(($2|0),($3|0),($4|0)); //@line 91 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 STACKTOP = sp;return; //@line 92 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
}
function __ZN12_GLOBAL__N_1L20register_memory_viewIhEEvPKc($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal6TypeIDINS_11memory_viewIhEEE3getEv()|0); //@line 91 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 $3 = (__ZN12_GLOBAL__N_118getTypedArrayIndexIhEENS_15TypedArrayIndexEv()|0); //@line 91 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 $4 = $1; //@line 91 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 __embind_register_memory_view(($2|0),($3|0),($4|0)); //@line 91 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 STACKTOP = sp;return; //@line 92 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
}
function __ZN12_GLOBAL__N_1L20register_memory_viewIsEEvPKc($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal6TypeIDINS_11memory_viewIsEEE3getEv()|0); //@line 91 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 $3 = (__ZN12_GLOBAL__N_118getTypedArrayIndexIsEENS_15TypedArrayIndexEv()|0); //@line 91 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 $4 = $1; //@line 91 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 __embind_register_memory_view(($2|0),($3|0),($4|0)); //@line 91 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 STACKTOP = sp;return; //@line 92 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
}
function __ZN12_GLOBAL__N_1L20register_memory_viewItEEvPKc($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal6TypeIDINS_11memory_viewItEEE3getEv()|0); //@line 91 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 $3 = (__ZN12_GLOBAL__N_118getTypedArrayIndexItEENS_15TypedArrayIndexEv()|0); //@line 91 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 $4 = $1; //@line 91 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 __embind_register_memory_view(($2|0),($3|0),($4|0)); //@line 91 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 STACKTOP = sp;return; //@line 92 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
}
function __ZN12_GLOBAL__N_1L20register_memory_viewIiEEvPKc($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal6TypeIDINS_11memory_viewIiEEE3getEv()|0); //@line 91 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 $3 = (__ZN12_GLOBAL__N_118getTypedArrayIndexIiEENS_15TypedArrayIndexEv()|0); //@line 91 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 $4 = $1; //@line 91 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 __embind_register_memory_view(($2|0),($3|0),($4|0)); //@line 91 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 STACKTOP = sp;return; //@line 92 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
}
function __ZN12_GLOBAL__N_1L20register_memory_viewIjEEvPKc($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal6TypeIDINS_11memory_viewIjEEE3getEv()|0); //@line 91 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 $3 = (__ZN12_GLOBAL__N_118getTypedArrayIndexIjEENS_15TypedArrayIndexEv()|0); //@line 91 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 $4 = $1; //@line 91 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 __embind_register_memory_view(($2|0),($3|0),($4|0)); //@line 91 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 STACKTOP = sp;return; //@line 92 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
}
function __ZN12_GLOBAL__N_1L20register_memory_viewIlEEvPKc($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal6TypeIDINS_11memory_viewIlEEE3getEv()|0); //@line 91 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 $3 = (__ZN12_GLOBAL__N_118getTypedArrayIndexIlEENS_15TypedArrayIndexEv()|0); //@line 91 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 $4 = $1; //@line 91 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 __embind_register_memory_view(($2|0),($3|0),($4|0)); //@line 91 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 STACKTOP = sp;return; //@line 92 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
}
function __ZN12_GLOBAL__N_1L20register_memory_viewImEEvPKc($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal6TypeIDINS_11memory_viewImEEE3getEv()|0); //@line 91 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 $3 = (__ZN12_GLOBAL__N_118getTypedArrayIndexImEENS_15TypedArrayIndexEv()|0); //@line 91 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 $4 = $1; //@line 91 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 __embind_register_memory_view(($2|0),($3|0),($4|0)); //@line 91 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 STACKTOP = sp;return; //@line 92 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
}
function __ZN12_GLOBAL__N_1L20register_memory_viewIfEEvPKc($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal6TypeIDINS_11memory_viewIfEEE3getEv()|0); //@line 91 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 $3 = (__ZN12_GLOBAL__N_118getTypedArrayIndexIfEENS_15TypedArrayIndexEv()|0); //@line 91 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 $4 = $1; //@line 91 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 __embind_register_memory_view(($2|0),($3|0),($4|0)); //@line 91 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 STACKTOP = sp;return; //@line 92 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
}
function __ZN12_GLOBAL__N_1L20register_memory_viewIdEEvPKc($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal6TypeIDINS_11memory_viewIdEEE3getEv()|0); //@line 91 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 $3 = (__ZN12_GLOBAL__N_118getTypedArrayIndexIdEENS_15TypedArrayIndexEv()|0); //@line 91 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 $4 = $1; //@line 91 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 __embind_register_memory_view(($2|0),($3|0),($4|0)); //@line 91 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 STACKTOP = sp;return; //@line 92 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
}
function __ZN12_GLOBAL__N_1L20register_memory_viewIeEEvPKc($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = $0;
 $2 = (__ZN10emscripten8internal6TypeIDINS_11memory_viewIeEEE3getEv()|0); //@line 91 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 $3 = (__ZN12_GLOBAL__N_118getTypedArrayIndexIeEENS_15TypedArrayIndexEv()|0); //@line 91 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 $4 = $1; //@line 91 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 __embind_register_memory_view(($2|0),($3|0),($4|0)); //@line 91 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 STACKTOP = sp;return; //@line 92 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
}
function __ZN10emscripten8internal6TypeIDINS_11memory_viewIeEEE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDINS_11memory_viewIeEEE3getEv()|0); //@line 98 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 return ($0|0); //@line 98 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN12_GLOBAL__N_118getTypedArrayIndexIeEENS_15TypedArrayIndexEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 7; //@line 77 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
}
function __ZN10emscripten8internal11LightTypeIDINS_11memory_viewIeEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (296|0); //@line 62 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal6TypeIDINS_11memory_viewIdEEE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDINS_11memory_viewIdEEE3getEv()|0); //@line 98 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 return ($0|0); //@line 98 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN12_GLOBAL__N_118getTypedArrayIndexIdEENS_15TypedArrayIndexEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 7; //@line 77 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
}
function __ZN10emscripten8internal11LightTypeIDINS_11memory_viewIdEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (304|0); //@line 62 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal6TypeIDINS_11memory_viewIfEEE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDINS_11memory_viewIfEEE3getEv()|0); //@line 98 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 return ($0|0); //@line 98 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN12_GLOBAL__N_118getTypedArrayIndexIfEENS_15TypedArrayIndexEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 6; //@line 77 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
}
function __ZN10emscripten8internal11LightTypeIDINS_11memory_viewIfEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (312|0); //@line 62 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal6TypeIDINS_11memory_viewImEEE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDINS_11memory_viewImEEE3getEv()|0); //@line 98 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 return ($0|0); //@line 98 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN12_GLOBAL__N_118getTypedArrayIndexImEENS_15TypedArrayIndexEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 5; //@line 77 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
}
function __ZN10emscripten8internal11LightTypeIDINS_11memory_viewImEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (320|0); //@line 62 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal6TypeIDINS_11memory_viewIlEEE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDINS_11memory_viewIlEEE3getEv()|0); //@line 98 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 return ($0|0); //@line 98 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN12_GLOBAL__N_118getTypedArrayIndexIlEENS_15TypedArrayIndexEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 4; //@line 77 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
}
function __ZN10emscripten8internal11LightTypeIDINS_11memory_viewIlEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (328|0); //@line 62 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal6TypeIDINS_11memory_viewIjEEE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDINS_11memory_viewIjEEE3getEv()|0); //@line 98 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 return ($0|0); //@line 98 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN12_GLOBAL__N_118getTypedArrayIndexIjEENS_15TypedArrayIndexEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 5; //@line 77 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
}
function __ZN10emscripten8internal11LightTypeIDINS_11memory_viewIjEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (336|0); //@line 62 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal6TypeIDINS_11memory_viewIiEEE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDINS_11memory_viewIiEEE3getEv()|0); //@line 98 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 return ($0|0); //@line 98 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN12_GLOBAL__N_118getTypedArrayIndexIiEENS_15TypedArrayIndexEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 4; //@line 77 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
}
function __ZN10emscripten8internal11LightTypeIDINS_11memory_viewIiEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (344|0); //@line 62 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal6TypeIDINS_11memory_viewItEEE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDINS_11memory_viewItEEE3getEv()|0); //@line 98 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 return ($0|0); //@line 98 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN12_GLOBAL__N_118getTypedArrayIndexItEENS_15TypedArrayIndexEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 3; //@line 77 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
}
function __ZN10emscripten8internal11LightTypeIDINS_11memory_viewItEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (352|0); //@line 62 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal6TypeIDINS_11memory_viewIsEEE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDINS_11memory_viewIsEEE3getEv()|0); //@line 98 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 return ($0|0); //@line 98 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN12_GLOBAL__N_118getTypedArrayIndexIsEENS_15TypedArrayIndexEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 2; //@line 77 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
}
function __ZN10emscripten8internal11LightTypeIDINS_11memory_viewIsEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (360|0); //@line 62 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal6TypeIDINS_11memory_viewIhEEE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDINS_11memory_viewIhEEE3getEv()|0); //@line 98 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 return ($0|0); //@line 98 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN12_GLOBAL__N_118getTypedArrayIndexIhEENS_15TypedArrayIndexEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 1; //@line 77 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
}
function __ZN10emscripten8internal11LightTypeIDINS_11memory_viewIhEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (368|0); //@line 62 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal6TypeIDINS_11memory_viewIaEEE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDINS_11memory_viewIaEEE3getEv()|0); //@line 98 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 return ($0|0); //@line 98 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN12_GLOBAL__N_118getTypedArrayIndexIaEENS_15TypedArrayIndexEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 0; //@line 77 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
}
function __ZN10emscripten8internal11LightTypeIDINS_11memory_viewIaEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (376|0); //@line 62 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal6TypeIDINS_11memory_viewIcEEE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDINS_11memory_viewIcEEE3getEv()|0); //@line 98 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 return ($0|0); //@line 98 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN12_GLOBAL__N_118getTypedArrayIndexIcEENS_15TypedArrayIndexEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 0; //@line 77 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
}
function __ZN10emscripten8internal11LightTypeIDINS_11memory_viewIcEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (384|0); //@line 62 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal11LightTypeIDINS_3valEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (392|0); //@line 62 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal11LightTypeIDINSt3__212basic_stringIwNS2_11char_traitsIwEENS2_9allocatorIwEEEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (400|0); //@line 62 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal11LightTypeIDINSt3__212basic_stringIhNS2_11char_traitsIhEENS2_9allocatorIhEEEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (432|0); //@line 62 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal11LightTypeIDINSt3__212basic_stringIcNS2_11char_traitsIcEENS2_9allocatorIcEEEEE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (456|0); //@line 62 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal6TypeIDIdE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDIdE3getEv()|0); //@line 98 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 return ($0|0); //@line 98 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal11LightTypeIDIdE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (712|0); //@line 62 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal6TypeIDIfE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDIfE3getEv()|0); //@line 98 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 return ($0|0); //@line 98 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal11LightTypeIDIfE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (704|0); //@line 62 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal6TypeIDImE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDImE3getEv()|0); //@line 98 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 return ($0|0); //@line 98 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal11LightTypeIDImE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (696|0); //@line 62 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal6TypeIDIlE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDIlE3getEv()|0); //@line 98 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 return ($0|0); //@line 98 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal11LightTypeIDIlE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (688|0); //@line 62 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal6TypeIDIiE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDIiE3getEv()|0); //@line 98 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 return ($0|0); //@line 98 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal11LightTypeIDIiE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (672|0); //@line 62 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal6TypeIDItE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDItE3getEv()|0); //@line 98 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 return ($0|0); //@line 98 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal11LightTypeIDItE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (664|0); //@line 62 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal6TypeIDIsE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDIsE3getEv()|0); //@line 98 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 return ($0|0); //@line 98 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal11LightTypeIDIsE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (656|0); //@line 62 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal6TypeIDIhE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDIhE3getEv()|0); //@line 98 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 return ($0|0); //@line 98 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal11LightTypeIDIhE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (640|0); //@line 62 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal6TypeIDIaE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDIaE3getEv()|0); //@line 98 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 return ($0|0); //@line 98 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal11LightTypeIDIaE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (648|0); //@line 62 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal6TypeIDIcE3getEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN10emscripten8internal11LightTypeIDIcE3getEv()|0); //@line 98 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
 return ($0|0); //@line 98 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal11LightTypeIDIcE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (632|0); //@line 62 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal11LightTypeIDIbE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (624|0); //@line 62 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function __ZN10emscripten8internal11LightTypeIDIvE3getEv() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (608|0); //@line 62 "d:\emsdk\emscripten\1.37.35\system\include\emscripten/wire.h"
}
function ___getTypeName($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = $0;
 $3 = $2; //@line 37 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 $1 = $3;
 $4 = $1;
 $5 = ((($4)) + 4|0); //@line 152 "d:\emsdk\emscripten\1.37.35\system\include\libcxx\typeinfo"
 $6 = HEAP32[$5>>2]|0; //@line 152 "d:\emsdk\emscripten\1.37.35\system\include\libcxx\typeinfo"
 $7 = (___strdup($6)|0); //@line 37 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
 STACKTOP = sp;return ($7|0); //@line 37 "d:\emsdk\emscripten\1.37.35\system\lib\embind\bind.cpp"
}
function _malloc($0) {
 $0 = $0|0;
 var $$$0192$i = 0, $$$0193$i = 0, $$$4236$i = 0, $$$4351$i = 0, $$$i = 0, $$0 = 0, $$0$i$i = 0, $$0$i$i$i = 0, $$0$i17$i = 0, $$0189$i = 0, $$0192$lcssa$i = 0, $$01926$i = 0, $$0193$lcssa$i = 0, $$01935$i = 0, $$0197 = 0, $$0199 = 0, $$0206$i$i = 0, $$0207$i$i = 0, $$0211$i$i = 0, $$0212$i$i = 0;
 var $$024367$i = 0, $$0287$i$i = 0, $$0288$i$i = 0, $$0289$i$i = 0, $$0295$i$i = 0, $$0296$i$i = 0, $$0342$i = 0, $$0344$i = 0, $$0345$i = 0, $$0347$i = 0, $$0353$i = 0, $$0358$i = 0, $$0359$$i = 0, $$0359$i = 0, $$0361$i = 0, $$0362$i = 0, $$0368$i = 0, $$1196$i = 0, $$1198$i = 0, $$124466$i = 0;
 var $$1291$i$i = 0, $$1293$i$i = 0, $$1343$i = 0, $$1348$i = 0, $$1363$i = 0, $$1370$i = 0, $$1374$i = 0, $$2234243136$i = 0, $$2247$ph$i = 0, $$2253$ph$i = 0, $$2355$i = 0, $$3$i = 0, $$3$i$i = 0, $$3$i203 = 0, $$3350$i = 0, $$3372$i = 0, $$4$lcssa$i = 0, $$4$ph$i = 0, $$414$i = 0, $$4236$i = 0;
 var $$4351$lcssa$i = 0, $$435113$i = 0, $$4357$$4$i = 0, $$4357$ph$i = 0, $$435712$i = 0, $$723947$i = 0, $$748$i = 0, $$pre = 0, $$pre$i = 0, $$pre$i$i = 0, $$pre$i18$i = 0, $$pre$i210 = 0, $$pre$i212 = 0, $$pre$phi$i$iZ2D = 0, $$pre$phi$i19$iZ2D = 0, $$pre$phi$i211Z2D = 0, $$pre$phi$iZ2D = 0, $$pre$phi11$i$iZ2D = 0, $$pre$phiZ2D = 0, $$pre10$i$i = 0;
 var $$sink1$i = 0, $$sink1$i$i = 0, $$sink14$i = 0, $$sink2$i = 0, $$sink2$i205 = 0, $$sink3$i = 0, $1 = 0, $10 = 0, $100 = 0, $1000 = 0, $1001 = 0, $1002 = 0, $1003 = 0, $1004 = 0, $1005 = 0, $1006 = 0, $1007 = 0, $1008 = 0, $1009 = 0, $101 = 0;
 var $1010 = 0, $1011 = 0, $1012 = 0, $1013 = 0, $1014 = 0, $1015 = 0, $1016 = 0, $1017 = 0, $1018 = 0, $1019 = 0, $102 = 0, $1020 = 0, $1021 = 0, $1022 = 0, $1023 = 0, $1024 = 0, $1025 = 0, $1026 = 0, $1027 = 0, $1028 = 0;
 var $1029 = 0, $103 = 0, $1030 = 0, $1031 = 0, $1032 = 0, $1033 = 0, $1034 = 0, $1035 = 0, $1036 = 0, $1037 = 0, $1038 = 0, $1039 = 0, $104 = 0, $1040 = 0, $1041 = 0, $1042 = 0, $1043 = 0, $1044 = 0, $1045 = 0, $1046 = 0;
 var $1047 = 0, $1048 = 0, $1049 = 0, $105 = 0, $1050 = 0, $1051 = 0, $1052 = 0, $1053 = 0, $1054 = 0, $1055 = 0, $1056 = 0, $1057 = 0, $1058 = 0, $1059 = 0, $106 = 0, $1060 = 0, $1061 = 0, $1062 = 0, $107 = 0, $108 = 0;
 var $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0;
 var $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0;
 var $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0;
 var $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0;
 var $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0, $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0;
 var $2 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0, $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0;
 var $217 = 0, $218 = 0, $219 = 0, $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0, $224 = 0, $225 = 0, $226 = 0, $227 = 0, $228 = 0, $229 = 0, $23 = 0, $230 = 0, $231 = 0, $232 = 0, $233 = 0, $234 = 0;
 var $235 = 0, $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0, $242 = 0, $243 = 0, $244 = 0, $245 = 0, $246 = 0, $247 = 0, $248 = 0, $249 = 0, $25 = 0, $250 = 0, $251 = 0, $252 = 0;
 var $253 = 0, $254 = 0, $255 = 0, $256 = 0, $257 = 0, $258 = 0, $259 = 0, $26 = 0, $260 = 0, $261 = 0, $262 = 0, $263 = 0, $264 = 0, $265 = 0, $266 = 0, $267 = 0, $268 = 0, $269 = 0, $27 = 0, $270 = 0;
 var $271 = 0, $272 = 0, $273 = 0, $274 = 0, $275 = 0, $276 = 0, $277 = 0, $278 = 0, $279 = 0, $28 = 0, $280 = 0, $281 = 0, $282 = 0, $283 = 0, $284 = 0, $285 = 0, $286 = 0, $287 = 0, $288 = 0, $289 = 0;
 var $29 = 0, $290 = 0, $291 = 0, $292 = 0, $293 = 0, $294 = 0, $295 = 0, $296 = 0, $297 = 0, $298 = 0, $299 = 0, $3 = 0, $30 = 0, $300 = 0, $301 = 0, $302 = 0, $303 = 0, $304 = 0, $305 = 0, $306 = 0;
 var $307 = 0, $308 = 0, $309 = 0, $31 = 0, $310 = 0, $311 = 0, $312 = 0, $313 = 0, $314 = 0, $315 = 0, $316 = 0, $317 = 0, $318 = 0, $319 = 0, $32 = 0, $320 = 0, $321 = 0, $322 = 0, $323 = 0, $324 = 0;
 var $325 = 0, $326 = 0, $327 = 0, $328 = 0, $329 = 0, $33 = 0, $330 = 0, $331 = 0, $332 = 0, $333 = 0, $334 = 0, $335 = 0, $336 = 0, $337 = 0, $338 = 0, $339 = 0, $34 = 0, $340 = 0, $341 = 0, $342 = 0;
 var $343 = 0, $344 = 0, $345 = 0, $346 = 0, $347 = 0, $348 = 0, $349 = 0, $35 = 0, $350 = 0, $351 = 0, $352 = 0, $353 = 0, $354 = 0, $355 = 0, $356 = 0, $357 = 0, $358 = 0, $359 = 0, $36 = 0, $360 = 0;
 var $361 = 0, $362 = 0, $363 = 0, $364 = 0, $365 = 0, $366 = 0, $367 = 0, $368 = 0, $369 = 0, $37 = 0, $370 = 0, $371 = 0, $372 = 0, $373 = 0, $374 = 0, $375 = 0, $376 = 0, $377 = 0, $378 = 0, $379 = 0;
 var $38 = 0, $380 = 0, $381 = 0, $382 = 0, $383 = 0, $384 = 0, $385 = 0, $386 = 0, $387 = 0, $388 = 0, $389 = 0, $39 = 0, $390 = 0, $391 = 0, $392 = 0, $393 = 0, $394 = 0, $395 = 0, $396 = 0, $397 = 0;
 var $398 = 0, $399 = 0, $4 = 0, $40 = 0, $400 = 0, $401 = 0, $402 = 0, $403 = 0, $404 = 0, $405 = 0, $406 = 0, $407 = 0, $408 = 0, $409 = 0, $41 = 0, $410 = 0, $411 = 0, $412 = 0, $413 = 0, $414 = 0;
 var $415 = 0, $416 = 0, $417 = 0, $418 = 0, $419 = 0, $42 = 0, $420 = 0, $421 = 0, $422 = 0, $423 = 0, $424 = 0, $425 = 0, $426 = 0, $427 = 0, $428 = 0, $429 = 0, $43 = 0, $430 = 0, $431 = 0, $432 = 0;
 var $433 = 0, $434 = 0, $435 = 0, $436 = 0, $437 = 0, $438 = 0, $439 = 0, $44 = 0, $440 = 0, $441 = 0, $442 = 0, $443 = 0, $444 = 0, $445 = 0, $446 = 0, $447 = 0, $448 = 0, $449 = 0, $45 = 0, $450 = 0;
 var $451 = 0, $452 = 0, $453 = 0, $454 = 0, $455 = 0, $456 = 0, $457 = 0, $458 = 0, $459 = 0, $46 = 0, $460 = 0, $461 = 0, $462 = 0, $463 = 0, $464 = 0, $465 = 0, $466 = 0, $467 = 0, $468 = 0, $469 = 0;
 var $47 = 0, $470 = 0, $471 = 0, $472 = 0, $473 = 0, $474 = 0, $475 = 0, $476 = 0, $477 = 0, $478 = 0, $479 = 0, $48 = 0, $480 = 0, $481 = 0, $482 = 0, $483 = 0, $484 = 0, $485 = 0, $486 = 0, $487 = 0;
 var $488 = 0, $489 = 0, $49 = 0, $490 = 0, $491 = 0, $492 = 0, $493 = 0, $494 = 0, $495 = 0, $496 = 0, $497 = 0, $498 = 0, $499 = 0, $5 = 0, $50 = 0, $500 = 0, $501 = 0, $502 = 0, $503 = 0, $504 = 0;
 var $505 = 0, $506 = 0, $507 = 0, $508 = 0, $509 = 0, $51 = 0, $510 = 0, $511 = 0, $512 = 0, $513 = 0, $514 = 0, $515 = 0, $516 = 0, $517 = 0, $518 = 0, $519 = 0, $52 = 0, $520 = 0, $521 = 0, $522 = 0;
 var $523 = 0, $524 = 0, $525 = 0, $526 = 0, $527 = 0, $528 = 0, $529 = 0, $53 = 0, $530 = 0, $531 = 0, $532 = 0, $533 = 0, $534 = 0, $535 = 0, $536 = 0, $537 = 0, $538 = 0, $539 = 0, $54 = 0, $540 = 0;
 var $541 = 0, $542 = 0, $543 = 0, $544 = 0, $545 = 0, $546 = 0, $547 = 0, $548 = 0, $549 = 0, $55 = 0, $550 = 0, $551 = 0, $552 = 0, $553 = 0, $554 = 0, $555 = 0, $556 = 0, $557 = 0, $558 = 0, $559 = 0;
 var $56 = 0, $560 = 0, $561 = 0, $562 = 0, $563 = 0, $564 = 0, $565 = 0, $566 = 0, $567 = 0, $568 = 0, $569 = 0, $57 = 0, $570 = 0, $571 = 0, $572 = 0, $573 = 0, $574 = 0, $575 = 0, $576 = 0, $577 = 0;
 var $578 = 0, $579 = 0, $58 = 0, $580 = 0, $581 = 0, $582 = 0, $583 = 0, $584 = 0, $585 = 0, $586 = 0, $587 = 0, $588 = 0, $589 = 0, $59 = 0, $590 = 0, $591 = 0, $592 = 0, $593 = 0, $594 = 0, $595 = 0;
 var $596 = 0, $597 = 0, $598 = 0, $599 = 0, $6 = 0, $60 = 0, $600 = 0, $601 = 0, $602 = 0, $603 = 0, $604 = 0, $605 = 0, $606 = 0, $607 = 0, $608 = 0, $609 = 0, $61 = 0, $610 = 0, $611 = 0, $612 = 0;
 var $613 = 0, $614 = 0, $615 = 0, $616 = 0, $617 = 0, $618 = 0, $619 = 0, $62 = 0, $620 = 0, $621 = 0, $622 = 0, $623 = 0, $624 = 0, $625 = 0, $626 = 0, $627 = 0, $628 = 0, $629 = 0, $63 = 0, $630 = 0;
 var $631 = 0, $632 = 0, $633 = 0, $634 = 0, $635 = 0, $636 = 0, $637 = 0, $638 = 0, $639 = 0, $64 = 0, $640 = 0, $641 = 0, $642 = 0, $643 = 0, $644 = 0, $645 = 0, $646 = 0, $647 = 0, $648 = 0, $649 = 0;
 var $65 = 0, $650 = 0, $651 = 0, $652 = 0, $653 = 0, $654 = 0, $655 = 0, $656 = 0, $657 = 0, $658 = 0, $659 = 0, $66 = 0, $660 = 0, $661 = 0, $662 = 0, $663 = 0, $664 = 0, $665 = 0, $666 = 0, $667 = 0;
 var $668 = 0, $669 = 0, $67 = 0, $670 = 0, $671 = 0, $672 = 0, $673 = 0, $674 = 0, $675 = 0, $676 = 0, $677 = 0, $678 = 0, $679 = 0, $68 = 0, $680 = 0, $681 = 0, $682 = 0, $683 = 0, $684 = 0, $685 = 0;
 var $686 = 0, $687 = 0, $688 = 0, $689 = 0, $69 = 0, $690 = 0, $691 = 0, $692 = 0, $693 = 0, $694 = 0, $695 = 0, $696 = 0, $697 = 0, $698 = 0, $699 = 0, $7 = 0, $70 = 0, $700 = 0, $701 = 0, $702 = 0;
 var $703 = 0, $704 = 0, $705 = 0, $706 = 0, $707 = 0, $708 = 0, $709 = 0, $71 = 0, $710 = 0, $711 = 0, $712 = 0, $713 = 0, $714 = 0, $715 = 0, $716 = 0, $717 = 0, $718 = 0, $719 = 0, $72 = 0, $720 = 0;
 var $721 = 0, $722 = 0, $723 = 0, $724 = 0, $725 = 0, $726 = 0, $727 = 0, $728 = 0, $729 = 0, $73 = 0, $730 = 0, $731 = 0, $732 = 0, $733 = 0, $734 = 0, $735 = 0, $736 = 0, $737 = 0, $738 = 0, $739 = 0;
 var $74 = 0, $740 = 0, $741 = 0, $742 = 0, $743 = 0, $744 = 0, $745 = 0, $746 = 0, $747 = 0, $748 = 0, $749 = 0, $75 = 0, $750 = 0, $751 = 0, $752 = 0, $753 = 0, $754 = 0, $755 = 0, $756 = 0, $757 = 0;
 var $758 = 0, $759 = 0, $76 = 0, $760 = 0, $761 = 0, $762 = 0, $763 = 0, $764 = 0, $765 = 0, $766 = 0, $767 = 0, $768 = 0, $769 = 0, $77 = 0, $770 = 0, $771 = 0, $772 = 0, $773 = 0, $774 = 0, $775 = 0;
 var $776 = 0, $777 = 0, $778 = 0, $779 = 0, $78 = 0, $780 = 0, $781 = 0, $782 = 0, $783 = 0, $784 = 0, $785 = 0, $786 = 0, $787 = 0, $788 = 0, $789 = 0, $79 = 0, $790 = 0, $791 = 0, $792 = 0, $793 = 0;
 var $794 = 0, $795 = 0, $796 = 0, $797 = 0, $798 = 0, $799 = 0, $8 = 0, $80 = 0, $800 = 0, $801 = 0, $802 = 0, $803 = 0, $804 = 0, $805 = 0, $806 = 0, $807 = 0, $808 = 0, $809 = 0, $81 = 0, $810 = 0;
 var $811 = 0, $812 = 0, $813 = 0, $814 = 0, $815 = 0, $816 = 0, $817 = 0, $818 = 0, $819 = 0, $82 = 0, $820 = 0, $821 = 0, $822 = 0, $823 = 0, $824 = 0, $825 = 0, $826 = 0, $827 = 0, $828 = 0, $829 = 0;
 var $83 = 0, $830 = 0, $831 = 0, $832 = 0, $833 = 0, $834 = 0, $835 = 0, $836 = 0, $837 = 0, $838 = 0, $839 = 0, $84 = 0, $840 = 0, $841 = 0, $842 = 0, $843 = 0, $844 = 0, $845 = 0, $846 = 0, $847 = 0;
 var $848 = 0, $849 = 0, $85 = 0, $850 = 0, $851 = 0, $852 = 0, $853 = 0, $854 = 0, $855 = 0, $856 = 0, $857 = 0, $858 = 0, $859 = 0, $86 = 0, $860 = 0, $861 = 0, $862 = 0, $863 = 0, $864 = 0, $865 = 0;
 var $866 = 0, $867 = 0, $868 = 0, $869 = 0, $87 = 0, $870 = 0, $871 = 0, $872 = 0, $873 = 0, $874 = 0, $875 = 0, $876 = 0, $877 = 0, $878 = 0, $879 = 0, $88 = 0, $880 = 0, $881 = 0, $882 = 0, $883 = 0;
 var $884 = 0, $885 = 0, $886 = 0, $887 = 0, $888 = 0, $889 = 0, $89 = 0, $890 = 0, $891 = 0, $892 = 0, $893 = 0, $894 = 0, $895 = 0, $896 = 0, $897 = 0, $898 = 0, $899 = 0, $9 = 0, $90 = 0, $900 = 0;
 var $901 = 0, $902 = 0, $903 = 0, $904 = 0, $905 = 0, $906 = 0, $907 = 0, $908 = 0, $909 = 0, $91 = 0, $910 = 0, $911 = 0, $912 = 0, $913 = 0, $914 = 0, $915 = 0, $916 = 0, $917 = 0, $918 = 0, $919 = 0;
 var $92 = 0, $920 = 0, $921 = 0, $922 = 0, $923 = 0, $924 = 0, $925 = 0, $926 = 0, $927 = 0, $928 = 0, $929 = 0, $93 = 0, $930 = 0, $931 = 0, $932 = 0, $933 = 0, $934 = 0, $935 = 0, $936 = 0, $937 = 0;
 var $938 = 0, $939 = 0, $94 = 0, $940 = 0, $941 = 0, $942 = 0, $943 = 0, $944 = 0, $945 = 0, $946 = 0, $947 = 0, $948 = 0, $949 = 0, $95 = 0, $950 = 0, $951 = 0, $952 = 0, $953 = 0, $954 = 0, $955 = 0;
 var $956 = 0, $957 = 0, $958 = 0, $959 = 0, $96 = 0, $960 = 0, $961 = 0, $962 = 0, $963 = 0, $964 = 0, $965 = 0, $966 = 0, $967 = 0, $968 = 0, $969 = 0, $97 = 0, $970 = 0, $971 = 0, $972 = 0, $973 = 0;
 var $974 = 0, $975 = 0, $976 = 0, $977 = 0, $978 = 0, $979 = 0, $98 = 0, $980 = 0, $981 = 0, $982 = 0, $983 = 0, $984 = 0, $985 = 0, $986 = 0, $987 = 0, $988 = 0, $989 = 0, $99 = 0, $990 = 0, $991 = 0;
 var $992 = 0, $993 = 0, $994 = 0, $995 = 0, $996 = 0, $997 = 0, $998 = 0, $999 = 0, $cond$i = 0, $cond$i$i = 0, $cond$i209 = 0, $not$$i = 0, $not$7$i = 0, $or$cond$i = 0, $or$cond$i214 = 0, $or$cond1$i = 0, $or$cond10$i = 0, $or$cond11$i = 0, $or$cond11$not$i = 0, $or$cond12$i = 0;
 var $or$cond2$i = 0, $or$cond2$i215 = 0, $or$cond49$i = 0, $or$cond5$i = 0, $or$cond50$i = 0, $or$cond7$i = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = sp;
 $2 = ($0>>>0)<(245);
 do {
  if ($2) {
   $3 = ($0>>>0)<(11);
   $4 = (($0) + 11)|0;
   $5 = $4 & -8;
   $6 = $3 ? 16 : $5;
   $7 = $6 >>> 3;
   $8 = HEAP32[9125]|0;
   $9 = $8 >>> $7;
   $10 = $9 & 3;
   $11 = ($10|0)==(0);
   if (!($11)) {
    $12 = $9 & 1;
    $13 = $12 ^ 1;
    $14 = (($13) + ($7))|0;
    $15 = $14 << 1;
    $16 = (36540 + ($15<<2)|0);
    $17 = ((($16)) + 8|0);
    $18 = HEAP32[$17>>2]|0;
    $19 = ((($18)) + 8|0);
    $20 = HEAP32[$19>>2]|0;
    $21 = ($20|0)==($16|0);
    do {
     if ($21) {
      $22 = 1 << $14;
      $23 = $22 ^ -1;
      $24 = $8 & $23;
      HEAP32[9125] = $24;
     } else {
      $25 = HEAP32[(36516)>>2]|0;
      $26 = ($25>>>0)>($20>>>0);
      if ($26) {
       _abort();
       // unreachable;
      }
      $27 = ((($20)) + 12|0);
      $28 = HEAP32[$27>>2]|0;
      $29 = ($28|0)==($18|0);
      if ($29) {
       HEAP32[$27>>2] = $16;
       HEAP32[$17>>2] = $20;
       break;
      } else {
       _abort();
       // unreachable;
      }
     }
    } while(0);
    $30 = $14 << 3;
    $31 = $30 | 3;
    $32 = ((($18)) + 4|0);
    HEAP32[$32>>2] = $31;
    $33 = (($18) + ($30)|0);
    $34 = ((($33)) + 4|0);
    $35 = HEAP32[$34>>2]|0;
    $36 = $35 | 1;
    HEAP32[$34>>2] = $36;
    $$0 = $19;
    STACKTOP = sp;return ($$0|0);
   }
   $37 = HEAP32[(36508)>>2]|0;
   $38 = ($6>>>0)>($37>>>0);
   if ($38) {
    $39 = ($9|0)==(0);
    if (!($39)) {
     $40 = $9 << $7;
     $41 = 2 << $7;
     $42 = (0 - ($41))|0;
     $43 = $41 | $42;
     $44 = $40 & $43;
     $45 = (0 - ($44))|0;
     $46 = $44 & $45;
     $47 = (($46) + -1)|0;
     $48 = $47 >>> 12;
     $49 = $48 & 16;
     $50 = $47 >>> $49;
     $51 = $50 >>> 5;
     $52 = $51 & 8;
     $53 = $52 | $49;
     $54 = $50 >>> $52;
     $55 = $54 >>> 2;
     $56 = $55 & 4;
     $57 = $53 | $56;
     $58 = $54 >>> $56;
     $59 = $58 >>> 1;
     $60 = $59 & 2;
     $61 = $57 | $60;
     $62 = $58 >>> $60;
     $63 = $62 >>> 1;
     $64 = $63 & 1;
     $65 = $61 | $64;
     $66 = $62 >>> $64;
     $67 = (($65) + ($66))|0;
     $68 = $67 << 1;
     $69 = (36540 + ($68<<2)|0);
     $70 = ((($69)) + 8|0);
     $71 = HEAP32[$70>>2]|0;
     $72 = ((($71)) + 8|0);
     $73 = HEAP32[$72>>2]|0;
     $74 = ($73|0)==($69|0);
     do {
      if ($74) {
       $75 = 1 << $67;
       $76 = $75 ^ -1;
       $77 = $8 & $76;
       HEAP32[9125] = $77;
       $98 = $77;
      } else {
       $78 = HEAP32[(36516)>>2]|0;
       $79 = ($78>>>0)>($73>>>0);
       if ($79) {
        _abort();
        // unreachable;
       }
       $80 = ((($73)) + 12|0);
       $81 = HEAP32[$80>>2]|0;
       $82 = ($81|0)==($71|0);
       if ($82) {
        HEAP32[$80>>2] = $69;
        HEAP32[$70>>2] = $73;
        $98 = $8;
        break;
       } else {
        _abort();
        // unreachable;
       }
      }
     } while(0);
     $83 = $67 << 3;
     $84 = (($83) - ($6))|0;
     $85 = $6 | 3;
     $86 = ((($71)) + 4|0);
     HEAP32[$86>>2] = $85;
     $87 = (($71) + ($6)|0);
     $88 = $84 | 1;
     $89 = ((($87)) + 4|0);
     HEAP32[$89>>2] = $88;
     $90 = (($71) + ($83)|0);
     HEAP32[$90>>2] = $84;
     $91 = ($37|0)==(0);
     if (!($91)) {
      $92 = HEAP32[(36520)>>2]|0;
      $93 = $37 >>> 3;
      $94 = $93 << 1;
      $95 = (36540 + ($94<<2)|0);
      $96 = 1 << $93;
      $97 = $98 & $96;
      $99 = ($97|0)==(0);
      if ($99) {
       $100 = $98 | $96;
       HEAP32[9125] = $100;
       $$pre = ((($95)) + 8|0);
       $$0199 = $95;$$pre$phiZ2D = $$pre;
      } else {
       $101 = ((($95)) + 8|0);
       $102 = HEAP32[$101>>2]|0;
       $103 = HEAP32[(36516)>>2]|0;
       $104 = ($103>>>0)>($102>>>0);
       if ($104) {
        _abort();
        // unreachable;
       } else {
        $$0199 = $102;$$pre$phiZ2D = $101;
       }
      }
      HEAP32[$$pre$phiZ2D>>2] = $92;
      $105 = ((($$0199)) + 12|0);
      HEAP32[$105>>2] = $92;
      $106 = ((($92)) + 8|0);
      HEAP32[$106>>2] = $$0199;
      $107 = ((($92)) + 12|0);
      HEAP32[$107>>2] = $95;
     }
     HEAP32[(36508)>>2] = $84;
     HEAP32[(36520)>>2] = $87;
     $$0 = $72;
     STACKTOP = sp;return ($$0|0);
    }
    $108 = HEAP32[(36504)>>2]|0;
    $109 = ($108|0)==(0);
    if ($109) {
     $$0197 = $6;
    } else {
     $110 = (0 - ($108))|0;
     $111 = $108 & $110;
     $112 = (($111) + -1)|0;
     $113 = $112 >>> 12;
     $114 = $113 & 16;
     $115 = $112 >>> $114;
     $116 = $115 >>> 5;
     $117 = $116 & 8;
     $118 = $117 | $114;
     $119 = $115 >>> $117;
     $120 = $119 >>> 2;
     $121 = $120 & 4;
     $122 = $118 | $121;
     $123 = $119 >>> $121;
     $124 = $123 >>> 1;
     $125 = $124 & 2;
     $126 = $122 | $125;
     $127 = $123 >>> $125;
     $128 = $127 >>> 1;
     $129 = $128 & 1;
     $130 = $126 | $129;
     $131 = $127 >>> $129;
     $132 = (($130) + ($131))|0;
     $133 = (36804 + ($132<<2)|0);
     $134 = HEAP32[$133>>2]|0;
     $135 = ((($134)) + 4|0);
     $136 = HEAP32[$135>>2]|0;
     $137 = $136 & -8;
     $138 = (($137) - ($6))|0;
     $139 = ((($134)) + 16|0);
     $140 = HEAP32[$139>>2]|0;
     $141 = ($140|0)==(0|0);
     $$sink14$i = $141&1;
     $142 = (((($134)) + 16|0) + ($$sink14$i<<2)|0);
     $143 = HEAP32[$142>>2]|0;
     $144 = ($143|0)==(0|0);
     if ($144) {
      $$0192$lcssa$i = $134;$$0193$lcssa$i = $138;
     } else {
      $$01926$i = $134;$$01935$i = $138;$146 = $143;
      while(1) {
       $145 = ((($146)) + 4|0);
       $147 = HEAP32[$145>>2]|0;
       $148 = $147 & -8;
       $149 = (($148) - ($6))|0;
       $150 = ($149>>>0)<($$01935$i>>>0);
       $$$0193$i = $150 ? $149 : $$01935$i;
       $$$0192$i = $150 ? $146 : $$01926$i;
       $151 = ((($146)) + 16|0);
       $152 = HEAP32[$151>>2]|0;
       $153 = ($152|0)==(0|0);
       $$sink1$i = $153&1;
       $154 = (((($146)) + 16|0) + ($$sink1$i<<2)|0);
       $155 = HEAP32[$154>>2]|0;
       $156 = ($155|0)==(0|0);
       if ($156) {
        $$0192$lcssa$i = $$$0192$i;$$0193$lcssa$i = $$$0193$i;
        break;
       } else {
        $$01926$i = $$$0192$i;$$01935$i = $$$0193$i;$146 = $155;
       }
      }
     }
     $157 = HEAP32[(36516)>>2]|0;
     $158 = ($157>>>0)>($$0192$lcssa$i>>>0);
     if ($158) {
      _abort();
      // unreachable;
     }
     $159 = (($$0192$lcssa$i) + ($6)|0);
     $160 = ($159>>>0)>($$0192$lcssa$i>>>0);
     if (!($160)) {
      _abort();
      // unreachable;
     }
     $161 = ((($$0192$lcssa$i)) + 24|0);
     $162 = HEAP32[$161>>2]|0;
     $163 = ((($$0192$lcssa$i)) + 12|0);
     $164 = HEAP32[$163>>2]|0;
     $165 = ($164|0)==($$0192$lcssa$i|0);
     do {
      if ($165) {
       $175 = ((($$0192$lcssa$i)) + 20|0);
       $176 = HEAP32[$175>>2]|0;
       $177 = ($176|0)==(0|0);
       if ($177) {
        $178 = ((($$0192$lcssa$i)) + 16|0);
        $179 = HEAP32[$178>>2]|0;
        $180 = ($179|0)==(0|0);
        if ($180) {
         $$3$i = 0;
         break;
        } else {
         $$1196$i = $179;$$1198$i = $178;
        }
       } else {
        $$1196$i = $176;$$1198$i = $175;
       }
       while(1) {
        $181 = ((($$1196$i)) + 20|0);
        $182 = HEAP32[$181>>2]|0;
        $183 = ($182|0)==(0|0);
        if (!($183)) {
         $$1196$i = $182;$$1198$i = $181;
         continue;
        }
        $184 = ((($$1196$i)) + 16|0);
        $185 = HEAP32[$184>>2]|0;
        $186 = ($185|0)==(0|0);
        if ($186) {
         break;
        } else {
         $$1196$i = $185;$$1198$i = $184;
        }
       }
       $187 = ($157>>>0)>($$1198$i>>>0);
       if ($187) {
        _abort();
        // unreachable;
       } else {
        HEAP32[$$1198$i>>2] = 0;
        $$3$i = $$1196$i;
        break;
       }
      } else {
       $166 = ((($$0192$lcssa$i)) + 8|0);
       $167 = HEAP32[$166>>2]|0;
       $168 = ($157>>>0)>($167>>>0);
       if ($168) {
        _abort();
        // unreachable;
       }
       $169 = ((($167)) + 12|0);
       $170 = HEAP32[$169>>2]|0;
       $171 = ($170|0)==($$0192$lcssa$i|0);
       if (!($171)) {
        _abort();
        // unreachable;
       }
       $172 = ((($164)) + 8|0);
       $173 = HEAP32[$172>>2]|0;
       $174 = ($173|0)==($$0192$lcssa$i|0);
       if ($174) {
        HEAP32[$169>>2] = $164;
        HEAP32[$172>>2] = $167;
        $$3$i = $164;
        break;
       } else {
        _abort();
        // unreachable;
       }
      }
     } while(0);
     $188 = ($162|0)==(0|0);
     L73: do {
      if (!($188)) {
       $189 = ((($$0192$lcssa$i)) + 28|0);
       $190 = HEAP32[$189>>2]|0;
       $191 = (36804 + ($190<<2)|0);
       $192 = HEAP32[$191>>2]|0;
       $193 = ($$0192$lcssa$i|0)==($192|0);
       do {
        if ($193) {
         HEAP32[$191>>2] = $$3$i;
         $cond$i = ($$3$i|0)==(0|0);
         if ($cond$i) {
          $194 = 1 << $190;
          $195 = $194 ^ -1;
          $196 = $108 & $195;
          HEAP32[(36504)>>2] = $196;
          break L73;
         }
        } else {
         $197 = HEAP32[(36516)>>2]|0;
         $198 = ($197>>>0)>($162>>>0);
         if ($198) {
          _abort();
          // unreachable;
         } else {
          $199 = ((($162)) + 16|0);
          $200 = HEAP32[$199>>2]|0;
          $201 = ($200|0)!=($$0192$lcssa$i|0);
          $$sink2$i = $201&1;
          $202 = (((($162)) + 16|0) + ($$sink2$i<<2)|0);
          HEAP32[$202>>2] = $$3$i;
          $203 = ($$3$i|0)==(0|0);
          if ($203) {
           break L73;
          } else {
           break;
          }
         }
        }
       } while(0);
       $204 = HEAP32[(36516)>>2]|0;
       $205 = ($204>>>0)>($$3$i>>>0);
       if ($205) {
        _abort();
        // unreachable;
       }
       $206 = ((($$3$i)) + 24|0);
       HEAP32[$206>>2] = $162;
       $207 = ((($$0192$lcssa$i)) + 16|0);
       $208 = HEAP32[$207>>2]|0;
       $209 = ($208|0)==(0|0);
       do {
        if (!($209)) {
         $210 = ($204>>>0)>($208>>>0);
         if ($210) {
          _abort();
          // unreachable;
         } else {
          $211 = ((($$3$i)) + 16|0);
          HEAP32[$211>>2] = $208;
          $212 = ((($208)) + 24|0);
          HEAP32[$212>>2] = $$3$i;
          break;
         }
        }
       } while(0);
       $213 = ((($$0192$lcssa$i)) + 20|0);
       $214 = HEAP32[$213>>2]|0;
       $215 = ($214|0)==(0|0);
       if (!($215)) {
        $216 = HEAP32[(36516)>>2]|0;
        $217 = ($216>>>0)>($214>>>0);
        if ($217) {
         _abort();
         // unreachable;
        } else {
         $218 = ((($$3$i)) + 20|0);
         HEAP32[$218>>2] = $214;
         $219 = ((($214)) + 24|0);
         HEAP32[$219>>2] = $$3$i;
         break;
        }
       }
      }
     } while(0);
     $220 = ($$0193$lcssa$i>>>0)<(16);
     if ($220) {
      $221 = (($$0193$lcssa$i) + ($6))|0;
      $222 = $221 | 3;
      $223 = ((($$0192$lcssa$i)) + 4|0);
      HEAP32[$223>>2] = $222;
      $224 = (($$0192$lcssa$i) + ($221)|0);
      $225 = ((($224)) + 4|0);
      $226 = HEAP32[$225>>2]|0;
      $227 = $226 | 1;
      HEAP32[$225>>2] = $227;
     } else {
      $228 = $6 | 3;
      $229 = ((($$0192$lcssa$i)) + 4|0);
      HEAP32[$229>>2] = $228;
      $230 = $$0193$lcssa$i | 1;
      $231 = ((($159)) + 4|0);
      HEAP32[$231>>2] = $230;
      $232 = (($159) + ($$0193$lcssa$i)|0);
      HEAP32[$232>>2] = $$0193$lcssa$i;
      $233 = ($37|0)==(0);
      if (!($233)) {
       $234 = HEAP32[(36520)>>2]|0;
       $235 = $37 >>> 3;
       $236 = $235 << 1;
       $237 = (36540 + ($236<<2)|0);
       $238 = 1 << $235;
       $239 = $8 & $238;
       $240 = ($239|0)==(0);
       if ($240) {
        $241 = $8 | $238;
        HEAP32[9125] = $241;
        $$pre$i = ((($237)) + 8|0);
        $$0189$i = $237;$$pre$phi$iZ2D = $$pre$i;
       } else {
        $242 = ((($237)) + 8|0);
        $243 = HEAP32[$242>>2]|0;
        $244 = HEAP32[(36516)>>2]|0;
        $245 = ($244>>>0)>($243>>>0);
        if ($245) {
         _abort();
         // unreachable;
        } else {
         $$0189$i = $243;$$pre$phi$iZ2D = $242;
        }
       }
       HEAP32[$$pre$phi$iZ2D>>2] = $234;
       $246 = ((($$0189$i)) + 12|0);
       HEAP32[$246>>2] = $234;
       $247 = ((($234)) + 8|0);
       HEAP32[$247>>2] = $$0189$i;
       $248 = ((($234)) + 12|0);
       HEAP32[$248>>2] = $237;
      }
      HEAP32[(36508)>>2] = $$0193$lcssa$i;
      HEAP32[(36520)>>2] = $159;
     }
     $249 = ((($$0192$lcssa$i)) + 8|0);
     $$0 = $249;
     STACKTOP = sp;return ($$0|0);
    }
   } else {
    $$0197 = $6;
   }
  } else {
   $250 = ($0>>>0)>(4294967231);
   if ($250) {
    $$0197 = -1;
   } else {
    $251 = (($0) + 11)|0;
    $252 = $251 & -8;
    $253 = HEAP32[(36504)>>2]|0;
    $254 = ($253|0)==(0);
    if ($254) {
     $$0197 = $252;
    } else {
     $255 = (0 - ($252))|0;
     $256 = $251 >>> 8;
     $257 = ($256|0)==(0);
     if ($257) {
      $$0358$i = 0;
     } else {
      $258 = ($252>>>0)>(16777215);
      if ($258) {
       $$0358$i = 31;
      } else {
       $259 = (($256) + 1048320)|0;
       $260 = $259 >>> 16;
       $261 = $260 & 8;
       $262 = $256 << $261;
       $263 = (($262) + 520192)|0;
       $264 = $263 >>> 16;
       $265 = $264 & 4;
       $266 = $265 | $261;
       $267 = $262 << $265;
       $268 = (($267) + 245760)|0;
       $269 = $268 >>> 16;
       $270 = $269 & 2;
       $271 = $266 | $270;
       $272 = (14 - ($271))|0;
       $273 = $267 << $270;
       $274 = $273 >>> 15;
       $275 = (($272) + ($274))|0;
       $276 = $275 << 1;
       $277 = (($275) + 7)|0;
       $278 = $252 >>> $277;
       $279 = $278 & 1;
       $280 = $279 | $276;
       $$0358$i = $280;
      }
     }
     $281 = (36804 + ($$0358$i<<2)|0);
     $282 = HEAP32[$281>>2]|0;
     $283 = ($282|0)==(0|0);
     L117: do {
      if ($283) {
       $$2355$i = 0;$$3$i203 = 0;$$3350$i = $255;
       label = 81;
      } else {
       $284 = ($$0358$i|0)==(31);
       $285 = $$0358$i >>> 1;
       $286 = (25 - ($285))|0;
       $287 = $284 ? 0 : $286;
       $288 = $252 << $287;
       $$0342$i = 0;$$0347$i = $255;$$0353$i = $282;$$0359$i = $288;$$0362$i = 0;
       while(1) {
        $289 = ((($$0353$i)) + 4|0);
        $290 = HEAP32[$289>>2]|0;
        $291 = $290 & -8;
        $292 = (($291) - ($252))|0;
        $293 = ($292>>>0)<($$0347$i>>>0);
        if ($293) {
         $294 = ($292|0)==(0);
         if ($294) {
          $$414$i = $$0353$i;$$435113$i = 0;$$435712$i = $$0353$i;
          label = 85;
          break L117;
         } else {
          $$1343$i = $$0353$i;$$1348$i = $292;
         }
        } else {
         $$1343$i = $$0342$i;$$1348$i = $$0347$i;
        }
        $295 = ((($$0353$i)) + 20|0);
        $296 = HEAP32[$295>>2]|0;
        $297 = $$0359$i >>> 31;
        $298 = (((($$0353$i)) + 16|0) + ($297<<2)|0);
        $299 = HEAP32[$298>>2]|0;
        $300 = ($296|0)==(0|0);
        $301 = ($296|0)==($299|0);
        $or$cond2$i = $300 | $301;
        $$1363$i = $or$cond2$i ? $$0362$i : $296;
        $302 = ($299|0)==(0|0);
        $not$7$i = $302 ^ 1;
        $303 = $not$7$i&1;
        $$0359$$i = $$0359$i << $303;
        if ($302) {
         $$2355$i = $$1363$i;$$3$i203 = $$1343$i;$$3350$i = $$1348$i;
         label = 81;
         break;
        } else {
         $$0342$i = $$1343$i;$$0347$i = $$1348$i;$$0353$i = $299;$$0359$i = $$0359$$i;$$0362$i = $$1363$i;
        }
       }
      }
     } while(0);
     if ((label|0) == 81) {
      $304 = ($$2355$i|0)==(0|0);
      $305 = ($$3$i203|0)==(0|0);
      $or$cond$i = $304 & $305;
      if ($or$cond$i) {
       $306 = 2 << $$0358$i;
       $307 = (0 - ($306))|0;
       $308 = $306 | $307;
       $309 = $253 & $308;
       $310 = ($309|0)==(0);
       if ($310) {
        $$0197 = $252;
        break;
       }
       $311 = (0 - ($309))|0;
       $312 = $309 & $311;
       $313 = (($312) + -1)|0;
       $314 = $313 >>> 12;
       $315 = $314 & 16;
       $316 = $313 >>> $315;
       $317 = $316 >>> 5;
       $318 = $317 & 8;
       $319 = $318 | $315;
       $320 = $316 >>> $318;
       $321 = $320 >>> 2;
       $322 = $321 & 4;
       $323 = $319 | $322;
       $324 = $320 >>> $322;
       $325 = $324 >>> 1;
       $326 = $325 & 2;
       $327 = $323 | $326;
       $328 = $324 >>> $326;
       $329 = $328 >>> 1;
       $330 = $329 & 1;
       $331 = $327 | $330;
       $332 = $328 >>> $330;
       $333 = (($331) + ($332))|0;
       $334 = (36804 + ($333<<2)|0);
       $335 = HEAP32[$334>>2]|0;
       $$4$ph$i = 0;$$4357$ph$i = $335;
      } else {
       $$4$ph$i = $$3$i203;$$4357$ph$i = $$2355$i;
      }
      $336 = ($$4357$ph$i|0)==(0|0);
      if ($336) {
       $$4$lcssa$i = $$4$ph$i;$$4351$lcssa$i = $$3350$i;
      } else {
       $$414$i = $$4$ph$i;$$435113$i = $$3350$i;$$435712$i = $$4357$ph$i;
       label = 85;
      }
     }
     if ((label|0) == 85) {
      while(1) {
       label = 0;
       $337 = ((($$435712$i)) + 4|0);
       $338 = HEAP32[$337>>2]|0;
       $339 = $338 & -8;
       $340 = (($339) - ($252))|0;
       $341 = ($340>>>0)<($$435113$i>>>0);
       $$$4351$i = $341 ? $340 : $$435113$i;
       $$4357$$4$i = $341 ? $$435712$i : $$414$i;
       $342 = ((($$435712$i)) + 16|0);
       $343 = HEAP32[$342>>2]|0;
       $344 = ($343|0)==(0|0);
       $$sink2$i205 = $344&1;
       $345 = (((($$435712$i)) + 16|0) + ($$sink2$i205<<2)|0);
       $346 = HEAP32[$345>>2]|0;
       $347 = ($346|0)==(0|0);
       if ($347) {
        $$4$lcssa$i = $$4357$$4$i;$$4351$lcssa$i = $$$4351$i;
        break;
       } else {
        $$414$i = $$4357$$4$i;$$435113$i = $$$4351$i;$$435712$i = $346;
        label = 85;
       }
      }
     }
     $348 = ($$4$lcssa$i|0)==(0|0);
     if ($348) {
      $$0197 = $252;
     } else {
      $349 = HEAP32[(36508)>>2]|0;
      $350 = (($349) - ($252))|0;
      $351 = ($$4351$lcssa$i>>>0)<($350>>>0);
      if ($351) {
       $352 = HEAP32[(36516)>>2]|0;
       $353 = ($352>>>0)>($$4$lcssa$i>>>0);
       if ($353) {
        _abort();
        // unreachable;
       }
       $354 = (($$4$lcssa$i) + ($252)|0);
       $355 = ($354>>>0)>($$4$lcssa$i>>>0);
       if (!($355)) {
        _abort();
        // unreachable;
       }
       $356 = ((($$4$lcssa$i)) + 24|0);
       $357 = HEAP32[$356>>2]|0;
       $358 = ((($$4$lcssa$i)) + 12|0);
       $359 = HEAP32[$358>>2]|0;
       $360 = ($359|0)==($$4$lcssa$i|0);
       do {
        if ($360) {
         $370 = ((($$4$lcssa$i)) + 20|0);
         $371 = HEAP32[$370>>2]|0;
         $372 = ($371|0)==(0|0);
         if ($372) {
          $373 = ((($$4$lcssa$i)) + 16|0);
          $374 = HEAP32[$373>>2]|0;
          $375 = ($374|0)==(0|0);
          if ($375) {
           $$3372$i = 0;
           break;
          } else {
           $$1370$i = $374;$$1374$i = $373;
          }
         } else {
          $$1370$i = $371;$$1374$i = $370;
         }
         while(1) {
          $376 = ((($$1370$i)) + 20|0);
          $377 = HEAP32[$376>>2]|0;
          $378 = ($377|0)==(0|0);
          if (!($378)) {
           $$1370$i = $377;$$1374$i = $376;
           continue;
          }
          $379 = ((($$1370$i)) + 16|0);
          $380 = HEAP32[$379>>2]|0;
          $381 = ($380|0)==(0|0);
          if ($381) {
           break;
          } else {
           $$1370$i = $380;$$1374$i = $379;
          }
         }
         $382 = ($352>>>0)>($$1374$i>>>0);
         if ($382) {
          _abort();
          // unreachable;
         } else {
          HEAP32[$$1374$i>>2] = 0;
          $$3372$i = $$1370$i;
          break;
         }
        } else {
         $361 = ((($$4$lcssa$i)) + 8|0);
         $362 = HEAP32[$361>>2]|0;
         $363 = ($352>>>0)>($362>>>0);
         if ($363) {
          _abort();
          // unreachable;
         }
         $364 = ((($362)) + 12|0);
         $365 = HEAP32[$364>>2]|0;
         $366 = ($365|0)==($$4$lcssa$i|0);
         if (!($366)) {
          _abort();
          // unreachable;
         }
         $367 = ((($359)) + 8|0);
         $368 = HEAP32[$367>>2]|0;
         $369 = ($368|0)==($$4$lcssa$i|0);
         if ($369) {
          HEAP32[$364>>2] = $359;
          HEAP32[$367>>2] = $362;
          $$3372$i = $359;
          break;
         } else {
          _abort();
          // unreachable;
         }
        }
       } while(0);
       $383 = ($357|0)==(0|0);
       L164: do {
        if ($383) {
         $475 = $253;
        } else {
         $384 = ((($$4$lcssa$i)) + 28|0);
         $385 = HEAP32[$384>>2]|0;
         $386 = (36804 + ($385<<2)|0);
         $387 = HEAP32[$386>>2]|0;
         $388 = ($$4$lcssa$i|0)==($387|0);
         do {
          if ($388) {
           HEAP32[$386>>2] = $$3372$i;
           $cond$i209 = ($$3372$i|0)==(0|0);
           if ($cond$i209) {
            $389 = 1 << $385;
            $390 = $389 ^ -1;
            $391 = $253 & $390;
            HEAP32[(36504)>>2] = $391;
            $475 = $391;
            break L164;
           }
          } else {
           $392 = HEAP32[(36516)>>2]|0;
           $393 = ($392>>>0)>($357>>>0);
           if ($393) {
            _abort();
            // unreachable;
           } else {
            $394 = ((($357)) + 16|0);
            $395 = HEAP32[$394>>2]|0;
            $396 = ($395|0)!=($$4$lcssa$i|0);
            $$sink3$i = $396&1;
            $397 = (((($357)) + 16|0) + ($$sink3$i<<2)|0);
            HEAP32[$397>>2] = $$3372$i;
            $398 = ($$3372$i|0)==(0|0);
            if ($398) {
             $475 = $253;
             break L164;
            } else {
             break;
            }
           }
          }
         } while(0);
         $399 = HEAP32[(36516)>>2]|0;
         $400 = ($399>>>0)>($$3372$i>>>0);
         if ($400) {
          _abort();
          // unreachable;
         }
         $401 = ((($$3372$i)) + 24|0);
         HEAP32[$401>>2] = $357;
         $402 = ((($$4$lcssa$i)) + 16|0);
         $403 = HEAP32[$402>>2]|0;
         $404 = ($403|0)==(0|0);
         do {
          if (!($404)) {
           $405 = ($399>>>0)>($403>>>0);
           if ($405) {
            _abort();
            // unreachable;
           } else {
            $406 = ((($$3372$i)) + 16|0);
            HEAP32[$406>>2] = $403;
            $407 = ((($403)) + 24|0);
            HEAP32[$407>>2] = $$3372$i;
            break;
           }
          }
         } while(0);
         $408 = ((($$4$lcssa$i)) + 20|0);
         $409 = HEAP32[$408>>2]|0;
         $410 = ($409|0)==(0|0);
         if ($410) {
          $475 = $253;
         } else {
          $411 = HEAP32[(36516)>>2]|0;
          $412 = ($411>>>0)>($409>>>0);
          if ($412) {
           _abort();
           // unreachable;
          } else {
           $413 = ((($$3372$i)) + 20|0);
           HEAP32[$413>>2] = $409;
           $414 = ((($409)) + 24|0);
           HEAP32[$414>>2] = $$3372$i;
           $475 = $253;
           break;
          }
         }
        }
       } while(0);
       $415 = ($$4351$lcssa$i>>>0)<(16);
       do {
        if ($415) {
         $416 = (($$4351$lcssa$i) + ($252))|0;
         $417 = $416 | 3;
         $418 = ((($$4$lcssa$i)) + 4|0);
         HEAP32[$418>>2] = $417;
         $419 = (($$4$lcssa$i) + ($416)|0);
         $420 = ((($419)) + 4|0);
         $421 = HEAP32[$420>>2]|0;
         $422 = $421 | 1;
         HEAP32[$420>>2] = $422;
        } else {
         $423 = $252 | 3;
         $424 = ((($$4$lcssa$i)) + 4|0);
         HEAP32[$424>>2] = $423;
         $425 = $$4351$lcssa$i | 1;
         $426 = ((($354)) + 4|0);
         HEAP32[$426>>2] = $425;
         $427 = (($354) + ($$4351$lcssa$i)|0);
         HEAP32[$427>>2] = $$4351$lcssa$i;
         $428 = $$4351$lcssa$i >>> 3;
         $429 = ($$4351$lcssa$i>>>0)<(256);
         if ($429) {
          $430 = $428 << 1;
          $431 = (36540 + ($430<<2)|0);
          $432 = HEAP32[9125]|0;
          $433 = 1 << $428;
          $434 = $432 & $433;
          $435 = ($434|0)==(0);
          if ($435) {
           $436 = $432 | $433;
           HEAP32[9125] = $436;
           $$pre$i210 = ((($431)) + 8|0);
           $$0368$i = $431;$$pre$phi$i211Z2D = $$pre$i210;
          } else {
           $437 = ((($431)) + 8|0);
           $438 = HEAP32[$437>>2]|0;
           $439 = HEAP32[(36516)>>2]|0;
           $440 = ($439>>>0)>($438>>>0);
           if ($440) {
            _abort();
            // unreachable;
           } else {
            $$0368$i = $438;$$pre$phi$i211Z2D = $437;
           }
          }
          HEAP32[$$pre$phi$i211Z2D>>2] = $354;
          $441 = ((($$0368$i)) + 12|0);
          HEAP32[$441>>2] = $354;
          $442 = ((($354)) + 8|0);
          HEAP32[$442>>2] = $$0368$i;
          $443 = ((($354)) + 12|0);
          HEAP32[$443>>2] = $431;
          break;
         }
         $444 = $$4351$lcssa$i >>> 8;
         $445 = ($444|0)==(0);
         if ($445) {
          $$0361$i = 0;
         } else {
          $446 = ($$4351$lcssa$i>>>0)>(16777215);
          if ($446) {
           $$0361$i = 31;
          } else {
           $447 = (($444) + 1048320)|0;
           $448 = $447 >>> 16;
           $449 = $448 & 8;
           $450 = $444 << $449;
           $451 = (($450) + 520192)|0;
           $452 = $451 >>> 16;
           $453 = $452 & 4;
           $454 = $453 | $449;
           $455 = $450 << $453;
           $456 = (($455) + 245760)|0;
           $457 = $456 >>> 16;
           $458 = $457 & 2;
           $459 = $454 | $458;
           $460 = (14 - ($459))|0;
           $461 = $455 << $458;
           $462 = $461 >>> 15;
           $463 = (($460) + ($462))|0;
           $464 = $463 << 1;
           $465 = (($463) + 7)|0;
           $466 = $$4351$lcssa$i >>> $465;
           $467 = $466 & 1;
           $468 = $467 | $464;
           $$0361$i = $468;
          }
         }
         $469 = (36804 + ($$0361$i<<2)|0);
         $470 = ((($354)) + 28|0);
         HEAP32[$470>>2] = $$0361$i;
         $471 = ((($354)) + 16|0);
         $472 = ((($471)) + 4|0);
         HEAP32[$472>>2] = 0;
         HEAP32[$471>>2] = 0;
         $473 = 1 << $$0361$i;
         $474 = $475 & $473;
         $476 = ($474|0)==(0);
         if ($476) {
          $477 = $475 | $473;
          HEAP32[(36504)>>2] = $477;
          HEAP32[$469>>2] = $354;
          $478 = ((($354)) + 24|0);
          HEAP32[$478>>2] = $469;
          $479 = ((($354)) + 12|0);
          HEAP32[$479>>2] = $354;
          $480 = ((($354)) + 8|0);
          HEAP32[$480>>2] = $354;
          break;
         }
         $481 = HEAP32[$469>>2]|0;
         $482 = ($$0361$i|0)==(31);
         $483 = $$0361$i >>> 1;
         $484 = (25 - ($483))|0;
         $485 = $482 ? 0 : $484;
         $486 = $$4351$lcssa$i << $485;
         $$0344$i = $486;$$0345$i = $481;
         while(1) {
          $487 = ((($$0345$i)) + 4|0);
          $488 = HEAP32[$487>>2]|0;
          $489 = $488 & -8;
          $490 = ($489|0)==($$4351$lcssa$i|0);
          if ($490) {
           label = 139;
           break;
          }
          $491 = $$0344$i >>> 31;
          $492 = (((($$0345$i)) + 16|0) + ($491<<2)|0);
          $493 = $$0344$i << 1;
          $494 = HEAP32[$492>>2]|0;
          $495 = ($494|0)==(0|0);
          if ($495) {
           label = 136;
           break;
          } else {
           $$0344$i = $493;$$0345$i = $494;
          }
         }
         if ((label|0) == 136) {
          $496 = HEAP32[(36516)>>2]|0;
          $497 = ($496>>>0)>($492>>>0);
          if ($497) {
           _abort();
           // unreachable;
          } else {
           HEAP32[$492>>2] = $354;
           $498 = ((($354)) + 24|0);
           HEAP32[$498>>2] = $$0345$i;
           $499 = ((($354)) + 12|0);
           HEAP32[$499>>2] = $354;
           $500 = ((($354)) + 8|0);
           HEAP32[$500>>2] = $354;
           break;
          }
         }
         else if ((label|0) == 139) {
          $501 = ((($$0345$i)) + 8|0);
          $502 = HEAP32[$501>>2]|0;
          $503 = HEAP32[(36516)>>2]|0;
          $504 = ($503>>>0)<=($$0345$i>>>0);
          $505 = ($503>>>0)<=($502>>>0);
          $506 = $505 & $504;
          if ($506) {
           $507 = ((($502)) + 12|0);
           HEAP32[$507>>2] = $354;
           HEAP32[$501>>2] = $354;
           $508 = ((($354)) + 8|0);
           HEAP32[$508>>2] = $502;
           $509 = ((($354)) + 12|0);
           HEAP32[$509>>2] = $$0345$i;
           $510 = ((($354)) + 24|0);
           HEAP32[$510>>2] = 0;
           break;
          } else {
           _abort();
           // unreachable;
          }
         }
        }
       } while(0);
       $511 = ((($$4$lcssa$i)) + 8|0);
       $$0 = $511;
       STACKTOP = sp;return ($$0|0);
      } else {
       $$0197 = $252;
      }
     }
    }
   }
  }
 } while(0);
 $512 = HEAP32[(36508)>>2]|0;
 $513 = ($512>>>0)<($$0197>>>0);
 if (!($513)) {
  $514 = (($512) - ($$0197))|0;
  $515 = HEAP32[(36520)>>2]|0;
  $516 = ($514>>>0)>(15);
  if ($516) {
   $517 = (($515) + ($$0197)|0);
   HEAP32[(36520)>>2] = $517;
   HEAP32[(36508)>>2] = $514;
   $518 = $514 | 1;
   $519 = ((($517)) + 4|0);
   HEAP32[$519>>2] = $518;
   $520 = (($515) + ($512)|0);
   HEAP32[$520>>2] = $514;
   $521 = $$0197 | 3;
   $522 = ((($515)) + 4|0);
   HEAP32[$522>>2] = $521;
  } else {
   HEAP32[(36508)>>2] = 0;
   HEAP32[(36520)>>2] = 0;
   $523 = $512 | 3;
   $524 = ((($515)) + 4|0);
   HEAP32[$524>>2] = $523;
   $525 = (($515) + ($512)|0);
   $526 = ((($525)) + 4|0);
   $527 = HEAP32[$526>>2]|0;
   $528 = $527 | 1;
   HEAP32[$526>>2] = $528;
  }
  $529 = ((($515)) + 8|0);
  $$0 = $529;
  STACKTOP = sp;return ($$0|0);
 }
 $530 = HEAP32[(36512)>>2]|0;
 $531 = ($530>>>0)>($$0197>>>0);
 if ($531) {
  $532 = (($530) - ($$0197))|0;
  HEAP32[(36512)>>2] = $532;
  $533 = HEAP32[(36524)>>2]|0;
  $534 = (($533) + ($$0197)|0);
  HEAP32[(36524)>>2] = $534;
  $535 = $532 | 1;
  $536 = ((($534)) + 4|0);
  HEAP32[$536>>2] = $535;
  $537 = $$0197 | 3;
  $538 = ((($533)) + 4|0);
  HEAP32[$538>>2] = $537;
  $539 = ((($533)) + 8|0);
  $$0 = $539;
  STACKTOP = sp;return ($$0|0);
 }
 $540 = HEAP32[9243]|0;
 $541 = ($540|0)==(0);
 if ($541) {
  HEAP32[(36980)>>2] = 4096;
  HEAP32[(36976)>>2] = 4096;
  HEAP32[(36984)>>2] = -1;
  HEAP32[(36988)>>2] = -1;
  HEAP32[(36992)>>2] = 0;
  HEAP32[(36944)>>2] = 0;
  $542 = $1;
  $543 = $542 & -16;
  $544 = $543 ^ 1431655768;
  HEAP32[9243] = $544;
  $548 = 4096;
 } else {
  $$pre$i212 = HEAP32[(36980)>>2]|0;
  $548 = $$pre$i212;
 }
 $545 = (($$0197) + 48)|0;
 $546 = (($$0197) + 47)|0;
 $547 = (($548) + ($546))|0;
 $549 = (0 - ($548))|0;
 $550 = $547 & $549;
 $551 = ($550>>>0)>($$0197>>>0);
 if (!($551)) {
  $$0 = 0;
  STACKTOP = sp;return ($$0|0);
 }
 $552 = HEAP32[(36940)>>2]|0;
 $553 = ($552|0)==(0);
 if (!($553)) {
  $554 = HEAP32[(36932)>>2]|0;
  $555 = (($554) + ($550))|0;
  $556 = ($555>>>0)<=($554>>>0);
  $557 = ($555>>>0)>($552>>>0);
  $or$cond1$i = $556 | $557;
  if ($or$cond1$i) {
   $$0 = 0;
   STACKTOP = sp;return ($$0|0);
  }
 }
 $558 = HEAP32[(36944)>>2]|0;
 $559 = $558 & 4;
 $560 = ($559|0)==(0);
 L244: do {
  if ($560) {
   $561 = HEAP32[(36524)>>2]|0;
   $562 = ($561|0)==(0|0);
   L246: do {
    if ($562) {
     label = 163;
    } else {
     $$0$i$i = (36948);
     while(1) {
      $563 = HEAP32[$$0$i$i>>2]|0;
      $564 = ($563>>>0)>($561>>>0);
      if (!($564)) {
       $565 = ((($$0$i$i)) + 4|0);
       $566 = HEAP32[$565>>2]|0;
       $567 = (($563) + ($566)|0);
       $568 = ($567>>>0)>($561>>>0);
       if ($568) {
        break;
       }
      }
      $569 = ((($$0$i$i)) + 8|0);
      $570 = HEAP32[$569>>2]|0;
      $571 = ($570|0)==(0|0);
      if ($571) {
       label = 163;
       break L246;
      } else {
       $$0$i$i = $570;
      }
     }
     $594 = (($547) - ($530))|0;
     $595 = $594 & $549;
     $596 = ($595>>>0)<(2147483647);
     if ($596) {
      $597 = (_sbrk(($595|0))|0);
      $598 = HEAP32[$$0$i$i>>2]|0;
      $599 = HEAP32[$565>>2]|0;
      $600 = (($598) + ($599)|0);
      $601 = ($597|0)==($600|0);
      if ($601) {
       $602 = ($597|0)==((-1)|0);
       if ($602) {
        $$2234243136$i = $595;
       } else {
        $$723947$i = $595;$$748$i = $597;
        label = 180;
        break L244;
       }
      } else {
       $$2247$ph$i = $597;$$2253$ph$i = $595;
       label = 171;
      }
     } else {
      $$2234243136$i = 0;
     }
    }
   } while(0);
   do {
    if ((label|0) == 163) {
     $572 = (_sbrk(0)|0);
     $573 = ($572|0)==((-1)|0);
     if ($573) {
      $$2234243136$i = 0;
     } else {
      $574 = $572;
      $575 = HEAP32[(36976)>>2]|0;
      $576 = (($575) + -1)|0;
      $577 = $576 & $574;
      $578 = ($577|0)==(0);
      $579 = (($576) + ($574))|0;
      $580 = (0 - ($575))|0;
      $581 = $579 & $580;
      $582 = (($581) - ($574))|0;
      $583 = $578 ? 0 : $582;
      $$$i = (($583) + ($550))|0;
      $584 = HEAP32[(36932)>>2]|0;
      $585 = (($$$i) + ($584))|0;
      $586 = ($$$i>>>0)>($$0197>>>0);
      $587 = ($$$i>>>0)<(2147483647);
      $or$cond$i214 = $586 & $587;
      if ($or$cond$i214) {
       $588 = HEAP32[(36940)>>2]|0;
       $589 = ($588|0)==(0);
       if (!($589)) {
        $590 = ($585>>>0)<=($584>>>0);
        $591 = ($585>>>0)>($588>>>0);
        $or$cond2$i215 = $590 | $591;
        if ($or$cond2$i215) {
         $$2234243136$i = 0;
         break;
        }
       }
       $592 = (_sbrk(($$$i|0))|0);
       $593 = ($592|0)==($572|0);
       if ($593) {
        $$723947$i = $$$i;$$748$i = $572;
        label = 180;
        break L244;
       } else {
        $$2247$ph$i = $592;$$2253$ph$i = $$$i;
        label = 171;
       }
      } else {
       $$2234243136$i = 0;
      }
     }
    }
   } while(0);
   do {
    if ((label|0) == 171) {
     $603 = (0 - ($$2253$ph$i))|0;
     $604 = ($$2247$ph$i|0)!=((-1)|0);
     $605 = ($$2253$ph$i>>>0)<(2147483647);
     $or$cond7$i = $605 & $604;
     $606 = ($545>>>0)>($$2253$ph$i>>>0);
     $or$cond10$i = $606 & $or$cond7$i;
     if (!($or$cond10$i)) {
      $616 = ($$2247$ph$i|0)==((-1)|0);
      if ($616) {
       $$2234243136$i = 0;
       break;
      } else {
       $$723947$i = $$2253$ph$i;$$748$i = $$2247$ph$i;
       label = 180;
       break L244;
      }
     }
     $607 = HEAP32[(36980)>>2]|0;
     $608 = (($546) - ($$2253$ph$i))|0;
     $609 = (($608) + ($607))|0;
     $610 = (0 - ($607))|0;
     $611 = $609 & $610;
     $612 = ($611>>>0)<(2147483647);
     if (!($612)) {
      $$723947$i = $$2253$ph$i;$$748$i = $$2247$ph$i;
      label = 180;
      break L244;
     }
     $613 = (_sbrk(($611|0))|0);
     $614 = ($613|0)==((-1)|0);
     if ($614) {
      (_sbrk(($603|0))|0);
      $$2234243136$i = 0;
      break;
     } else {
      $615 = (($611) + ($$2253$ph$i))|0;
      $$723947$i = $615;$$748$i = $$2247$ph$i;
      label = 180;
      break L244;
     }
    }
   } while(0);
   $617 = HEAP32[(36944)>>2]|0;
   $618 = $617 | 4;
   HEAP32[(36944)>>2] = $618;
   $$4236$i = $$2234243136$i;
   label = 178;
  } else {
   $$4236$i = 0;
   label = 178;
  }
 } while(0);
 if ((label|0) == 178) {
  $619 = ($550>>>0)<(2147483647);
  if ($619) {
   $620 = (_sbrk(($550|0))|0);
   $621 = (_sbrk(0)|0);
   $622 = ($620|0)!=((-1)|0);
   $623 = ($621|0)!=((-1)|0);
   $or$cond5$i = $622 & $623;
   $624 = ($620>>>0)<($621>>>0);
   $or$cond11$i = $624 & $or$cond5$i;
   $625 = $621;
   $626 = $620;
   $627 = (($625) - ($626))|0;
   $628 = (($$0197) + 40)|0;
   $629 = ($627>>>0)>($628>>>0);
   $$$4236$i = $629 ? $627 : $$4236$i;
   $or$cond11$not$i = $or$cond11$i ^ 1;
   $630 = ($620|0)==((-1)|0);
   $not$$i = $629 ^ 1;
   $631 = $630 | $not$$i;
   $or$cond49$i = $631 | $or$cond11$not$i;
   if (!($or$cond49$i)) {
    $$723947$i = $$$4236$i;$$748$i = $620;
    label = 180;
   }
  }
 }
 if ((label|0) == 180) {
  $632 = HEAP32[(36932)>>2]|0;
  $633 = (($632) + ($$723947$i))|0;
  HEAP32[(36932)>>2] = $633;
  $634 = HEAP32[(36936)>>2]|0;
  $635 = ($633>>>0)>($634>>>0);
  if ($635) {
   HEAP32[(36936)>>2] = $633;
  }
  $636 = HEAP32[(36524)>>2]|0;
  $637 = ($636|0)==(0|0);
  do {
   if ($637) {
    $638 = HEAP32[(36516)>>2]|0;
    $639 = ($638|0)==(0|0);
    $640 = ($$748$i>>>0)<($638>>>0);
    $or$cond12$i = $639 | $640;
    if ($or$cond12$i) {
     HEAP32[(36516)>>2] = $$748$i;
    }
    HEAP32[(36948)>>2] = $$748$i;
    HEAP32[(36952)>>2] = $$723947$i;
    HEAP32[(36960)>>2] = 0;
    $641 = HEAP32[9243]|0;
    HEAP32[(36536)>>2] = $641;
    HEAP32[(36532)>>2] = -1;
    HEAP32[(36552)>>2] = (36540);
    HEAP32[(36548)>>2] = (36540);
    HEAP32[(36560)>>2] = (36548);
    HEAP32[(36556)>>2] = (36548);
    HEAP32[(36568)>>2] = (36556);
    HEAP32[(36564)>>2] = (36556);
    HEAP32[(36576)>>2] = (36564);
    HEAP32[(36572)>>2] = (36564);
    HEAP32[(36584)>>2] = (36572);
    HEAP32[(36580)>>2] = (36572);
    HEAP32[(36592)>>2] = (36580);
    HEAP32[(36588)>>2] = (36580);
    HEAP32[(36600)>>2] = (36588);
    HEAP32[(36596)>>2] = (36588);
    HEAP32[(36608)>>2] = (36596);
    HEAP32[(36604)>>2] = (36596);
    HEAP32[(36616)>>2] = (36604);
    HEAP32[(36612)>>2] = (36604);
    HEAP32[(36624)>>2] = (36612);
    HEAP32[(36620)>>2] = (36612);
    HEAP32[(36632)>>2] = (36620);
    HEAP32[(36628)>>2] = (36620);
    HEAP32[(36640)>>2] = (36628);
    HEAP32[(36636)>>2] = (36628);
    HEAP32[(36648)>>2] = (36636);
    HEAP32[(36644)>>2] = (36636);
    HEAP32[(36656)>>2] = (36644);
    HEAP32[(36652)>>2] = (36644);
    HEAP32[(36664)>>2] = (36652);
    HEAP32[(36660)>>2] = (36652);
    HEAP32[(36672)>>2] = (36660);
    HEAP32[(36668)>>2] = (36660);
    HEAP32[(36680)>>2] = (36668);
    HEAP32[(36676)>>2] = (36668);
    HEAP32[(36688)>>2] = (36676);
    HEAP32[(36684)>>2] = (36676);
    HEAP32[(36696)>>2] = (36684);
    HEAP32[(36692)>>2] = (36684);
    HEAP32[(36704)>>2] = (36692);
    HEAP32[(36700)>>2] = (36692);
    HEAP32[(36712)>>2] = (36700);
    HEAP32[(36708)>>2] = (36700);
    HEAP32[(36720)>>2] = (36708);
    HEAP32[(36716)>>2] = (36708);
    HEAP32[(36728)>>2] = (36716);
    HEAP32[(36724)>>2] = (36716);
    HEAP32[(36736)>>2] = (36724);
    HEAP32[(36732)>>2] = (36724);
    HEAP32[(36744)>>2] = (36732);
    HEAP32[(36740)>>2] = (36732);
    HEAP32[(36752)>>2] = (36740);
    HEAP32[(36748)>>2] = (36740);
    HEAP32[(36760)>>2] = (36748);
    HEAP32[(36756)>>2] = (36748);
    HEAP32[(36768)>>2] = (36756);
    HEAP32[(36764)>>2] = (36756);
    HEAP32[(36776)>>2] = (36764);
    HEAP32[(36772)>>2] = (36764);
    HEAP32[(36784)>>2] = (36772);
    HEAP32[(36780)>>2] = (36772);
    HEAP32[(36792)>>2] = (36780);
    HEAP32[(36788)>>2] = (36780);
    HEAP32[(36800)>>2] = (36788);
    HEAP32[(36796)>>2] = (36788);
    $642 = (($$723947$i) + -40)|0;
    $643 = ((($$748$i)) + 8|0);
    $644 = $643;
    $645 = $644 & 7;
    $646 = ($645|0)==(0);
    $647 = (0 - ($644))|0;
    $648 = $647 & 7;
    $649 = $646 ? 0 : $648;
    $650 = (($$748$i) + ($649)|0);
    $651 = (($642) - ($649))|0;
    HEAP32[(36524)>>2] = $650;
    HEAP32[(36512)>>2] = $651;
    $652 = $651 | 1;
    $653 = ((($650)) + 4|0);
    HEAP32[$653>>2] = $652;
    $654 = (($$748$i) + ($642)|0);
    $655 = ((($654)) + 4|0);
    HEAP32[$655>>2] = 40;
    $656 = HEAP32[(36988)>>2]|0;
    HEAP32[(36528)>>2] = $656;
   } else {
    $$024367$i = (36948);
    while(1) {
     $657 = HEAP32[$$024367$i>>2]|0;
     $658 = ((($$024367$i)) + 4|0);
     $659 = HEAP32[$658>>2]|0;
     $660 = (($657) + ($659)|0);
     $661 = ($$748$i|0)==($660|0);
     if ($661) {
      label = 188;
      break;
     }
     $662 = ((($$024367$i)) + 8|0);
     $663 = HEAP32[$662>>2]|0;
     $664 = ($663|0)==(0|0);
     if ($664) {
      break;
     } else {
      $$024367$i = $663;
     }
    }
    if ((label|0) == 188) {
     $665 = ((($$024367$i)) + 12|0);
     $666 = HEAP32[$665>>2]|0;
     $667 = $666 & 8;
     $668 = ($667|0)==(0);
     if ($668) {
      $669 = ($657>>>0)<=($636>>>0);
      $670 = ($$748$i>>>0)>($636>>>0);
      $or$cond50$i = $670 & $669;
      if ($or$cond50$i) {
       $671 = (($659) + ($$723947$i))|0;
       HEAP32[$658>>2] = $671;
       $672 = HEAP32[(36512)>>2]|0;
       $673 = (($672) + ($$723947$i))|0;
       $674 = ((($636)) + 8|0);
       $675 = $674;
       $676 = $675 & 7;
       $677 = ($676|0)==(0);
       $678 = (0 - ($675))|0;
       $679 = $678 & 7;
       $680 = $677 ? 0 : $679;
       $681 = (($636) + ($680)|0);
       $682 = (($673) - ($680))|0;
       HEAP32[(36524)>>2] = $681;
       HEAP32[(36512)>>2] = $682;
       $683 = $682 | 1;
       $684 = ((($681)) + 4|0);
       HEAP32[$684>>2] = $683;
       $685 = (($636) + ($673)|0);
       $686 = ((($685)) + 4|0);
       HEAP32[$686>>2] = 40;
       $687 = HEAP32[(36988)>>2]|0;
       HEAP32[(36528)>>2] = $687;
       break;
      }
     }
    }
    $688 = HEAP32[(36516)>>2]|0;
    $689 = ($$748$i>>>0)<($688>>>0);
    if ($689) {
     HEAP32[(36516)>>2] = $$748$i;
     $753 = $$748$i;
    } else {
     $753 = $688;
    }
    $690 = (($$748$i) + ($$723947$i)|0);
    $$124466$i = (36948);
    while(1) {
     $691 = HEAP32[$$124466$i>>2]|0;
     $692 = ($691|0)==($690|0);
     if ($692) {
      label = 196;
      break;
     }
     $693 = ((($$124466$i)) + 8|0);
     $694 = HEAP32[$693>>2]|0;
     $695 = ($694|0)==(0|0);
     if ($695) {
      $$0$i$i$i = (36948);
      break;
     } else {
      $$124466$i = $694;
     }
    }
    if ((label|0) == 196) {
     $696 = ((($$124466$i)) + 12|0);
     $697 = HEAP32[$696>>2]|0;
     $698 = $697 & 8;
     $699 = ($698|0)==(0);
     if ($699) {
      HEAP32[$$124466$i>>2] = $$748$i;
      $700 = ((($$124466$i)) + 4|0);
      $701 = HEAP32[$700>>2]|0;
      $702 = (($701) + ($$723947$i))|0;
      HEAP32[$700>>2] = $702;
      $703 = ((($$748$i)) + 8|0);
      $704 = $703;
      $705 = $704 & 7;
      $706 = ($705|0)==(0);
      $707 = (0 - ($704))|0;
      $708 = $707 & 7;
      $709 = $706 ? 0 : $708;
      $710 = (($$748$i) + ($709)|0);
      $711 = ((($690)) + 8|0);
      $712 = $711;
      $713 = $712 & 7;
      $714 = ($713|0)==(0);
      $715 = (0 - ($712))|0;
      $716 = $715 & 7;
      $717 = $714 ? 0 : $716;
      $718 = (($690) + ($717)|0);
      $719 = $718;
      $720 = $710;
      $721 = (($719) - ($720))|0;
      $722 = (($710) + ($$0197)|0);
      $723 = (($721) - ($$0197))|0;
      $724 = $$0197 | 3;
      $725 = ((($710)) + 4|0);
      HEAP32[$725>>2] = $724;
      $726 = ($636|0)==($718|0);
      do {
       if ($726) {
        $727 = HEAP32[(36512)>>2]|0;
        $728 = (($727) + ($723))|0;
        HEAP32[(36512)>>2] = $728;
        HEAP32[(36524)>>2] = $722;
        $729 = $728 | 1;
        $730 = ((($722)) + 4|0);
        HEAP32[$730>>2] = $729;
       } else {
        $731 = HEAP32[(36520)>>2]|0;
        $732 = ($731|0)==($718|0);
        if ($732) {
         $733 = HEAP32[(36508)>>2]|0;
         $734 = (($733) + ($723))|0;
         HEAP32[(36508)>>2] = $734;
         HEAP32[(36520)>>2] = $722;
         $735 = $734 | 1;
         $736 = ((($722)) + 4|0);
         HEAP32[$736>>2] = $735;
         $737 = (($722) + ($734)|0);
         HEAP32[$737>>2] = $734;
         break;
        }
        $738 = ((($718)) + 4|0);
        $739 = HEAP32[$738>>2]|0;
        $740 = $739 & 3;
        $741 = ($740|0)==(1);
        if ($741) {
         $742 = $739 & -8;
         $743 = $739 >>> 3;
         $744 = ($739>>>0)<(256);
         L311: do {
          if ($744) {
           $745 = ((($718)) + 8|0);
           $746 = HEAP32[$745>>2]|0;
           $747 = ((($718)) + 12|0);
           $748 = HEAP32[$747>>2]|0;
           $749 = $743 << 1;
           $750 = (36540 + ($749<<2)|0);
           $751 = ($746|0)==($750|0);
           do {
            if (!($751)) {
             $752 = ($753>>>0)>($746>>>0);
             if ($752) {
              _abort();
              // unreachable;
             }
             $754 = ((($746)) + 12|0);
             $755 = HEAP32[$754>>2]|0;
             $756 = ($755|0)==($718|0);
             if ($756) {
              break;
             }
             _abort();
             // unreachable;
            }
           } while(0);
           $757 = ($748|0)==($746|0);
           if ($757) {
            $758 = 1 << $743;
            $759 = $758 ^ -1;
            $760 = HEAP32[9125]|0;
            $761 = $760 & $759;
            HEAP32[9125] = $761;
            break;
           }
           $762 = ($748|0)==($750|0);
           do {
            if ($762) {
             $$pre10$i$i = ((($748)) + 8|0);
             $$pre$phi11$i$iZ2D = $$pre10$i$i;
            } else {
             $763 = ($753>>>0)>($748>>>0);
             if ($763) {
              _abort();
              // unreachable;
             }
             $764 = ((($748)) + 8|0);
             $765 = HEAP32[$764>>2]|0;
             $766 = ($765|0)==($718|0);
             if ($766) {
              $$pre$phi11$i$iZ2D = $764;
              break;
             }
             _abort();
             // unreachable;
            }
           } while(0);
           $767 = ((($746)) + 12|0);
           HEAP32[$767>>2] = $748;
           HEAP32[$$pre$phi11$i$iZ2D>>2] = $746;
          } else {
           $768 = ((($718)) + 24|0);
           $769 = HEAP32[$768>>2]|0;
           $770 = ((($718)) + 12|0);
           $771 = HEAP32[$770>>2]|0;
           $772 = ($771|0)==($718|0);
           do {
            if ($772) {
             $782 = ((($718)) + 16|0);
             $783 = ((($782)) + 4|0);
             $784 = HEAP32[$783>>2]|0;
             $785 = ($784|0)==(0|0);
             if ($785) {
              $786 = HEAP32[$782>>2]|0;
              $787 = ($786|0)==(0|0);
              if ($787) {
               $$3$i$i = 0;
               break;
              } else {
               $$1291$i$i = $786;$$1293$i$i = $782;
              }
             } else {
              $$1291$i$i = $784;$$1293$i$i = $783;
             }
             while(1) {
              $788 = ((($$1291$i$i)) + 20|0);
              $789 = HEAP32[$788>>2]|0;
              $790 = ($789|0)==(0|0);
              if (!($790)) {
               $$1291$i$i = $789;$$1293$i$i = $788;
               continue;
              }
              $791 = ((($$1291$i$i)) + 16|0);
              $792 = HEAP32[$791>>2]|0;
              $793 = ($792|0)==(0|0);
              if ($793) {
               break;
              } else {
               $$1291$i$i = $792;$$1293$i$i = $791;
              }
             }
             $794 = ($753>>>0)>($$1293$i$i>>>0);
             if ($794) {
              _abort();
              // unreachable;
             } else {
              HEAP32[$$1293$i$i>>2] = 0;
              $$3$i$i = $$1291$i$i;
              break;
             }
            } else {
             $773 = ((($718)) + 8|0);
             $774 = HEAP32[$773>>2]|0;
             $775 = ($753>>>0)>($774>>>0);
             if ($775) {
              _abort();
              // unreachable;
             }
             $776 = ((($774)) + 12|0);
             $777 = HEAP32[$776>>2]|0;
             $778 = ($777|0)==($718|0);
             if (!($778)) {
              _abort();
              // unreachable;
             }
             $779 = ((($771)) + 8|0);
             $780 = HEAP32[$779>>2]|0;
             $781 = ($780|0)==($718|0);
             if ($781) {
              HEAP32[$776>>2] = $771;
              HEAP32[$779>>2] = $774;
              $$3$i$i = $771;
              break;
             } else {
              _abort();
              // unreachable;
             }
            }
           } while(0);
           $795 = ($769|0)==(0|0);
           if ($795) {
            break;
           }
           $796 = ((($718)) + 28|0);
           $797 = HEAP32[$796>>2]|0;
           $798 = (36804 + ($797<<2)|0);
           $799 = HEAP32[$798>>2]|0;
           $800 = ($799|0)==($718|0);
           do {
            if ($800) {
             HEAP32[$798>>2] = $$3$i$i;
             $cond$i$i = ($$3$i$i|0)==(0|0);
             if (!($cond$i$i)) {
              break;
             }
             $801 = 1 << $797;
             $802 = $801 ^ -1;
             $803 = HEAP32[(36504)>>2]|0;
             $804 = $803 & $802;
             HEAP32[(36504)>>2] = $804;
             break L311;
            } else {
             $805 = HEAP32[(36516)>>2]|0;
             $806 = ($805>>>0)>($769>>>0);
             if ($806) {
              _abort();
              // unreachable;
             } else {
              $807 = ((($769)) + 16|0);
              $808 = HEAP32[$807>>2]|0;
              $809 = ($808|0)!=($718|0);
              $$sink1$i$i = $809&1;
              $810 = (((($769)) + 16|0) + ($$sink1$i$i<<2)|0);
              HEAP32[$810>>2] = $$3$i$i;
              $811 = ($$3$i$i|0)==(0|0);
              if ($811) {
               break L311;
              } else {
               break;
              }
             }
            }
           } while(0);
           $812 = HEAP32[(36516)>>2]|0;
           $813 = ($812>>>0)>($$3$i$i>>>0);
           if ($813) {
            _abort();
            // unreachable;
           }
           $814 = ((($$3$i$i)) + 24|0);
           HEAP32[$814>>2] = $769;
           $815 = ((($718)) + 16|0);
           $816 = HEAP32[$815>>2]|0;
           $817 = ($816|0)==(0|0);
           do {
            if (!($817)) {
             $818 = ($812>>>0)>($816>>>0);
             if ($818) {
              _abort();
              // unreachable;
             } else {
              $819 = ((($$3$i$i)) + 16|0);
              HEAP32[$819>>2] = $816;
              $820 = ((($816)) + 24|0);
              HEAP32[$820>>2] = $$3$i$i;
              break;
             }
            }
           } while(0);
           $821 = ((($815)) + 4|0);
           $822 = HEAP32[$821>>2]|0;
           $823 = ($822|0)==(0|0);
           if ($823) {
            break;
           }
           $824 = HEAP32[(36516)>>2]|0;
           $825 = ($824>>>0)>($822>>>0);
           if ($825) {
            _abort();
            // unreachable;
           } else {
            $826 = ((($$3$i$i)) + 20|0);
            HEAP32[$826>>2] = $822;
            $827 = ((($822)) + 24|0);
            HEAP32[$827>>2] = $$3$i$i;
            break;
           }
          }
         } while(0);
         $828 = (($718) + ($742)|0);
         $829 = (($742) + ($723))|0;
         $$0$i17$i = $828;$$0287$i$i = $829;
        } else {
         $$0$i17$i = $718;$$0287$i$i = $723;
        }
        $830 = ((($$0$i17$i)) + 4|0);
        $831 = HEAP32[$830>>2]|0;
        $832 = $831 & -2;
        HEAP32[$830>>2] = $832;
        $833 = $$0287$i$i | 1;
        $834 = ((($722)) + 4|0);
        HEAP32[$834>>2] = $833;
        $835 = (($722) + ($$0287$i$i)|0);
        HEAP32[$835>>2] = $$0287$i$i;
        $836 = $$0287$i$i >>> 3;
        $837 = ($$0287$i$i>>>0)<(256);
        if ($837) {
         $838 = $836 << 1;
         $839 = (36540 + ($838<<2)|0);
         $840 = HEAP32[9125]|0;
         $841 = 1 << $836;
         $842 = $840 & $841;
         $843 = ($842|0)==(0);
         do {
          if ($843) {
           $844 = $840 | $841;
           HEAP32[9125] = $844;
           $$pre$i18$i = ((($839)) + 8|0);
           $$0295$i$i = $839;$$pre$phi$i19$iZ2D = $$pre$i18$i;
          } else {
           $845 = ((($839)) + 8|0);
           $846 = HEAP32[$845>>2]|0;
           $847 = HEAP32[(36516)>>2]|0;
           $848 = ($847>>>0)>($846>>>0);
           if (!($848)) {
            $$0295$i$i = $846;$$pre$phi$i19$iZ2D = $845;
            break;
           }
           _abort();
           // unreachable;
          }
         } while(0);
         HEAP32[$$pre$phi$i19$iZ2D>>2] = $722;
         $849 = ((($$0295$i$i)) + 12|0);
         HEAP32[$849>>2] = $722;
         $850 = ((($722)) + 8|0);
         HEAP32[$850>>2] = $$0295$i$i;
         $851 = ((($722)) + 12|0);
         HEAP32[$851>>2] = $839;
         break;
        }
        $852 = $$0287$i$i >>> 8;
        $853 = ($852|0)==(0);
        do {
         if ($853) {
          $$0296$i$i = 0;
         } else {
          $854 = ($$0287$i$i>>>0)>(16777215);
          if ($854) {
           $$0296$i$i = 31;
           break;
          }
          $855 = (($852) + 1048320)|0;
          $856 = $855 >>> 16;
          $857 = $856 & 8;
          $858 = $852 << $857;
          $859 = (($858) + 520192)|0;
          $860 = $859 >>> 16;
          $861 = $860 & 4;
          $862 = $861 | $857;
          $863 = $858 << $861;
          $864 = (($863) + 245760)|0;
          $865 = $864 >>> 16;
          $866 = $865 & 2;
          $867 = $862 | $866;
          $868 = (14 - ($867))|0;
          $869 = $863 << $866;
          $870 = $869 >>> 15;
          $871 = (($868) + ($870))|0;
          $872 = $871 << 1;
          $873 = (($871) + 7)|0;
          $874 = $$0287$i$i >>> $873;
          $875 = $874 & 1;
          $876 = $875 | $872;
          $$0296$i$i = $876;
         }
        } while(0);
        $877 = (36804 + ($$0296$i$i<<2)|0);
        $878 = ((($722)) + 28|0);
        HEAP32[$878>>2] = $$0296$i$i;
        $879 = ((($722)) + 16|0);
        $880 = ((($879)) + 4|0);
        HEAP32[$880>>2] = 0;
        HEAP32[$879>>2] = 0;
        $881 = HEAP32[(36504)>>2]|0;
        $882 = 1 << $$0296$i$i;
        $883 = $881 & $882;
        $884 = ($883|0)==(0);
        if ($884) {
         $885 = $881 | $882;
         HEAP32[(36504)>>2] = $885;
         HEAP32[$877>>2] = $722;
         $886 = ((($722)) + 24|0);
         HEAP32[$886>>2] = $877;
         $887 = ((($722)) + 12|0);
         HEAP32[$887>>2] = $722;
         $888 = ((($722)) + 8|0);
         HEAP32[$888>>2] = $722;
         break;
        }
        $889 = HEAP32[$877>>2]|0;
        $890 = ($$0296$i$i|0)==(31);
        $891 = $$0296$i$i >>> 1;
        $892 = (25 - ($891))|0;
        $893 = $890 ? 0 : $892;
        $894 = $$0287$i$i << $893;
        $$0288$i$i = $894;$$0289$i$i = $889;
        while(1) {
         $895 = ((($$0289$i$i)) + 4|0);
         $896 = HEAP32[$895>>2]|0;
         $897 = $896 & -8;
         $898 = ($897|0)==($$0287$i$i|0);
         if ($898) {
          label = 263;
          break;
         }
         $899 = $$0288$i$i >>> 31;
         $900 = (((($$0289$i$i)) + 16|0) + ($899<<2)|0);
         $901 = $$0288$i$i << 1;
         $902 = HEAP32[$900>>2]|0;
         $903 = ($902|0)==(0|0);
         if ($903) {
          label = 260;
          break;
         } else {
          $$0288$i$i = $901;$$0289$i$i = $902;
         }
        }
        if ((label|0) == 260) {
         $904 = HEAP32[(36516)>>2]|0;
         $905 = ($904>>>0)>($900>>>0);
         if ($905) {
          _abort();
          // unreachable;
         } else {
          HEAP32[$900>>2] = $722;
          $906 = ((($722)) + 24|0);
          HEAP32[$906>>2] = $$0289$i$i;
          $907 = ((($722)) + 12|0);
          HEAP32[$907>>2] = $722;
          $908 = ((($722)) + 8|0);
          HEAP32[$908>>2] = $722;
          break;
         }
        }
        else if ((label|0) == 263) {
         $909 = ((($$0289$i$i)) + 8|0);
         $910 = HEAP32[$909>>2]|0;
         $911 = HEAP32[(36516)>>2]|0;
         $912 = ($911>>>0)<=($$0289$i$i>>>0);
         $913 = ($911>>>0)<=($910>>>0);
         $914 = $913 & $912;
         if ($914) {
          $915 = ((($910)) + 12|0);
          HEAP32[$915>>2] = $722;
          HEAP32[$909>>2] = $722;
          $916 = ((($722)) + 8|0);
          HEAP32[$916>>2] = $910;
          $917 = ((($722)) + 12|0);
          HEAP32[$917>>2] = $$0289$i$i;
          $918 = ((($722)) + 24|0);
          HEAP32[$918>>2] = 0;
          break;
         } else {
          _abort();
          // unreachable;
         }
        }
       }
      } while(0);
      $1051 = ((($710)) + 8|0);
      $$0 = $1051;
      STACKTOP = sp;return ($$0|0);
     } else {
      $$0$i$i$i = (36948);
     }
    }
    while(1) {
     $919 = HEAP32[$$0$i$i$i>>2]|0;
     $920 = ($919>>>0)>($636>>>0);
     if (!($920)) {
      $921 = ((($$0$i$i$i)) + 4|0);
      $922 = HEAP32[$921>>2]|0;
      $923 = (($919) + ($922)|0);
      $924 = ($923>>>0)>($636>>>0);
      if ($924) {
       break;
      }
     }
     $925 = ((($$0$i$i$i)) + 8|0);
     $926 = HEAP32[$925>>2]|0;
     $$0$i$i$i = $926;
    }
    $927 = ((($923)) + -47|0);
    $928 = ((($927)) + 8|0);
    $929 = $928;
    $930 = $929 & 7;
    $931 = ($930|0)==(0);
    $932 = (0 - ($929))|0;
    $933 = $932 & 7;
    $934 = $931 ? 0 : $933;
    $935 = (($927) + ($934)|0);
    $936 = ((($636)) + 16|0);
    $937 = ($935>>>0)<($936>>>0);
    $938 = $937 ? $636 : $935;
    $939 = ((($938)) + 8|0);
    $940 = ((($938)) + 24|0);
    $941 = (($$723947$i) + -40)|0;
    $942 = ((($$748$i)) + 8|0);
    $943 = $942;
    $944 = $943 & 7;
    $945 = ($944|0)==(0);
    $946 = (0 - ($943))|0;
    $947 = $946 & 7;
    $948 = $945 ? 0 : $947;
    $949 = (($$748$i) + ($948)|0);
    $950 = (($941) - ($948))|0;
    HEAP32[(36524)>>2] = $949;
    HEAP32[(36512)>>2] = $950;
    $951 = $950 | 1;
    $952 = ((($949)) + 4|0);
    HEAP32[$952>>2] = $951;
    $953 = (($$748$i) + ($941)|0);
    $954 = ((($953)) + 4|0);
    HEAP32[$954>>2] = 40;
    $955 = HEAP32[(36988)>>2]|0;
    HEAP32[(36528)>>2] = $955;
    $956 = ((($938)) + 4|0);
    HEAP32[$956>>2] = 27;
    ;HEAP32[$939>>2]=HEAP32[(36948)>>2]|0;HEAP32[$939+4>>2]=HEAP32[(36948)+4>>2]|0;HEAP32[$939+8>>2]=HEAP32[(36948)+8>>2]|0;HEAP32[$939+12>>2]=HEAP32[(36948)+12>>2]|0;
    HEAP32[(36948)>>2] = $$748$i;
    HEAP32[(36952)>>2] = $$723947$i;
    HEAP32[(36960)>>2] = 0;
    HEAP32[(36956)>>2] = $939;
    $958 = $940;
    while(1) {
     $957 = ((($958)) + 4|0);
     HEAP32[$957>>2] = 7;
     $959 = ((($958)) + 8|0);
     $960 = ($959>>>0)<($923>>>0);
     if ($960) {
      $958 = $957;
     } else {
      break;
     }
    }
    $961 = ($938|0)==($636|0);
    if (!($961)) {
     $962 = $938;
     $963 = $636;
     $964 = (($962) - ($963))|0;
     $965 = HEAP32[$956>>2]|0;
     $966 = $965 & -2;
     HEAP32[$956>>2] = $966;
     $967 = $964 | 1;
     $968 = ((($636)) + 4|0);
     HEAP32[$968>>2] = $967;
     HEAP32[$938>>2] = $964;
     $969 = $964 >>> 3;
     $970 = ($964>>>0)<(256);
     if ($970) {
      $971 = $969 << 1;
      $972 = (36540 + ($971<<2)|0);
      $973 = HEAP32[9125]|0;
      $974 = 1 << $969;
      $975 = $973 & $974;
      $976 = ($975|0)==(0);
      if ($976) {
       $977 = $973 | $974;
       HEAP32[9125] = $977;
       $$pre$i$i = ((($972)) + 8|0);
       $$0211$i$i = $972;$$pre$phi$i$iZ2D = $$pre$i$i;
      } else {
       $978 = ((($972)) + 8|0);
       $979 = HEAP32[$978>>2]|0;
       $980 = HEAP32[(36516)>>2]|0;
       $981 = ($980>>>0)>($979>>>0);
       if ($981) {
        _abort();
        // unreachable;
       } else {
        $$0211$i$i = $979;$$pre$phi$i$iZ2D = $978;
       }
      }
      HEAP32[$$pre$phi$i$iZ2D>>2] = $636;
      $982 = ((($$0211$i$i)) + 12|0);
      HEAP32[$982>>2] = $636;
      $983 = ((($636)) + 8|0);
      HEAP32[$983>>2] = $$0211$i$i;
      $984 = ((($636)) + 12|0);
      HEAP32[$984>>2] = $972;
      break;
     }
     $985 = $964 >>> 8;
     $986 = ($985|0)==(0);
     if ($986) {
      $$0212$i$i = 0;
     } else {
      $987 = ($964>>>0)>(16777215);
      if ($987) {
       $$0212$i$i = 31;
      } else {
       $988 = (($985) + 1048320)|0;
       $989 = $988 >>> 16;
       $990 = $989 & 8;
       $991 = $985 << $990;
       $992 = (($991) + 520192)|0;
       $993 = $992 >>> 16;
       $994 = $993 & 4;
       $995 = $994 | $990;
       $996 = $991 << $994;
       $997 = (($996) + 245760)|0;
       $998 = $997 >>> 16;
       $999 = $998 & 2;
       $1000 = $995 | $999;
       $1001 = (14 - ($1000))|0;
       $1002 = $996 << $999;
       $1003 = $1002 >>> 15;
       $1004 = (($1001) + ($1003))|0;
       $1005 = $1004 << 1;
       $1006 = (($1004) + 7)|0;
       $1007 = $964 >>> $1006;
       $1008 = $1007 & 1;
       $1009 = $1008 | $1005;
       $$0212$i$i = $1009;
      }
     }
     $1010 = (36804 + ($$0212$i$i<<2)|0);
     $1011 = ((($636)) + 28|0);
     HEAP32[$1011>>2] = $$0212$i$i;
     $1012 = ((($636)) + 20|0);
     HEAP32[$1012>>2] = 0;
     HEAP32[$936>>2] = 0;
     $1013 = HEAP32[(36504)>>2]|0;
     $1014 = 1 << $$0212$i$i;
     $1015 = $1013 & $1014;
     $1016 = ($1015|0)==(0);
     if ($1016) {
      $1017 = $1013 | $1014;
      HEAP32[(36504)>>2] = $1017;
      HEAP32[$1010>>2] = $636;
      $1018 = ((($636)) + 24|0);
      HEAP32[$1018>>2] = $1010;
      $1019 = ((($636)) + 12|0);
      HEAP32[$1019>>2] = $636;
      $1020 = ((($636)) + 8|0);
      HEAP32[$1020>>2] = $636;
      break;
     }
     $1021 = HEAP32[$1010>>2]|0;
     $1022 = ($$0212$i$i|0)==(31);
     $1023 = $$0212$i$i >>> 1;
     $1024 = (25 - ($1023))|0;
     $1025 = $1022 ? 0 : $1024;
     $1026 = $964 << $1025;
     $$0206$i$i = $1026;$$0207$i$i = $1021;
     while(1) {
      $1027 = ((($$0207$i$i)) + 4|0);
      $1028 = HEAP32[$1027>>2]|0;
      $1029 = $1028 & -8;
      $1030 = ($1029|0)==($964|0);
      if ($1030) {
       label = 289;
       break;
      }
      $1031 = $$0206$i$i >>> 31;
      $1032 = (((($$0207$i$i)) + 16|0) + ($1031<<2)|0);
      $1033 = $$0206$i$i << 1;
      $1034 = HEAP32[$1032>>2]|0;
      $1035 = ($1034|0)==(0|0);
      if ($1035) {
       label = 286;
       break;
      } else {
       $$0206$i$i = $1033;$$0207$i$i = $1034;
      }
     }
     if ((label|0) == 286) {
      $1036 = HEAP32[(36516)>>2]|0;
      $1037 = ($1036>>>0)>($1032>>>0);
      if ($1037) {
       _abort();
       // unreachable;
      } else {
       HEAP32[$1032>>2] = $636;
       $1038 = ((($636)) + 24|0);
       HEAP32[$1038>>2] = $$0207$i$i;
       $1039 = ((($636)) + 12|0);
       HEAP32[$1039>>2] = $636;
       $1040 = ((($636)) + 8|0);
       HEAP32[$1040>>2] = $636;
       break;
      }
     }
     else if ((label|0) == 289) {
      $1041 = ((($$0207$i$i)) + 8|0);
      $1042 = HEAP32[$1041>>2]|0;
      $1043 = HEAP32[(36516)>>2]|0;
      $1044 = ($1043>>>0)<=($$0207$i$i>>>0);
      $1045 = ($1043>>>0)<=($1042>>>0);
      $1046 = $1045 & $1044;
      if ($1046) {
       $1047 = ((($1042)) + 12|0);
       HEAP32[$1047>>2] = $636;
       HEAP32[$1041>>2] = $636;
       $1048 = ((($636)) + 8|0);
       HEAP32[$1048>>2] = $1042;
       $1049 = ((($636)) + 12|0);
       HEAP32[$1049>>2] = $$0207$i$i;
       $1050 = ((($636)) + 24|0);
       HEAP32[$1050>>2] = 0;
       break;
      } else {
       _abort();
       // unreachable;
      }
     }
    }
   }
  } while(0);
  $1052 = HEAP32[(36512)>>2]|0;
  $1053 = ($1052>>>0)>($$0197>>>0);
  if ($1053) {
   $1054 = (($1052) - ($$0197))|0;
   HEAP32[(36512)>>2] = $1054;
   $1055 = HEAP32[(36524)>>2]|0;
   $1056 = (($1055) + ($$0197)|0);
   HEAP32[(36524)>>2] = $1056;
   $1057 = $1054 | 1;
   $1058 = ((($1056)) + 4|0);
   HEAP32[$1058>>2] = $1057;
   $1059 = $$0197 | 3;
   $1060 = ((($1055)) + 4|0);
   HEAP32[$1060>>2] = $1059;
   $1061 = ((($1055)) + 8|0);
   $$0 = $1061;
   STACKTOP = sp;return ($$0|0);
  }
 }
 $1062 = (___errno_location()|0);
 HEAP32[$1062>>2] = 12;
 $$0 = 0;
 STACKTOP = sp;return ($$0|0);
}
function _free($0) {
 $0 = $0|0;
 var $$0212$i = 0, $$0212$in$i = 0, $$0383 = 0, $$0384 = 0, $$0396 = 0, $$0403 = 0, $$1 = 0, $$1382 = 0, $$1387 = 0, $$1390 = 0, $$1398 = 0, $$1402 = 0, $$2 = 0, $$3 = 0, $$3400 = 0, $$pre = 0, $$pre$phi442Z2D = 0, $$pre$phi444Z2D = 0, $$pre$phiZ2D = 0, $$pre441 = 0;
 var $$pre443 = 0, $$sink3 = 0, $$sink5 = 0, $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0;
 var $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0;
 var $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0;
 var $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0;
 var $169 = 0, $17 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0;
 var $187 = 0, $188 = 0, $189 = 0, $19 = 0, $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $2 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0;
 var $204 = 0, $205 = 0, $206 = 0, $207 = 0, $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $218 = 0, $219 = 0, $22 = 0, $220 = 0, $221 = 0;
 var $222 = 0, $223 = 0, $224 = 0, $225 = 0, $226 = 0, $227 = 0, $228 = 0, $229 = 0, $23 = 0, $230 = 0, $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0;
 var $240 = 0, $241 = 0, $242 = 0, $243 = 0, $244 = 0, $245 = 0, $246 = 0, $247 = 0, $248 = 0, $249 = 0, $25 = 0, $250 = 0, $251 = 0, $252 = 0, $253 = 0, $254 = 0, $255 = 0, $256 = 0, $257 = 0, $258 = 0;
 var $259 = 0, $26 = 0, $260 = 0, $261 = 0, $262 = 0, $263 = 0, $264 = 0, $265 = 0, $266 = 0, $267 = 0, $268 = 0, $269 = 0, $27 = 0, $270 = 0, $271 = 0, $272 = 0, $273 = 0, $274 = 0, $275 = 0, $276 = 0;
 var $277 = 0, $278 = 0, $279 = 0, $28 = 0, $280 = 0, $281 = 0, $282 = 0, $283 = 0, $284 = 0, $285 = 0, $286 = 0, $287 = 0, $288 = 0, $289 = 0, $29 = 0, $290 = 0, $291 = 0, $292 = 0, $293 = 0, $294 = 0;
 var $295 = 0, $296 = 0, $297 = 0, $298 = 0, $299 = 0, $3 = 0, $30 = 0, $300 = 0, $301 = 0, $302 = 0, $303 = 0, $304 = 0, $305 = 0, $306 = 0, $307 = 0, $308 = 0, $309 = 0, $31 = 0, $310 = 0, $311 = 0;
 var $312 = 0, $313 = 0, $314 = 0, $315 = 0, $316 = 0, $317 = 0, $318 = 0, $319 = 0, $32 = 0, $320 = 0, $321 = 0, $322 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0;
 var $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0;
 var $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0;
 var $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0;
 var $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $cond421 = 0, $cond422 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ($0|0)==(0|0);
 if ($1) {
  return;
 }
 $2 = ((($0)) + -8|0);
 $3 = HEAP32[(36516)>>2]|0;
 $4 = ($2>>>0)<($3>>>0);
 if ($4) {
  _abort();
  // unreachable;
 }
 $5 = ((($0)) + -4|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = $6 & 3;
 $8 = ($7|0)==(1);
 if ($8) {
  _abort();
  // unreachable;
 }
 $9 = $6 & -8;
 $10 = (($2) + ($9)|0);
 $11 = $6 & 1;
 $12 = ($11|0)==(0);
 L10: do {
  if ($12) {
   $13 = HEAP32[$2>>2]|0;
   $14 = ($7|0)==(0);
   if ($14) {
    return;
   }
   $15 = (0 - ($13))|0;
   $16 = (($2) + ($15)|0);
   $17 = (($13) + ($9))|0;
   $18 = ($16>>>0)<($3>>>0);
   if ($18) {
    _abort();
    // unreachable;
   }
   $19 = HEAP32[(36520)>>2]|0;
   $20 = ($19|0)==($16|0);
   if ($20) {
    $105 = ((($10)) + 4|0);
    $106 = HEAP32[$105>>2]|0;
    $107 = $106 & 3;
    $108 = ($107|0)==(3);
    if (!($108)) {
     $$1 = $16;$$1382 = $17;$114 = $16;
     break;
    }
    HEAP32[(36508)>>2] = $17;
    $109 = $106 & -2;
    HEAP32[$105>>2] = $109;
    $110 = $17 | 1;
    $111 = ((($16)) + 4|0);
    HEAP32[$111>>2] = $110;
    $112 = (($16) + ($17)|0);
    HEAP32[$112>>2] = $17;
    return;
   }
   $21 = $13 >>> 3;
   $22 = ($13>>>0)<(256);
   if ($22) {
    $23 = ((($16)) + 8|0);
    $24 = HEAP32[$23>>2]|0;
    $25 = ((($16)) + 12|0);
    $26 = HEAP32[$25>>2]|0;
    $27 = $21 << 1;
    $28 = (36540 + ($27<<2)|0);
    $29 = ($24|0)==($28|0);
    if (!($29)) {
     $30 = ($3>>>0)>($24>>>0);
     if ($30) {
      _abort();
      // unreachable;
     }
     $31 = ((($24)) + 12|0);
     $32 = HEAP32[$31>>2]|0;
     $33 = ($32|0)==($16|0);
     if (!($33)) {
      _abort();
      // unreachable;
     }
    }
    $34 = ($26|0)==($24|0);
    if ($34) {
     $35 = 1 << $21;
     $36 = $35 ^ -1;
     $37 = HEAP32[9125]|0;
     $38 = $37 & $36;
     HEAP32[9125] = $38;
     $$1 = $16;$$1382 = $17;$114 = $16;
     break;
    }
    $39 = ($26|0)==($28|0);
    if ($39) {
     $$pre443 = ((($26)) + 8|0);
     $$pre$phi444Z2D = $$pre443;
    } else {
     $40 = ($3>>>0)>($26>>>0);
     if ($40) {
      _abort();
      // unreachable;
     }
     $41 = ((($26)) + 8|0);
     $42 = HEAP32[$41>>2]|0;
     $43 = ($42|0)==($16|0);
     if ($43) {
      $$pre$phi444Z2D = $41;
     } else {
      _abort();
      // unreachable;
     }
    }
    $44 = ((($24)) + 12|0);
    HEAP32[$44>>2] = $26;
    HEAP32[$$pre$phi444Z2D>>2] = $24;
    $$1 = $16;$$1382 = $17;$114 = $16;
    break;
   }
   $45 = ((($16)) + 24|0);
   $46 = HEAP32[$45>>2]|0;
   $47 = ((($16)) + 12|0);
   $48 = HEAP32[$47>>2]|0;
   $49 = ($48|0)==($16|0);
   do {
    if ($49) {
     $59 = ((($16)) + 16|0);
     $60 = ((($59)) + 4|0);
     $61 = HEAP32[$60>>2]|0;
     $62 = ($61|0)==(0|0);
     if ($62) {
      $63 = HEAP32[$59>>2]|0;
      $64 = ($63|0)==(0|0);
      if ($64) {
       $$3 = 0;
       break;
      } else {
       $$1387 = $63;$$1390 = $59;
      }
     } else {
      $$1387 = $61;$$1390 = $60;
     }
     while(1) {
      $65 = ((($$1387)) + 20|0);
      $66 = HEAP32[$65>>2]|0;
      $67 = ($66|0)==(0|0);
      if (!($67)) {
       $$1387 = $66;$$1390 = $65;
       continue;
      }
      $68 = ((($$1387)) + 16|0);
      $69 = HEAP32[$68>>2]|0;
      $70 = ($69|0)==(0|0);
      if ($70) {
       break;
      } else {
       $$1387 = $69;$$1390 = $68;
      }
     }
     $71 = ($3>>>0)>($$1390>>>0);
     if ($71) {
      _abort();
      // unreachable;
     } else {
      HEAP32[$$1390>>2] = 0;
      $$3 = $$1387;
      break;
     }
    } else {
     $50 = ((($16)) + 8|0);
     $51 = HEAP32[$50>>2]|0;
     $52 = ($3>>>0)>($51>>>0);
     if ($52) {
      _abort();
      // unreachable;
     }
     $53 = ((($51)) + 12|0);
     $54 = HEAP32[$53>>2]|0;
     $55 = ($54|0)==($16|0);
     if (!($55)) {
      _abort();
      // unreachable;
     }
     $56 = ((($48)) + 8|0);
     $57 = HEAP32[$56>>2]|0;
     $58 = ($57|0)==($16|0);
     if ($58) {
      HEAP32[$53>>2] = $48;
      HEAP32[$56>>2] = $51;
      $$3 = $48;
      break;
     } else {
      _abort();
      // unreachable;
     }
    }
   } while(0);
   $72 = ($46|0)==(0|0);
   if ($72) {
    $$1 = $16;$$1382 = $17;$114 = $16;
   } else {
    $73 = ((($16)) + 28|0);
    $74 = HEAP32[$73>>2]|0;
    $75 = (36804 + ($74<<2)|0);
    $76 = HEAP32[$75>>2]|0;
    $77 = ($76|0)==($16|0);
    do {
     if ($77) {
      HEAP32[$75>>2] = $$3;
      $cond421 = ($$3|0)==(0|0);
      if ($cond421) {
       $78 = 1 << $74;
       $79 = $78 ^ -1;
       $80 = HEAP32[(36504)>>2]|0;
       $81 = $80 & $79;
       HEAP32[(36504)>>2] = $81;
       $$1 = $16;$$1382 = $17;$114 = $16;
       break L10;
      }
     } else {
      $82 = HEAP32[(36516)>>2]|0;
      $83 = ($82>>>0)>($46>>>0);
      if ($83) {
       _abort();
       // unreachable;
      } else {
       $84 = ((($46)) + 16|0);
       $85 = HEAP32[$84>>2]|0;
       $86 = ($85|0)!=($16|0);
       $$sink3 = $86&1;
       $87 = (((($46)) + 16|0) + ($$sink3<<2)|0);
       HEAP32[$87>>2] = $$3;
       $88 = ($$3|0)==(0|0);
       if ($88) {
        $$1 = $16;$$1382 = $17;$114 = $16;
        break L10;
       } else {
        break;
       }
      }
     }
    } while(0);
    $89 = HEAP32[(36516)>>2]|0;
    $90 = ($89>>>0)>($$3>>>0);
    if ($90) {
     _abort();
     // unreachable;
    }
    $91 = ((($$3)) + 24|0);
    HEAP32[$91>>2] = $46;
    $92 = ((($16)) + 16|0);
    $93 = HEAP32[$92>>2]|0;
    $94 = ($93|0)==(0|0);
    do {
     if (!($94)) {
      $95 = ($89>>>0)>($93>>>0);
      if ($95) {
       _abort();
       // unreachable;
      } else {
       $96 = ((($$3)) + 16|0);
       HEAP32[$96>>2] = $93;
       $97 = ((($93)) + 24|0);
       HEAP32[$97>>2] = $$3;
       break;
      }
     }
    } while(0);
    $98 = ((($92)) + 4|0);
    $99 = HEAP32[$98>>2]|0;
    $100 = ($99|0)==(0|0);
    if ($100) {
     $$1 = $16;$$1382 = $17;$114 = $16;
    } else {
     $101 = HEAP32[(36516)>>2]|0;
     $102 = ($101>>>0)>($99>>>0);
     if ($102) {
      _abort();
      // unreachable;
     } else {
      $103 = ((($$3)) + 20|0);
      HEAP32[$103>>2] = $99;
      $104 = ((($99)) + 24|0);
      HEAP32[$104>>2] = $$3;
      $$1 = $16;$$1382 = $17;$114 = $16;
      break;
     }
    }
   }
  } else {
   $$1 = $2;$$1382 = $9;$114 = $2;
  }
 } while(0);
 $113 = ($114>>>0)<($10>>>0);
 if (!($113)) {
  _abort();
  // unreachable;
 }
 $115 = ((($10)) + 4|0);
 $116 = HEAP32[$115>>2]|0;
 $117 = $116 & 1;
 $118 = ($117|0)==(0);
 if ($118) {
  _abort();
  // unreachable;
 }
 $119 = $116 & 2;
 $120 = ($119|0)==(0);
 if ($120) {
  $121 = HEAP32[(36524)>>2]|0;
  $122 = ($121|0)==($10|0);
  if ($122) {
   $123 = HEAP32[(36512)>>2]|0;
   $124 = (($123) + ($$1382))|0;
   HEAP32[(36512)>>2] = $124;
   HEAP32[(36524)>>2] = $$1;
   $125 = $124 | 1;
   $126 = ((($$1)) + 4|0);
   HEAP32[$126>>2] = $125;
   $127 = HEAP32[(36520)>>2]|0;
   $128 = ($$1|0)==($127|0);
   if (!($128)) {
    return;
   }
   HEAP32[(36520)>>2] = 0;
   HEAP32[(36508)>>2] = 0;
   return;
  }
  $129 = HEAP32[(36520)>>2]|0;
  $130 = ($129|0)==($10|0);
  if ($130) {
   $131 = HEAP32[(36508)>>2]|0;
   $132 = (($131) + ($$1382))|0;
   HEAP32[(36508)>>2] = $132;
   HEAP32[(36520)>>2] = $114;
   $133 = $132 | 1;
   $134 = ((($$1)) + 4|0);
   HEAP32[$134>>2] = $133;
   $135 = (($114) + ($132)|0);
   HEAP32[$135>>2] = $132;
   return;
  }
  $136 = $116 & -8;
  $137 = (($136) + ($$1382))|0;
  $138 = $116 >>> 3;
  $139 = ($116>>>0)<(256);
  L108: do {
   if ($139) {
    $140 = ((($10)) + 8|0);
    $141 = HEAP32[$140>>2]|0;
    $142 = ((($10)) + 12|0);
    $143 = HEAP32[$142>>2]|0;
    $144 = $138 << 1;
    $145 = (36540 + ($144<<2)|0);
    $146 = ($141|0)==($145|0);
    if (!($146)) {
     $147 = HEAP32[(36516)>>2]|0;
     $148 = ($147>>>0)>($141>>>0);
     if ($148) {
      _abort();
      // unreachable;
     }
     $149 = ((($141)) + 12|0);
     $150 = HEAP32[$149>>2]|0;
     $151 = ($150|0)==($10|0);
     if (!($151)) {
      _abort();
      // unreachable;
     }
    }
    $152 = ($143|0)==($141|0);
    if ($152) {
     $153 = 1 << $138;
     $154 = $153 ^ -1;
     $155 = HEAP32[9125]|0;
     $156 = $155 & $154;
     HEAP32[9125] = $156;
     break;
    }
    $157 = ($143|0)==($145|0);
    if ($157) {
     $$pre441 = ((($143)) + 8|0);
     $$pre$phi442Z2D = $$pre441;
    } else {
     $158 = HEAP32[(36516)>>2]|0;
     $159 = ($158>>>0)>($143>>>0);
     if ($159) {
      _abort();
      // unreachable;
     }
     $160 = ((($143)) + 8|0);
     $161 = HEAP32[$160>>2]|0;
     $162 = ($161|0)==($10|0);
     if ($162) {
      $$pre$phi442Z2D = $160;
     } else {
      _abort();
      // unreachable;
     }
    }
    $163 = ((($141)) + 12|0);
    HEAP32[$163>>2] = $143;
    HEAP32[$$pre$phi442Z2D>>2] = $141;
   } else {
    $164 = ((($10)) + 24|0);
    $165 = HEAP32[$164>>2]|0;
    $166 = ((($10)) + 12|0);
    $167 = HEAP32[$166>>2]|0;
    $168 = ($167|0)==($10|0);
    do {
     if ($168) {
      $179 = ((($10)) + 16|0);
      $180 = ((($179)) + 4|0);
      $181 = HEAP32[$180>>2]|0;
      $182 = ($181|0)==(0|0);
      if ($182) {
       $183 = HEAP32[$179>>2]|0;
       $184 = ($183|0)==(0|0);
       if ($184) {
        $$3400 = 0;
        break;
       } else {
        $$1398 = $183;$$1402 = $179;
       }
      } else {
       $$1398 = $181;$$1402 = $180;
      }
      while(1) {
       $185 = ((($$1398)) + 20|0);
       $186 = HEAP32[$185>>2]|0;
       $187 = ($186|0)==(0|0);
       if (!($187)) {
        $$1398 = $186;$$1402 = $185;
        continue;
       }
       $188 = ((($$1398)) + 16|0);
       $189 = HEAP32[$188>>2]|0;
       $190 = ($189|0)==(0|0);
       if ($190) {
        break;
       } else {
        $$1398 = $189;$$1402 = $188;
       }
      }
      $191 = HEAP32[(36516)>>2]|0;
      $192 = ($191>>>0)>($$1402>>>0);
      if ($192) {
       _abort();
       // unreachable;
      } else {
       HEAP32[$$1402>>2] = 0;
       $$3400 = $$1398;
       break;
      }
     } else {
      $169 = ((($10)) + 8|0);
      $170 = HEAP32[$169>>2]|0;
      $171 = HEAP32[(36516)>>2]|0;
      $172 = ($171>>>0)>($170>>>0);
      if ($172) {
       _abort();
       // unreachable;
      }
      $173 = ((($170)) + 12|0);
      $174 = HEAP32[$173>>2]|0;
      $175 = ($174|0)==($10|0);
      if (!($175)) {
       _abort();
       // unreachable;
      }
      $176 = ((($167)) + 8|0);
      $177 = HEAP32[$176>>2]|0;
      $178 = ($177|0)==($10|0);
      if ($178) {
       HEAP32[$173>>2] = $167;
       HEAP32[$176>>2] = $170;
       $$3400 = $167;
       break;
      } else {
       _abort();
       // unreachable;
      }
     }
    } while(0);
    $193 = ($165|0)==(0|0);
    if (!($193)) {
     $194 = ((($10)) + 28|0);
     $195 = HEAP32[$194>>2]|0;
     $196 = (36804 + ($195<<2)|0);
     $197 = HEAP32[$196>>2]|0;
     $198 = ($197|0)==($10|0);
     do {
      if ($198) {
       HEAP32[$196>>2] = $$3400;
       $cond422 = ($$3400|0)==(0|0);
       if ($cond422) {
        $199 = 1 << $195;
        $200 = $199 ^ -1;
        $201 = HEAP32[(36504)>>2]|0;
        $202 = $201 & $200;
        HEAP32[(36504)>>2] = $202;
        break L108;
       }
      } else {
       $203 = HEAP32[(36516)>>2]|0;
       $204 = ($203>>>0)>($165>>>0);
       if ($204) {
        _abort();
        // unreachable;
       } else {
        $205 = ((($165)) + 16|0);
        $206 = HEAP32[$205>>2]|0;
        $207 = ($206|0)!=($10|0);
        $$sink5 = $207&1;
        $208 = (((($165)) + 16|0) + ($$sink5<<2)|0);
        HEAP32[$208>>2] = $$3400;
        $209 = ($$3400|0)==(0|0);
        if ($209) {
         break L108;
        } else {
         break;
        }
       }
      }
     } while(0);
     $210 = HEAP32[(36516)>>2]|0;
     $211 = ($210>>>0)>($$3400>>>0);
     if ($211) {
      _abort();
      // unreachable;
     }
     $212 = ((($$3400)) + 24|0);
     HEAP32[$212>>2] = $165;
     $213 = ((($10)) + 16|0);
     $214 = HEAP32[$213>>2]|0;
     $215 = ($214|0)==(0|0);
     do {
      if (!($215)) {
       $216 = ($210>>>0)>($214>>>0);
       if ($216) {
        _abort();
        // unreachable;
       } else {
        $217 = ((($$3400)) + 16|0);
        HEAP32[$217>>2] = $214;
        $218 = ((($214)) + 24|0);
        HEAP32[$218>>2] = $$3400;
        break;
       }
      }
     } while(0);
     $219 = ((($213)) + 4|0);
     $220 = HEAP32[$219>>2]|0;
     $221 = ($220|0)==(0|0);
     if (!($221)) {
      $222 = HEAP32[(36516)>>2]|0;
      $223 = ($222>>>0)>($220>>>0);
      if ($223) {
       _abort();
       // unreachable;
      } else {
       $224 = ((($$3400)) + 20|0);
       HEAP32[$224>>2] = $220;
       $225 = ((($220)) + 24|0);
       HEAP32[$225>>2] = $$3400;
       break;
      }
     }
    }
   }
  } while(0);
  $226 = $137 | 1;
  $227 = ((($$1)) + 4|0);
  HEAP32[$227>>2] = $226;
  $228 = (($114) + ($137)|0);
  HEAP32[$228>>2] = $137;
  $229 = HEAP32[(36520)>>2]|0;
  $230 = ($$1|0)==($229|0);
  if ($230) {
   HEAP32[(36508)>>2] = $137;
   return;
  } else {
   $$2 = $137;
  }
 } else {
  $231 = $116 & -2;
  HEAP32[$115>>2] = $231;
  $232 = $$1382 | 1;
  $233 = ((($$1)) + 4|0);
  HEAP32[$233>>2] = $232;
  $234 = (($114) + ($$1382)|0);
  HEAP32[$234>>2] = $$1382;
  $$2 = $$1382;
 }
 $235 = $$2 >>> 3;
 $236 = ($$2>>>0)<(256);
 if ($236) {
  $237 = $235 << 1;
  $238 = (36540 + ($237<<2)|0);
  $239 = HEAP32[9125]|0;
  $240 = 1 << $235;
  $241 = $239 & $240;
  $242 = ($241|0)==(0);
  if ($242) {
   $243 = $239 | $240;
   HEAP32[9125] = $243;
   $$pre = ((($238)) + 8|0);
   $$0403 = $238;$$pre$phiZ2D = $$pre;
  } else {
   $244 = ((($238)) + 8|0);
   $245 = HEAP32[$244>>2]|0;
   $246 = HEAP32[(36516)>>2]|0;
   $247 = ($246>>>0)>($245>>>0);
   if ($247) {
    _abort();
    // unreachable;
   } else {
    $$0403 = $245;$$pre$phiZ2D = $244;
   }
  }
  HEAP32[$$pre$phiZ2D>>2] = $$1;
  $248 = ((($$0403)) + 12|0);
  HEAP32[$248>>2] = $$1;
  $249 = ((($$1)) + 8|0);
  HEAP32[$249>>2] = $$0403;
  $250 = ((($$1)) + 12|0);
  HEAP32[$250>>2] = $238;
  return;
 }
 $251 = $$2 >>> 8;
 $252 = ($251|0)==(0);
 if ($252) {
  $$0396 = 0;
 } else {
  $253 = ($$2>>>0)>(16777215);
  if ($253) {
   $$0396 = 31;
  } else {
   $254 = (($251) + 1048320)|0;
   $255 = $254 >>> 16;
   $256 = $255 & 8;
   $257 = $251 << $256;
   $258 = (($257) + 520192)|0;
   $259 = $258 >>> 16;
   $260 = $259 & 4;
   $261 = $260 | $256;
   $262 = $257 << $260;
   $263 = (($262) + 245760)|0;
   $264 = $263 >>> 16;
   $265 = $264 & 2;
   $266 = $261 | $265;
   $267 = (14 - ($266))|0;
   $268 = $262 << $265;
   $269 = $268 >>> 15;
   $270 = (($267) + ($269))|0;
   $271 = $270 << 1;
   $272 = (($270) + 7)|0;
   $273 = $$2 >>> $272;
   $274 = $273 & 1;
   $275 = $274 | $271;
   $$0396 = $275;
  }
 }
 $276 = (36804 + ($$0396<<2)|0);
 $277 = ((($$1)) + 28|0);
 HEAP32[$277>>2] = $$0396;
 $278 = ((($$1)) + 16|0);
 $279 = ((($$1)) + 20|0);
 HEAP32[$279>>2] = 0;
 HEAP32[$278>>2] = 0;
 $280 = HEAP32[(36504)>>2]|0;
 $281 = 1 << $$0396;
 $282 = $280 & $281;
 $283 = ($282|0)==(0);
 do {
  if ($283) {
   $284 = $280 | $281;
   HEAP32[(36504)>>2] = $284;
   HEAP32[$276>>2] = $$1;
   $285 = ((($$1)) + 24|0);
   HEAP32[$285>>2] = $276;
   $286 = ((($$1)) + 12|0);
   HEAP32[$286>>2] = $$1;
   $287 = ((($$1)) + 8|0);
   HEAP32[$287>>2] = $$1;
  } else {
   $288 = HEAP32[$276>>2]|0;
   $289 = ($$0396|0)==(31);
   $290 = $$0396 >>> 1;
   $291 = (25 - ($290))|0;
   $292 = $289 ? 0 : $291;
   $293 = $$2 << $292;
   $$0383 = $293;$$0384 = $288;
   while(1) {
    $294 = ((($$0384)) + 4|0);
    $295 = HEAP32[$294>>2]|0;
    $296 = $295 & -8;
    $297 = ($296|0)==($$2|0);
    if ($297) {
     label = 124;
     break;
    }
    $298 = $$0383 >>> 31;
    $299 = (((($$0384)) + 16|0) + ($298<<2)|0);
    $300 = $$0383 << 1;
    $301 = HEAP32[$299>>2]|0;
    $302 = ($301|0)==(0|0);
    if ($302) {
     label = 121;
     break;
    } else {
     $$0383 = $300;$$0384 = $301;
    }
   }
   if ((label|0) == 121) {
    $303 = HEAP32[(36516)>>2]|0;
    $304 = ($303>>>0)>($299>>>0);
    if ($304) {
     _abort();
     // unreachable;
    } else {
     HEAP32[$299>>2] = $$1;
     $305 = ((($$1)) + 24|0);
     HEAP32[$305>>2] = $$0384;
     $306 = ((($$1)) + 12|0);
     HEAP32[$306>>2] = $$1;
     $307 = ((($$1)) + 8|0);
     HEAP32[$307>>2] = $$1;
     break;
    }
   }
   else if ((label|0) == 124) {
    $308 = ((($$0384)) + 8|0);
    $309 = HEAP32[$308>>2]|0;
    $310 = HEAP32[(36516)>>2]|0;
    $311 = ($310>>>0)<=($$0384>>>0);
    $312 = ($310>>>0)<=($309>>>0);
    $313 = $312 & $311;
    if ($313) {
     $314 = ((($309)) + 12|0);
     HEAP32[$314>>2] = $$1;
     HEAP32[$308>>2] = $$1;
     $315 = ((($$1)) + 8|0);
     HEAP32[$315>>2] = $309;
     $316 = ((($$1)) + 12|0);
     HEAP32[$316>>2] = $$0384;
     $317 = ((($$1)) + 24|0);
     HEAP32[$317>>2] = 0;
     break;
    } else {
     _abort();
     // unreachable;
    }
   }
  }
 } while(0);
 $318 = HEAP32[(36532)>>2]|0;
 $319 = (($318) + -1)|0;
 HEAP32[(36532)>>2] = $319;
 $320 = ($319|0)==(0);
 if ($320) {
  $$0212$in$i = (36956);
 } else {
  return;
 }
 while(1) {
  $$0212$i = HEAP32[$$0212$in$i>>2]|0;
  $321 = ($$0212$i|0)==(0|0);
  $322 = ((($$0212$i)) + 8|0);
  if ($321) {
   break;
  } else {
   $$0212$in$i = $322;
  }
 }
 HEAP32[(36532)>>2] = -1;
 return;
}
function ___stdio_close($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $vararg_buffer = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $vararg_buffer = sp;
 $1 = ((($0)) + 60|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = (_dummy_733($2)|0);
 HEAP32[$vararg_buffer>>2] = $3;
 $4 = (___syscall6(6,($vararg_buffer|0))|0);
 $5 = (___syscall_ret($4)|0);
 STACKTOP = sp;return ($5|0);
}
function ___stdio_write($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$0 = 0, $$04756 = 0, $$04855 = 0, $$04954 = 0, $$051 = 0, $$1 = 0, $$150 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0;
 var $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0;
 var $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $vararg_buffer = 0, $vararg_buffer3 = 0, $vararg_ptr1 = 0, $vararg_ptr2 = 0;
 var $vararg_ptr6 = 0, $vararg_ptr7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 48|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(48|0);
 $vararg_buffer3 = sp + 16|0;
 $vararg_buffer = sp;
 $3 = sp + 32|0;
 $4 = ((($0)) + 28|0);
 $5 = HEAP32[$4>>2]|0;
 HEAP32[$3>>2] = $5;
 $6 = ((($3)) + 4|0);
 $7 = ((($0)) + 20|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = (($8) - ($5))|0;
 HEAP32[$6>>2] = $9;
 $10 = ((($3)) + 8|0);
 HEAP32[$10>>2] = $1;
 $11 = ((($3)) + 12|0);
 HEAP32[$11>>2] = $2;
 $12 = (($9) + ($2))|0;
 $13 = ((($0)) + 60|0);
 $14 = HEAP32[$13>>2]|0;
 $15 = $3;
 HEAP32[$vararg_buffer>>2] = $14;
 $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
 HEAP32[$vararg_ptr1>>2] = $15;
 $vararg_ptr2 = ((($vararg_buffer)) + 8|0);
 HEAP32[$vararg_ptr2>>2] = 2;
 $16 = (___syscall146(146,($vararg_buffer|0))|0);
 $17 = (___syscall_ret($16)|0);
 $18 = ($12|0)==($17|0);
 L1: do {
  if ($18) {
   label = 3;
  } else {
   $$04756 = 2;$$04855 = $12;$$04954 = $3;$27 = $17;
   while(1) {
    $26 = ($27|0)<(0);
    if ($26) {
     break;
    }
    $35 = (($$04855) - ($27))|0;
    $36 = ((($$04954)) + 4|0);
    $37 = HEAP32[$36>>2]|0;
    $38 = ($27>>>0)>($37>>>0);
    $39 = ((($$04954)) + 8|0);
    $$150 = $38 ? $39 : $$04954;
    $40 = $38 << 31 >> 31;
    $$1 = (($$04756) + ($40))|0;
    $41 = $38 ? $37 : 0;
    $$0 = (($27) - ($41))|0;
    $42 = HEAP32[$$150>>2]|0;
    $43 = (($42) + ($$0)|0);
    HEAP32[$$150>>2] = $43;
    $44 = ((($$150)) + 4|0);
    $45 = HEAP32[$44>>2]|0;
    $46 = (($45) - ($$0))|0;
    HEAP32[$44>>2] = $46;
    $47 = HEAP32[$13>>2]|0;
    $48 = $$150;
    HEAP32[$vararg_buffer3>>2] = $47;
    $vararg_ptr6 = ((($vararg_buffer3)) + 4|0);
    HEAP32[$vararg_ptr6>>2] = $48;
    $vararg_ptr7 = ((($vararg_buffer3)) + 8|0);
    HEAP32[$vararg_ptr7>>2] = $$1;
    $49 = (___syscall146(146,($vararg_buffer3|0))|0);
    $50 = (___syscall_ret($49)|0);
    $51 = ($35|0)==($50|0);
    if ($51) {
     label = 3;
     break L1;
    } else {
     $$04756 = $$1;$$04855 = $35;$$04954 = $$150;$27 = $50;
    }
   }
   $28 = ((($0)) + 16|0);
   HEAP32[$28>>2] = 0;
   HEAP32[$4>>2] = 0;
   HEAP32[$7>>2] = 0;
   $29 = HEAP32[$0>>2]|0;
   $30 = $29 | 32;
   HEAP32[$0>>2] = $30;
   $31 = ($$04756|0)==(2);
   if ($31) {
    $$051 = 0;
   } else {
    $32 = ((($$04954)) + 4|0);
    $33 = HEAP32[$32>>2]|0;
    $34 = (($2) - ($33))|0;
    $$051 = $34;
   }
  }
 } while(0);
 if ((label|0) == 3) {
  $19 = ((($0)) + 44|0);
  $20 = HEAP32[$19>>2]|0;
  $21 = ((($0)) + 48|0);
  $22 = HEAP32[$21>>2]|0;
  $23 = (($20) + ($22)|0);
  $24 = ((($0)) + 16|0);
  HEAP32[$24>>2] = $23;
  $25 = $20;
  HEAP32[$4>>2] = $25;
  HEAP32[$7>>2] = $25;
  $$051 = $2;
 }
 STACKTOP = sp;return ($$051|0);
}
function ___stdio_seek($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$pre = 0, $10 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $vararg_buffer = 0, $vararg_ptr1 = 0, $vararg_ptr2 = 0, $vararg_ptr3 = 0, $vararg_ptr4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $vararg_buffer = sp;
 $3 = sp + 20|0;
 $4 = ((($0)) + 60|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = $3;
 HEAP32[$vararg_buffer>>2] = $5;
 $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
 HEAP32[$vararg_ptr1>>2] = 0;
 $vararg_ptr2 = ((($vararg_buffer)) + 8|0);
 HEAP32[$vararg_ptr2>>2] = $1;
 $vararg_ptr3 = ((($vararg_buffer)) + 12|0);
 HEAP32[$vararg_ptr3>>2] = $6;
 $vararg_ptr4 = ((($vararg_buffer)) + 16|0);
 HEAP32[$vararg_ptr4>>2] = $2;
 $7 = (___syscall140(140,($vararg_buffer|0))|0);
 $8 = (___syscall_ret($7)|0);
 $9 = ($8|0)<(0);
 if ($9) {
  HEAP32[$3>>2] = -1;
  $10 = -1;
 } else {
  $$pre = HEAP32[$3>>2]|0;
  $10 = $$pre;
 }
 STACKTOP = sp;return ($10|0);
}
function ___syscall_ret($0) {
 $0 = $0|0;
 var $$0 = 0, $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ($0>>>0)>(4294963200);
 if ($1) {
  $2 = (0 - ($0))|0;
  $3 = (___errno_location()|0);
  HEAP32[$3>>2] = $2;
  $$0 = -1;
 } else {
  $$0 = $0;
 }
 return ($$0|0);
}
function ___errno_location() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (37060|0);
}
function _dummy_733($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return ($0|0);
}
function ___stdout_write($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $vararg_buffer = 0, $vararg_ptr1 = 0, $vararg_ptr2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(32|0);
 $vararg_buffer = sp;
 $3 = sp + 16|0;
 $4 = ((($0)) + 36|0);
 HEAP32[$4>>2] = 2;
 $5 = HEAP32[$0>>2]|0;
 $6 = $5 & 64;
 $7 = ($6|0)==(0);
 if ($7) {
  $8 = ((($0)) + 60|0);
  $9 = HEAP32[$8>>2]|0;
  $10 = $3;
  HEAP32[$vararg_buffer>>2] = $9;
  $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
  HEAP32[$vararg_ptr1>>2] = 21523;
  $vararg_ptr2 = ((($vararg_buffer)) + 8|0);
  HEAP32[$vararg_ptr2>>2] = $10;
  $11 = (___syscall54(54,($vararg_buffer|0))|0);
  $12 = ($11|0)==(0);
  if (!($12)) {
   $13 = ((($0)) + 75|0);
   HEAP8[$13>>0] = -1;
  }
 }
 $14 = (___stdio_write($0,$1,$2)|0);
 STACKTOP = sp;return ($14|0);
}
function _strcmp($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$011 = 0, $$0710 = 0, $$lcssa = 0, $$lcssa8 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, $or$cond9 = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 $2 = HEAP8[$0>>0]|0;
 $3 = HEAP8[$1>>0]|0;
 $4 = ($2<<24>>24)!=($3<<24>>24);
 $5 = ($2<<24>>24)==(0);
 $or$cond9 = $5 | $4;
 if ($or$cond9) {
  $$lcssa = $3;$$lcssa8 = $2;
 } else {
  $$011 = $1;$$0710 = $0;
  while(1) {
   $6 = ((($$0710)) + 1|0);
   $7 = ((($$011)) + 1|0);
   $8 = HEAP8[$6>>0]|0;
   $9 = HEAP8[$7>>0]|0;
   $10 = ($8<<24>>24)!=($9<<24>>24);
   $11 = ($8<<24>>24)==(0);
   $or$cond = $11 | $10;
   if ($or$cond) {
    $$lcssa = $9;$$lcssa8 = $8;
    break;
   } else {
    $$011 = $7;$$0710 = $6;
   }
  }
 }
 $12 = $$lcssa8&255;
 $13 = $$lcssa&255;
 $14 = (($12) - ($13))|0;
 return ($14|0);
}
function _vfprintf($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$ = 0, $$0 = 0, $$1 = 0, $$1$ = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0;
 var $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $5 = 0, $6 = 0, $7 = 0;
 var $8 = 0, $9 = 0, $vacopy_currentptr = 0, dest = 0, label = 0, sp = 0, stop = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 224|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(224|0);
 $3 = sp + 120|0;
 $4 = sp + 80|0;
 $5 = sp;
 $6 = sp + 136|0;
 dest=$4; stop=dest+40|0; do { HEAP32[dest>>2]=0|0; dest=dest+4|0; } while ((dest|0) < (stop|0));
 $vacopy_currentptr = HEAP32[$2>>2]|0;
 HEAP32[$3>>2] = $vacopy_currentptr;
 $7 = (_printf_core(0,$1,$3,$5,$4)|0);
 $8 = ($7|0)<(0);
 if ($8) {
  $$0 = -1;
 } else {
  $9 = ((($0)) + 76|0);
  $10 = HEAP32[$9>>2]|0;
  $11 = ($10|0)>(-1);
  if ($11) {
   $12 = (___lockfile($0)|0);
   $40 = $12;
  } else {
   $40 = 0;
  }
  $13 = HEAP32[$0>>2]|0;
  $14 = $13 & 32;
  $15 = ((($0)) + 74|0);
  $16 = HEAP8[$15>>0]|0;
  $17 = ($16<<24>>24)<(1);
  if ($17) {
   $18 = $13 & -33;
   HEAP32[$0>>2] = $18;
  }
  $19 = ((($0)) + 48|0);
  $20 = HEAP32[$19>>2]|0;
  $21 = ($20|0)==(0);
  if ($21) {
   $23 = ((($0)) + 44|0);
   $24 = HEAP32[$23>>2]|0;
   HEAP32[$23>>2] = $6;
   $25 = ((($0)) + 28|0);
   HEAP32[$25>>2] = $6;
   $26 = ((($0)) + 20|0);
   HEAP32[$26>>2] = $6;
   HEAP32[$19>>2] = 80;
   $27 = ((($6)) + 80|0);
   $28 = ((($0)) + 16|0);
   HEAP32[$28>>2] = $27;
   $29 = (_printf_core($0,$1,$3,$5,$4)|0);
   $30 = ($24|0)==(0|0);
   if ($30) {
    $$1 = $29;
   } else {
    $31 = ((($0)) + 36|0);
    $32 = HEAP32[$31>>2]|0;
    (FUNCTION_TABLE_iiii[$32 & 63]($0,0,0)|0);
    $33 = HEAP32[$26>>2]|0;
    $34 = ($33|0)==(0|0);
    $$ = $34 ? -1 : $29;
    HEAP32[$23>>2] = $24;
    HEAP32[$19>>2] = 0;
    HEAP32[$28>>2] = 0;
    HEAP32[$25>>2] = 0;
    HEAP32[$26>>2] = 0;
    $$1 = $$;
   }
  } else {
   $22 = (_printf_core($0,$1,$3,$5,$4)|0);
   $$1 = $22;
  }
  $35 = HEAP32[$0>>2]|0;
  $36 = $35 & 32;
  $37 = ($36|0)==(0);
  $$1$ = $37 ? $$1 : -1;
  $38 = $35 | $14;
  HEAP32[$0>>2] = $38;
  $39 = ($40|0)==(0);
  if (!($39)) {
   ___unlockfile($0);
  }
  $$0 = $$1$;
 }
 STACKTOP = sp;return ($$0|0);
}
function _printf_core($0,$1,$2,$3,$4) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 var $$ = 0, $$$ = 0, $$$0259 = 0, $$$0262 = 0, $$$0269 = 0, $$$4266 = 0, $$$5 = 0, $$0 = 0, $$0228 = 0, $$0228$ = 0, $$0229320 = 0, $$0232 = 0, $$0235 = 0, $$0237 = 0, $$0240$lcssa = 0, $$0240$lcssa357 = 0, $$0240319 = 0, $$0243 = 0, $$0247 = 0, $$0249$lcssa = 0;
 var $$0249307 = 0, $$0252 = 0, $$0253 = 0, $$0254 = 0, $$0254$$0254$ = 0, $$0259 = 0, $$0262$lcssa = 0, $$0262313 = 0, $$0269 = 0, $$0269$phi = 0, $$1 = 0, $$1230331 = 0, $$1233 = 0, $$1236 = 0, $$1238 = 0, $$1241330 = 0, $$1244318 = 0, $$1248 = 0, $$1250 = 0, $$1255 = 0;
 var $$1260 = 0, $$1263 = 0, $$1263$ = 0, $$1270 = 0, $$2 = 0, $$2234 = 0, $$2239 = 0, $$2242$lcssa = 0, $$2242306 = 0, $$2245 = 0, $$2251 = 0, $$2256 = 0, $$2256$ = 0, $$2256$$$2256 = 0, $$2261 = 0, $$2271 = 0, $$283$ = 0, $$290 = 0, $$291 = 0, $$3257 = 0;
 var $$3265 = 0, $$3272 = 0, $$3304 = 0, $$376 = 0, $$4258355 = 0, $$4266 = 0, $$5 = 0, $$6268 = 0, $$lcssa295 = 0, $$pre = 0, $$pre346 = 0, $$pre347 = 0, $$pre347$pre = 0, $$pre349 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0;
 var $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0;
 var $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0;
 var $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0;
 var $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0;
 var $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0, $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0;
 var $196 = 0, $197 = 0, $198 = 0, $199 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0, $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0;
 var $214 = 0, $215 = 0, $216 = 0, $217 = 0, $218 = 0, $219 = 0, $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0, $224 = 0, $225 = 0, $226 = 0, $227 = 0, $228 = 0, $229 = 0, $23 = 0, $230 = 0, $231 = 0;
 var $232 = 0, $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0, $242 = 0, $243 = 0, $244 = 0, $245 = 0, $246 = 0, $247 = 0, $248 = 0, $249 = 0, $25 = 0;
 var $250 = 0, $251 = 0, $252 = 0, $253 = 0, $254 = 0, $255 = 0, $256 = 0, $257 = 0, $258 = 0, $259 = 0, $26 = 0, $260 = 0, $261 = 0, $262 = 0, $263 = 0, $264 = 0, $265 = 0, $266 = 0, $267 = 0, $268 = 0;
 var $269 = 0, $27 = 0, $270 = 0, $271 = 0, $272 = 0, $273 = 0, $274 = 0, $275 = 0, $276 = 0, $277 = 0, $278 = 0, $279 = 0, $28 = 0, $280 = 0, $281 = 0, $282 = 0, $283 = 0, $284 = 0, $285 = 0, $286 = 0;
 var $287 = 0, $288 = 0, $289 = 0, $29 = 0, $290 = 0, $291 = 0, $292 = 0, $293 = 0, $294 = 0, $295 = 0, $296 = 0, $297 = 0, $298 = 0, $299 = 0, $30 = 0, $300 = 0, $301 = 0, $302 = 0, $303 = 0, $304 = 0;
 var $305 = 0, $306 = 0, $307 = 0, $308 = 0, $309 = 0, $31 = 0, $310 = 0, $311 = 0, $312 = 0, $313 = 0, $314 = 0.0, $315 = 0, $316 = 0, $317 = 0, $318 = 0, $319 = 0, $32 = 0, $320 = 0, $321 = 0, $322 = 0;
 var $323 = 0, $324 = 0, $325 = 0, $326 = 0, $327 = 0, $328 = 0, $329 = 0, $33 = 0, $330 = 0, $331 = 0, $332 = 0, $333 = 0, $334 = 0, $335 = 0, $336 = 0, $337 = 0, $338 = 0, $339 = 0, $34 = 0, $35 = 0;
 var $36 = 0, $37 = 0, $38 = 0, $39 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0;
 var $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0;
 var $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0;
 var $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $arglist_current = 0, $arglist_current2 = 0, $arglist_next = 0, $arglist_next3 = 0, $brmerge = 0, $brmerge312 = 0, $expanded = 0, $expanded10 = 0, $expanded11 = 0, $expanded13 = 0, $expanded14 = 0;
 var $expanded15 = 0, $expanded4 = 0, $expanded6 = 0, $expanded7 = 0, $expanded8 = 0, $isdigit = 0, $isdigit275 = 0, $isdigit277 = 0, $isdigittmp = 0, $isdigittmp$ = 0, $isdigittmp274 = 0, $isdigittmp276 = 0, $or$cond = 0, $or$cond280 = 0, $or$cond282 = 0, $or$cond285 = 0, $storemerge = 0, $storemerge278 = 0, $trunc = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 64|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(64|0);
 $5 = sp + 16|0;
 $6 = sp;
 $7 = sp + 24|0;
 $8 = sp + 8|0;
 $9 = sp + 20|0;
 HEAP32[$5>>2] = $1;
 $10 = ($0|0)!=(0|0);
 $11 = ((($7)) + 40|0);
 $12 = $11;
 $13 = ((($7)) + 39|0);
 $14 = ((($8)) + 4|0);
 $$0243 = 0;$$0247 = 0;$$0269 = 0;$21 = $1;
 L1: while(1) {
  $15 = ($$0247|0)>(-1);
  do {
   if ($15) {
    $16 = (2147483647 - ($$0247))|0;
    $17 = ($$0243|0)>($16|0);
    if ($17) {
     $18 = (___errno_location()|0);
     HEAP32[$18>>2] = 75;
     $$1248 = -1;
     break;
    } else {
     $19 = (($$0243) + ($$0247))|0;
     $$1248 = $19;
     break;
    }
   } else {
    $$1248 = $$0247;
   }
  } while(0);
  $20 = HEAP8[$21>>0]|0;
  $22 = ($20<<24>>24)==(0);
  if ($22) {
   label = 86;
   break;
  } else {
   $23 = $20;$25 = $21;
  }
  L9: while(1) {
   switch ($23<<24>>24) {
   case 37:  {
    $$0249307 = $25;$27 = $25;
    label = 9;
    break L9;
    break;
   }
   case 0:  {
    $$0249$lcssa = $25;$39 = $25;
    break L9;
    break;
   }
   default: {
   }
   }
   $24 = ((($25)) + 1|0);
   HEAP32[$5>>2] = $24;
   $$pre = HEAP8[$24>>0]|0;
   $23 = $$pre;$25 = $24;
  }
  L12: do {
   if ((label|0) == 9) {
    while(1) {
     label = 0;
     $26 = ((($27)) + 1|0);
     $28 = HEAP8[$26>>0]|0;
     $29 = ($28<<24>>24)==(37);
     if (!($29)) {
      $$0249$lcssa = $$0249307;$39 = $27;
      break L12;
     }
     $30 = ((($$0249307)) + 1|0);
     $31 = ((($27)) + 2|0);
     HEAP32[$5>>2] = $31;
     $32 = HEAP8[$31>>0]|0;
     $33 = ($32<<24>>24)==(37);
     if ($33) {
      $$0249307 = $30;$27 = $31;
      label = 9;
     } else {
      $$0249$lcssa = $30;$39 = $31;
      break;
     }
    }
   }
  } while(0);
  $34 = $$0249$lcssa;
  $35 = $21;
  $36 = (($34) - ($35))|0;
  if ($10) {
   _out($0,$21,$36);
  }
  $37 = ($36|0)==(0);
  if (!($37)) {
   $$0269$phi = $$0269;$$0243 = $36;$$0247 = $$1248;$21 = $39;$$0269 = $$0269$phi;
   continue;
  }
  $38 = ((($39)) + 1|0);
  $40 = HEAP8[$38>>0]|0;
  $41 = $40 << 24 >> 24;
  $isdigittmp = (($41) + -48)|0;
  $isdigit = ($isdigittmp>>>0)<(10);
  if ($isdigit) {
   $42 = ((($39)) + 2|0);
   $43 = HEAP8[$42>>0]|0;
   $44 = ($43<<24>>24)==(36);
   $45 = ((($39)) + 3|0);
   $$376 = $44 ? $45 : $38;
   $$$0269 = $44 ? 1 : $$0269;
   $isdigittmp$ = $44 ? $isdigittmp : -1;
   $$0253 = $isdigittmp$;$$1270 = $$$0269;$storemerge = $$376;
  } else {
   $$0253 = -1;$$1270 = $$0269;$storemerge = $38;
  }
  HEAP32[$5>>2] = $storemerge;
  $46 = HEAP8[$storemerge>>0]|0;
  $47 = $46 << 24 >> 24;
  $48 = (($47) + -32)|0;
  $49 = ($48>>>0)>(31);
  $50 = 1 << $48;
  $51 = $50 & 75913;
  $52 = ($51|0)==(0);
  $brmerge312 = $49 | $52;
  if ($brmerge312) {
   $$0262$lcssa = 0;$$lcssa295 = $46;$69 = $storemerge;
  } else {
   $$0262313 = 0;$54 = $46;$59 = $storemerge;
   while(1) {
    $53 = $54 << 24 >> 24;
    $55 = (($53) + -32)|0;
    $56 = 1 << $55;
    $57 = $56 | $$0262313;
    $58 = ((($59)) + 1|0);
    HEAP32[$5>>2] = $58;
    $60 = HEAP8[$58>>0]|0;
    $61 = $60 << 24 >> 24;
    $62 = (($61) + -32)|0;
    $63 = ($62>>>0)>(31);
    $64 = 1 << $62;
    $65 = $64 & 75913;
    $66 = ($65|0)==(0);
    $brmerge = $63 | $66;
    if ($brmerge) {
     $$0262$lcssa = $57;$$lcssa295 = $60;$69 = $58;
     break;
    } else {
     $$0262313 = $57;$54 = $60;$59 = $58;
    }
   }
  }
  $67 = ($$lcssa295<<24>>24)==(42);
  if ($67) {
   $68 = ((($69)) + 1|0);
   $70 = HEAP8[$68>>0]|0;
   $71 = $70 << 24 >> 24;
   $isdigittmp276 = (($71) + -48)|0;
   $isdigit277 = ($isdigittmp276>>>0)<(10);
   if ($isdigit277) {
    $72 = ((($69)) + 2|0);
    $73 = HEAP8[$72>>0]|0;
    $74 = ($73<<24>>24)==(36);
    if ($74) {
     $75 = (($4) + ($isdigittmp276<<2)|0);
     HEAP32[$75>>2] = 10;
     $76 = HEAP8[$68>>0]|0;
     $77 = $76 << 24 >> 24;
     $78 = (($77) + -48)|0;
     $79 = (($3) + ($78<<3)|0);
     $80 = $79;
     $81 = $80;
     $82 = HEAP32[$81>>2]|0;
     $83 = (($80) + 4)|0;
     $84 = $83;
     $85 = HEAP32[$84>>2]|0;
     $86 = ((($69)) + 3|0);
     $$0259 = $82;$$2271 = 1;$storemerge278 = $86;
    } else {
     label = 22;
    }
   } else {
    label = 22;
   }
   if ((label|0) == 22) {
    label = 0;
    $87 = ($$1270|0)==(0);
    if (!($87)) {
     $$0 = -1;
     break;
    }
    if ($10) {
     $arglist_current = HEAP32[$2>>2]|0;
     $88 = $arglist_current;
     $89 = ((0) + 4|0);
     $expanded4 = $89;
     $expanded = (($expanded4) - 1)|0;
     $90 = (($88) + ($expanded))|0;
     $91 = ((0) + 4|0);
     $expanded8 = $91;
     $expanded7 = (($expanded8) - 1)|0;
     $expanded6 = $expanded7 ^ -1;
     $92 = $90 & $expanded6;
     $93 = $92;
     $94 = HEAP32[$93>>2]|0;
     $arglist_next = ((($93)) + 4|0);
     HEAP32[$2>>2] = $arglist_next;
     $$0259 = $94;$$2271 = 0;$storemerge278 = $68;
    } else {
     $$0259 = 0;$$2271 = 0;$storemerge278 = $68;
    }
   }
   HEAP32[$5>>2] = $storemerge278;
   $95 = ($$0259|0)<(0);
   $96 = $$0262$lcssa | 8192;
   $97 = (0 - ($$0259))|0;
   $$$0262 = $95 ? $96 : $$0262$lcssa;
   $$$0259 = $95 ? $97 : $$0259;
   $$1260 = $$$0259;$$1263 = $$$0262;$$3272 = $$2271;$101 = $storemerge278;
  } else {
   $98 = (_getint($5)|0);
   $99 = ($98|0)<(0);
   if ($99) {
    $$0 = -1;
    break;
   }
   $$pre346 = HEAP32[$5>>2]|0;
   $$1260 = $98;$$1263 = $$0262$lcssa;$$3272 = $$1270;$101 = $$pre346;
  }
  $100 = HEAP8[$101>>0]|0;
  $102 = ($100<<24>>24)==(46);
  do {
   if ($102) {
    $103 = ((($101)) + 1|0);
    $104 = HEAP8[$103>>0]|0;
    $105 = ($104<<24>>24)==(42);
    if (!($105)) {
     $132 = ((($101)) + 1|0);
     HEAP32[$5>>2] = $132;
     $133 = (_getint($5)|0);
     $$pre347$pre = HEAP32[$5>>2]|0;
     $$0254 = $133;$$pre347 = $$pre347$pre;
     break;
    }
    $106 = ((($101)) + 2|0);
    $107 = HEAP8[$106>>0]|0;
    $108 = $107 << 24 >> 24;
    $isdigittmp274 = (($108) + -48)|0;
    $isdigit275 = ($isdigittmp274>>>0)<(10);
    if ($isdigit275) {
     $109 = ((($101)) + 3|0);
     $110 = HEAP8[$109>>0]|0;
     $111 = ($110<<24>>24)==(36);
     if ($111) {
      $112 = (($4) + ($isdigittmp274<<2)|0);
      HEAP32[$112>>2] = 10;
      $113 = HEAP8[$106>>0]|0;
      $114 = $113 << 24 >> 24;
      $115 = (($114) + -48)|0;
      $116 = (($3) + ($115<<3)|0);
      $117 = $116;
      $118 = $117;
      $119 = HEAP32[$118>>2]|0;
      $120 = (($117) + 4)|0;
      $121 = $120;
      $122 = HEAP32[$121>>2]|0;
      $123 = ((($101)) + 4|0);
      HEAP32[$5>>2] = $123;
      $$0254 = $119;$$pre347 = $123;
      break;
     }
    }
    $124 = ($$3272|0)==(0);
    if (!($124)) {
     $$0 = -1;
     break L1;
    }
    if ($10) {
     $arglist_current2 = HEAP32[$2>>2]|0;
     $125 = $arglist_current2;
     $126 = ((0) + 4|0);
     $expanded11 = $126;
     $expanded10 = (($expanded11) - 1)|0;
     $127 = (($125) + ($expanded10))|0;
     $128 = ((0) + 4|0);
     $expanded15 = $128;
     $expanded14 = (($expanded15) - 1)|0;
     $expanded13 = $expanded14 ^ -1;
     $129 = $127 & $expanded13;
     $130 = $129;
     $131 = HEAP32[$130>>2]|0;
     $arglist_next3 = ((($130)) + 4|0);
     HEAP32[$2>>2] = $arglist_next3;
     $338 = $131;
    } else {
     $338 = 0;
    }
    HEAP32[$5>>2] = $106;
    $$0254 = $338;$$pre347 = $106;
   } else {
    $$0254 = -1;$$pre347 = $101;
   }
  } while(0);
  $$0252 = 0;$135 = $$pre347;
  while(1) {
   $134 = HEAP8[$135>>0]|0;
   $136 = $134 << 24 >> 24;
   $137 = (($136) + -65)|0;
   $138 = ($137>>>0)>(57);
   if ($138) {
    $$0 = -1;
    break L1;
   }
   $139 = ((($135)) + 1|0);
   HEAP32[$5>>2] = $139;
   $140 = HEAP8[$135>>0]|0;
   $141 = $140 << 24 >> 24;
   $142 = (($141) + -65)|0;
   $143 = ((32982 + (($$0252*58)|0)|0) + ($142)|0);
   $144 = HEAP8[$143>>0]|0;
   $145 = $144&255;
   $146 = (($145) + -1)|0;
   $147 = ($146>>>0)<(8);
   if ($147) {
    $$0252 = $145;$135 = $139;
   } else {
    break;
   }
  }
  $148 = ($144<<24>>24)==(0);
  if ($148) {
   $$0 = -1;
   break;
  }
  $149 = ($144<<24>>24)==(19);
  $150 = ($$0253|0)>(-1);
  do {
   if ($149) {
    if ($150) {
     $$0 = -1;
     break L1;
    } else {
     label = 48;
    }
   } else {
    if ($150) {
     $151 = (($4) + ($$0253<<2)|0);
     HEAP32[$151>>2] = $145;
     $152 = (($3) + ($$0253<<3)|0);
     $153 = $152;
     $154 = $153;
     $155 = HEAP32[$154>>2]|0;
     $156 = (($153) + 4)|0;
     $157 = $156;
     $158 = HEAP32[$157>>2]|0;
     $159 = $6;
     $160 = $159;
     HEAP32[$160>>2] = $155;
     $161 = (($159) + 4)|0;
     $162 = $161;
     HEAP32[$162>>2] = $158;
     label = 48;
     break;
    }
    if (!($10)) {
     $$0 = 0;
     break L1;
    }
    _pop_arg($6,$145,$2);
   }
  } while(0);
  if ((label|0) == 48) {
   label = 0;
   if (!($10)) {
    $$0243 = 0;$$0247 = $$1248;$$0269 = $$3272;$21 = $139;
    continue;
   }
  }
  $163 = HEAP8[$135>>0]|0;
  $164 = $163 << 24 >> 24;
  $165 = ($$0252|0)!=(0);
  $166 = $164 & 15;
  $167 = ($166|0)==(3);
  $or$cond280 = $165 & $167;
  $168 = $164 & -33;
  $$0235 = $or$cond280 ? $168 : $164;
  $169 = $$1263 & 8192;
  $170 = ($169|0)==(0);
  $171 = $$1263 & -65537;
  $$1263$ = $170 ? $$1263 : $171;
  L70: do {
   switch ($$0235|0) {
   case 110:  {
    $trunc = $$0252&255;
    switch ($trunc<<24>>24) {
    case 0:  {
     $178 = HEAP32[$6>>2]|0;
     HEAP32[$178>>2] = $$1248;
     $$0243 = 0;$$0247 = $$1248;$$0269 = $$3272;$21 = $139;
     continue L1;
     break;
    }
    case 1:  {
     $179 = HEAP32[$6>>2]|0;
     HEAP32[$179>>2] = $$1248;
     $$0243 = 0;$$0247 = $$1248;$$0269 = $$3272;$21 = $139;
     continue L1;
     break;
    }
    case 2:  {
     $180 = ($$1248|0)<(0);
     $181 = $180 << 31 >> 31;
     $182 = HEAP32[$6>>2]|0;
     $183 = $182;
     $184 = $183;
     HEAP32[$184>>2] = $$1248;
     $185 = (($183) + 4)|0;
     $186 = $185;
     HEAP32[$186>>2] = $181;
     $$0243 = 0;$$0247 = $$1248;$$0269 = $$3272;$21 = $139;
     continue L1;
     break;
    }
    case 3:  {
     $187 = $$1248&65535;
     $188 = HEAP32[$6>>2]|0;
     HEAP16[$188>>1] = $187;
     $$0243 = 0;$$0247 = $$1248;$$0269 = $$3272;$21 = $139;
     continue L1;
     break;
    }
    case 4:  {
     $189 = $$1248&255;
     $190 = HEAP32[$6>>2]|0;
     HEAP8[$190>>0] = $189;
     $$0243 = 0;$$0247 = $$1248;$$0269 = $$3272;$21 = $139;
     continue L1;
     break;
    }
    case 6:  {
     $191 = HEAP32[$6>>2]|0;
     HEAP32[$191>>2] = $$1248;
     $$0243 = 0;$$0247 = $$1248;$$0269 = $$3272;$21 = $139;
     continue L1;
     break;
    }
    case 7:  {
     $192 = ($$1248|0)<(0);
     $193 = $192 << 31 >> 31;
     $194 = HEAP32[$6>>2]|0;
     $195 = $194;
     $196 = $195;
     HEAP32[$196>>2] = $$1248;
     $197 = (($195) + 4)|0;
     $198 = $197;
     HEAP32[$198>>2] = $193;
     $$0243 = 0;$$0247 = $$1248;$$0269 = $$3272;$21 = $139;
     continue L1;
     break;
    }
    default: {
     $$0243 = 0;$$0247 = $$1248;$$0269 = $$3272;$21 = $139;
     continue L1;
    }
    }
    break;
   }
   case 112:  {
    $199 = ($$0254>>>0)>(8);
    $200 = $199 ? $$0254 : 8;
    $201 = $$1263$ | 8;
    $$1236 = 120;$$1255 = $200;$$3265 = $201;
    label = 60;
    break;
   }
   case 88: case 120:  {
    $$1236 = $$0235;$$1255 = $$0254;$$3265 = $$1263$;
    label = 60;
    break;
   }
   case 111:  {
    $217 = $6;
    $218 = $217;
    $219 = HEAP32[$218>>2]|0;
    $220 = (($217) + 4)|0;
    $221 = $220;
    $222 = HEAP32[$221>>2]|0;
    $223 = (_fmt_o($219,$222,$11)|0);
    $224 = $$1263$ & 8;
    $225 = ($224|0)==(0);
    $226 = $223;
    $227 = (($12) - ($226))|0;
    $228 = ($$0254|0)>($227|0);
    $229 = (($227) + 1)|0;
    $230 = $225 | $228;
    $$0254$$0254$ = $230 ? $$0254 : $229;
    $$0228 = $223;$$1233 = 0;$$1238 = 33446;$$2256 = $$0254$$0254$;$$4266 = $$1263$;$256 = $219;$258 = $222;
    label = 66;
    break;
   }
   case 105: case 100:  {
    $231 = $6;
    $232 = $231;
    $233 = HEAP32[$232>>2]|0;
    $234 = (($231) + 4)|0;
    $235 = $234;
    $236 = HEAP32[$235>>2]|0;
    $237 = ($236|0)<(0);
    if ($237) {
     $238 = (_i64Subtract(0,0,($233|0),($236|0))|0);
     $239 = tempRet0;
     $240 = $6;
     $241 = $240;
     HEAP32[$241>>2] = $238;
     $242 = (($240) + 4)|0;
     $243 = $242;
     HEAP32[$243>>2] = $239;
     $$0232 = 1;$$0237 = 33446;$250 = $238;$251 = $239;
     label = 65;
     break L70;
    } else {
     $244 = $$1263$ & 2048;
     $245 = ($244|0)==(0);
     $246 = $$1263$ & 1;
     $247 = ($246|0)==(0);
     $$ = $247 ? 33446 : (33448);
     $$$ = $245 ? $$ : (33447);
     $248 = $$1263$ & 2049;
     $249 = ($248|0)!=(0);
     $$283$ = $249&1;
     $$0232 = $$283$;$$0237 = $$$;$250 = $233;$251 = $236;
     label = 65;
     break L70;
    }
    break;
   }
   case 117:  {
    $172 = $6;
    $173 = $172;
    $174 = HEAP32[$173>>2]|0;
    $175 = (($172) + 4)|0;
    $176 = $175;
    $177 = HEAP32[$176>>2]|0;
    $$0232 = 0;$$0237 = 33446;$250 = $174;$251 = $177;
    label = 65;
    break;
   }
   case 99:  {
    $267 = $6;
    $268 = $267;
    $269 = HEAP32[$268>>2]|0;
    $270 = (($267) + 4)|0;
    $271 = $270;
    $272 = HEAP32[$271>>2]|0;
    $273 = $269&255;
    HEAP8[$13>>0] = $273;
    $$2 = $13;$$2234 = 0;$$2239 = 33446;$$2251 = $11;$$5 = 1;$$6268 = $171;
    break;
   }
   case 109:  {
    $274 = (___errno_location()|0);
    $275 = HEAP32[$274>>2]|0;
    $276 = (_strerror($275)|0);
    $$1 = $276;
    label = 70;
    break;
   }
   case 115:  {
    $277 = HEAP32[$6>>2]|0;
    $278 = ($277|0)!=(0|0);
    $279 = $278 ? $277 : 33456;
    $$1 = $279;
    label = 70;
    break;
   }
   case 67:  {
    $286 = $6;
    $287 = $286;
    $288 = HEAP32[$287>>2]|0;
    $289 = (($286) + 4)|0;
    $290 = $289;
    $291 = HEAP32[$290>>2]|0;
    HEAP32[$8>>2] = $288;
    HEAP32[$14>>2] = 0;
    HEAP32[$6>>2] = $8;
    $$4258355 = -1;$339 = $8;
    label = 74;
    break;
   }
   case 83:  {
    $$pre349 = HEAP32[$6>>2]|0;
    $292 = ($$0254|0)==(0);
    if ($292) {
     _pad_669($0,32,$$1260,0,$$1263$);
     $$0240$lcssa357 = 0;
     label = 83;
    } else {
     $$4258355 = $$0254;$339 = $$pre349;
     label = 74;
    }
    break;
   }
   case 65: case 71: case 70: case 69: case 97: case 103: case 102: case 101:  {
    $314 = +HEAPF64[$6>>3];
    $315 = (_fmt_fp($0,$314,$$1260,$$0254,$$1263$,$$0235)|0);
    $$0243 = $315;$$0247 = $$1248;$$0269 = $$3272;$21 = $139;
    continue L1;
    break;
   }
   default: {
    $$2 = $21;$$2234 = 0;$$2239 = 33446;$$2251 = $11;$$5 = $$0254;$$6268 = $$1263$;
   }
   }
  } while(0);
  L94: do {
   if ((label|0) == 60) {
    label = 0;
    $202 = $6;
    $203 = $202;
    $204 = HEAP32[$203>>2]|0;
    $205 = (($202) + 4)|0;
    $206 = $205;
    $207 = HEAP32[$206>>2]|0;
    $208 = $$1236 & 32;
    $209 = (_fmt_x($204,$207,$11,$208)|0);
    $210 = ($204|0)==(0);
    $211 = ($207|0)==(0);
    $212 = $210 & $211;
    $213 = $$3265 & 8;
    $214 = ($213|0)==(0);
    $or$cond282 = $214 | $212;
    $215 = $$1236 >> 4;
    $216 = (33446 + ($215)|0);
    $$290 = $or$cond282 ? 33446 : $216;
    $$291 = $or$cond282 ? 0 : 2;
    $$0228 = $209;$$1233 = $$291;$$1238 = $$290;$$2256 = $$1255;$$4266 = $$3265;$256 = $204;$258 = $207;
    label = 66;
   }
   else if ((label|0) == 65) {
    label = 0;
    $252 = (_fmt_u($250,$251,$11)|0);
    $$0228 = $252;$$1233 = $$0232;$$1238 = $$0237;$$2256 = $$0254;$$4266 = $$1263$;$256 = $250;$258 = $251;
    label = 66;
   }
   else if ((label|0) == 70) {
    label = 0;
    $280 = (_memchr($$1,0,$$0254)|0);
    $281 = ($280|0)==(0|0);
    $282 = $280;
    $283 = $$1;
    $284 = (($282) - ($283))|0;
    $285 = (($$1) + ($$0254)|0);
    $$3257 = $281 ? $$0254 : $284;
    $$1250 = $281 ? $285 : $280;
    $$2 = $$1;$$2234 = 0;$$2239 = 33446;$$2251 = $$1250;$$5 = $$3257;$$6268 = $171;
   }
   else if ((label|0) == 74) {
    label = 0;
    $$0229320 = $339;$$0240319 = 0;$$1244318 = 0;
    while(1) {
     $293 = HEAP32[$$0229320>>2]|0;
     $294 = ($293|0)==(0);
     if ($294) {
      $$0240$lcssa = $$0240319;$$2245 = $$1244318;
      break;
     }
     $295 = (_wctomb($9,$293)|0);
     $296 = ($295|0)<(0);
     $297 = (($$4258355) - ($$0240319))|0;
     $298 = ($295>>>0)>($297>>>0);
     $or$cond285 = $296 | $298;
     if ($or$cond285) {
      $$0240$lcssa = $$0240319;$$2245 = $295;
      break;
     }
     $299 = ((($$0229320)) + 4|0);
     $300 = (($295) + ($$0240319))|0;
     $301 = ($$4258355>>>0)>($300>>>0);
     if ($301) {
      $$0229320 = $299;$$0240319 = $300;$$1244318 = $295;
     } else {
      $$0240$lcssa = $300;$$2245 = $295;
      break;
     }
    }
    $302 = ($$2245|0)<(0);
    if ($302) {
     $$0 = -1;
     break L1;
    }
    _pad_669($0,32,$$1260,$$0240$lcssa,$$1263$);
    $303 = ($$0240$lcssa|0)==(0);
    if ($303) {
     $$0240$lcssa357 = 0;
     label = 83;
    } else {
     $$1230331 = $339;$$1241330 = 0;
     while(1) {
      $304 = HEAP32[$$1230331>>2]|0;
      $305 = ($304|0)==(0);
      if ($305) {
       $$0240$lcssa357 = $$0240$lcssa;
       label = 83;
       break L94;
      }
      $306 = (_wctomb($9,$304)|0);
      $307 = (($306) + ($$1241330))|0;
      $308 = ($307|0)>($$0240$lcssa|0);
      if ($308) {
       $$0240$lcssa357 = $$0240$lcssa;
       label = 83;
       break L94;
      }
      $309 = ((($$1230331)) + 4|0);
      _out($0,$9,$306);
      $310 = ($307>>>0)<($$0240$lcssa>>>0);
      if ($310) {
       $$1230331 = $309;$$1241330 = $307;
      } else {
       $$0240$lcssa357 = $$0240$lcssa;
       label = 83;
       break;
      }
     }
    }
   }
  } while(0);
  if ((label|0) == 66) {
   label = 0;
   $253 = ($$2256|0)>(-1);
   $254 = $$4266 & -65537;
   $$$4266 = $253 ? $254 : $$4266;
   $255 = ($256|0)!=(0);
   $257 = ($258|0)!=(0);
   $259 = $255 | $257;
   $260 = ($$2256|0)!=(0);
   $or$cond = $260 | $259;
   $261 = $$0228;
   $262 = (($12) - ($261))|0;
   $263 = $259 ^ 1;
   $264 = $263&1;
   $265 = (($262) + ($264))|0;
   $266 = ($$2256|0)>($265|0);
   $$2256$ = $266 ? $$2256 : $265;
   $$2256$$$2256 = $or$cond ? $$2256$ : $$2256;
   $$0228$ = $or$cond ? $$0228 : $11;
   $$2 = $$0228$;$$2234 = $$1233;$$2239 = $$1238;$$2251 = $11;$$5 = $$2256$$$2256;$$6268 = $$$4266;
  }
  else if ((label|0) == 83) {
   label = 0;
   $311 = $$1263$ ^ 8192;
   _pad_669($0,32,$$1260,$$0240$lcssa357,$311);
   $312 = ($$1260|0)>($$0240$lcssa357|0);
   $313 = $312 ? $$1260 : $$0240$lcssa357;
   $$0243 = $313;$$0247 = $$1248;$$0269 = $$3272;$21 = $139;
   continue;
  }
  $316 = $$2251;
  $317 = $$2;
  $318 = (($316) - ($317))|0;
  $319 = ($$5|0)<($318|0);
  $$$5 = $319 ? $318 : $$5;
  $320 = (($$$5) + ($$2234))|0;
  $321 = ($$1260|0)<($320|0);
  $$2261 = $321 ? $320 : $$1260;
  _pad_669($0,32,$$2261,$320,$$6268);
  _out($0,$$2239,$$2234);
  $322 = $$6268 ^ 65536;
  _pad_669($0,48,$$2261,$320,$322);
  _pad_669($0,48,$$$5,$318,0);
  _out($0,$$2,$318);
  $323 = $$6268 ^ 8192;
  _pad_669($0,32,$$2261,$320,$323);
  $$0243 = $$2261;$$0247 = $$1248;$$0269 = $$3272;$21 = $139;
 }
 L113: do {
  if ((label|0) == 86) {
   $324 = ($0|0)==(0|0);
   if ($324) {
    $325 = ($$0269|0)==(0);
    if ($325) {
     $$0 = 0;
    } else {
     $$2242306 = 1;
     while(1) {
      $326 = (($4) + ($$2242306<<2)|0);
      $327 = HEAP32[$326>>2]|0;
      $328 = ($327|0)==(0);
      if ($328) {
       $$2242$lcssa = $$2242306;
       break;
      }
      $330 = (($3) + ($$2242306<<3)|0);
      _pop_arg($330,$327,$2);
      $331 = (($$2242306) + 1)|0;
      $332 = ($$2242306|0)<(9);
      if ($332) {
       $$2242306 = $331;
      } else {
       $$2242$lcssa = $331;
       break;
      }
     }
     $329 = ($$2242$lcssa|0)<(10);
     if ($329) {
      $$3304 = $$2242$lcssa;
      while(1) {
       $335 = (($4) + ($$3304<<2)|0);
       $336 = HEAP32[$335>>2]|0;
       $337 = ($336|0)==(0);
       if (!($337)) {
        $$0 = -1;
        break L113;
       }
       $333 = (($$3304) + 1)|0;
       $334 = ($$3304|0)<(9);
       if ($334) {
        $$3304 = $333;
       } else {
        $$0 = 1;
        break;
       }
      }
     } else {
      $$0 = 1;
     }
    }
   } else {
    $$0 = $$1248;
   }
  }
 } while(0);
 STACKTOP = sp;return ($$0|0);
}
function ___lockfile($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 0;
}
function ___unlockfile($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function _out($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = HEAP32[$0>>2]|0;
 $4 = $3 & 32;
 $5 = ($4|0)==(0);
 if ($5) {
  (___fwritex($1,$2,$0)|0);
 }
 return;
}
function _getint($0) {
 $0 = $0|0;
 var $$0$lcssa = 0, $$06 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $isdigit = 0, $isdigit5 = 0, $isdigittmp = 0, $isdigittmp4 = 0, $isdigittmp7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = HEAP32[$0>>2]|0;
 $2 = HEAP8[$1>>0]|0;
 $3 = $2 << 24 >> 24;
 $isdigittmp4 = (($3) + -48)|0;
 $isdigit5 = ($isdigittmp4>>>0)<(10);
 if ($isdigit5) {
  $$06 = 0;$7 = $1;$isdigittmp7 = $isdigittmp4;
  while(1) {
   $4 = ($$06*10)|0;
   $5 = (($isdigittmp7) + ($4))|0;
   $6 = ((($7)) + 1|0);
   HEAP32[$0>>2] = $6;
   $8 = HEAP8[$6>>0]|0;
   $9 = $8 << 24 >> 24;
   $isdigittmp = (($9) + -48)|0;
   $isdigit = ($isdigittmp>>>0)<(10);
   if ($isdigit) {
    $$06 = $5;$7 = $6;$isdigittmp7 = $isdigittmp;
   } else {
    $$0$lcssa = $5;
    break;
   }
  }
 } else {
  $$0$lcssa = 0;
 }
 return ($$0$lcssa|0);
}
function _pop_arg($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$mask = 0, $$mask31 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0.0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0;
 var $116 = 0.0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0;
 var $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0;
 var $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0;
 var $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0;
 var $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $arglist_current = 0, $arglist_current11 = 0, $arglist_current14 = 0, $arglist_current17 = 0;
 var $arglist_current2 = 0, $arglist_current20 = 0, $arglist_current23 = 0, $arglist_current26 = 0, $arglist_current5 = 0, $arglist_current8 = 0, $arglist_next = 0, $arglist_next12 = 0, $arglist_next15 = 0, $arglist_next18 = 0, $arglist_next21 = 0, $arglist_next24 = 0, $arglist_next27 = 0, $arglist_next3 = 0, $arglist_next6 = 0, $arglist_next9 = 0, $expanded = 0, $expanded28 = 0, $expanded30 = 0, $expanded31 = 0;
 var $expanded32 = 0, $expanded34 = 0, $expanded35 = 0, $expanded37 = 0, $expanded38 = 0, $expanded39 = 0, $expanded41 = 0, $expanded42 = 0, $expanded44 = 0, $expanded45 = 0, $expanded46 = 0, $expanded48 = 0, $expanded49 = 0, $expanded51 = 0, $expanded52 = 0, $expanded53 = 0, $expanded55 = 0, $expanded56 = 0, $expanded58 = 0, $expanded59 = 0;
 var $expanded60 = 0, $expanded62 = 0, $expanded63 = 0, $expanded65 = 0, $expanded66 = 0, $expanded67 = 0, $expanded69 = 0, $expanded70 = 0, $expanded72 = 0, $expanded73 = 0, $expanded74 = 0, $expanded76 = 0, $expanded77 = 0, $expanded79 = 0, $expanded80 = 0, $expanded81 = 0, $expanded83 = 0, $expanded84 = 0, $expanded86 = 0, $expanded87 = 0;
 var $expanded88 = 0, $expanded90 = 0, $expanded91 = 0, $expanded93 = 0, $expanded94 = 0, $expanded95 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = ($1>>>0)>(20);
 L1: do {
  if (!($3)) {
   do {
    switch ($1|0) {
    case 9:  {
     $arglist_current = HEAP32[$2>>2]|0;
     $4 = $arglist_current;
     $5 = ((0) + 4|0);
     $expanded28 = $5;
     $expanded = (($expanded28) - 1)|0;
     $6 = (($4) + ($expanded))|0;
     $7 = ((0) + 4|0);
     $expanded32 = $7;
     $expanded31 = (($expanded32) - 1)|0;
     $expanded30 = $expanded31 ^ -1;
     $8 = $6 & $expanded30;
     $9 = $8;
     $10 = HEAP32[$9>>2]|0;
     $arglist_next = ((($9)) + 4|0);
     HEAP32[$2>>2] = $arglist_next;
     HEAP32[$0>>2] = $10;
     break L1;
     break;
    }
    case 10:  {
     $arglist_current2 = HEAP32[$2>>2]|0;
     $11 = $arglist_current2;
     $12 = ((0) + 4|0);
     $expanded35 = $12;
     $expanded34 = (($expanded35) - 1)|0;
     $13 = (($11) + ($expanded34))|0;
     $14 = ((0) + 4|0);
     $expanded39 = $14;
     $expanded38 = (($expanded39) - 1)|0;
     $expanded37 = $expanded38 ^ -1;
     $15 = $13 & $expanded37;
     $16 = $15;
     $17 = HEAP32[$16>>2]|0;
     $arglist_next3 = ((($16)) + 4|0);
     HEAP32[$2>>2] = $arglist_next3;
     $18 = ($17|0)<(0);
     $19 = $18 << 31 >> 31;
     $20 = $0;
     $21 = $20;
     HEAP32[$21>>2] = $17;
     $22 = (($20) + 4)|0;
     $23 = $22;
     HEAP32[$23>>2] = $19;
     break L1;
     break;
    }
    case 11:  {
     $arglist_current5 = HEAP32[$2>>2]|0;
     $24 = $arglist_current5;
     $25 = ((0) + 4|0);
     $expanded42 = $25;
     $expanded41 = (($expanded42) - 1)|0;
     $26 = (($24) + ($expanded41))|0;
     $27 = ((0) + 4|0);
     $expanded46 = $27;
     $expanded45 = (($expanded46) - 1)|0;
     $expanded44 = $expanded45 ^ -1;
     $28 = $26 & $expanded44;
     $29 = $28;
     $30 = HEAP32[$29>>2]|0;
     $arglist_next6 = ((($29)) + 4|0);
     HEAP32[$2>>2] = $arglist_next6;
     $31 = $0;
     $32 = $31;
     HEAP32[$32>>2] = $30;
     $33 = (($31) + 4)|0;
     $34 = $33;
     HEAP32[$34>>2] = 0;
     break L1;
     break;
    }
    case 12:  {
     $arglist_current8 = HEAP32[$2>>2]|0;
     $35 = $arglist_current8;
     $36 = ((0) + 8|0);
     $expanded49 = $36;
     $expanded48 = (($expanded49) - 1)|0;
     $37 = (($35) + ($expanded48))|0;
     $38 = ((0) + 8|0);
     $expanded53 = $38;
     $expanded52 = (($expanded53) - 1)|0;
     $expanded51 = $expanded52 ^ -1;
     $39 = $37 & $expanded51;
     $40 = $39;
     $41 = $40;
     $42 = $41;
     $43 = HEAP32[$42>>2]|0;
     $44 = (($41) + 4)|0;
     $45 = $44;
     $46 = HEAP32[$45>>2]|0;
     $arglist_next9 = ((($40)) + 8|0);
     HEAP32[$2>>2] = $arglist_next9;
     $47 = $0;
     $48 = $47;
     HEAP32[$48>>2] = $43;
     $49 = (($47) + 4)|0;
     $50 = $49;
     HEAP32[$50>>2] = $46;
     break L1;
     break;
    }
    case 13:  {
     $arglist_current11 = HEAP32[$2>>2]|0;
     $51 = $arglist_current11;
     $52 = ((0) + 4|0);
     $expanded56 = $52;
     $expanded55 = (($expanded56) - 1)|0;
     $53 = (($51) + ($expanded55))|0;
     $54 = ((0) + 4|0);
     $expanded60 = $54;
     $expanded59 = (($expanded60) - 1)|0;
     $expanded58 = $expanded59 ^ -1;
     $55 = $53 & $expanded58;
     $56 = $55;
     $57 = HEAP32[$56>>2]|0;
     $arglist_next12 = ((($56)) + 4|0);
     HEAP32[$2>>2] = $arglist_next12;
     $58 = $57&65535;
     $59 = $58 << 16 >> 16;
     $60 = ($59|0)<(0);
     $61 = $60 << 31 >> 31;
     $62 = $0;
     $63 = $62;
     HEAP32[$63>>2] = $59;
     $64 = (($62) + 4)|0;
     $65 = $64;
     HEAP32[$65>>2] = $61;
     break L1;
     break;
    }
    case 14:  {
     $arglist_current14 = HEAP32[$2>>2]|0;
     $66 = $arglist_current14;
     $67 = ((0) + 4|0);
     $expanded63 = $67;
     $expanded62 = (($expanded63) - 1)|0;
     $68 = (($66) + ($expanded62))|0;
     $69 = ((0) + 4|0);
     $expanded67 = $69;
     $expanded66 = (($expanded67) - 1)|0;
     $expanded65 = $expanded66 ^ -1;
     $70 = $68 & $expanded65;
     $71 = $70;
     $72 = HEAP32[$71>>2]|0;
     $arglist_next15 = ((($71)) + 4|0);
     HEAP32[$2>>2] = $arglist_next15;
     $$mask31 = $72 & 65535;
     $73 = $0;
     $74 = $73;
     HEAP32[$74>>2] = $$mask31;
     $75 = (($73) + 4)|0;
     $76 = $75;
     HEAP32[$76>>2] = 0;
     break L1;
     break;
    }
    case 15:  {
     $arglist_current17 = HEAP32[$2>>2]|0;
     $77 = $arglist_current17;
     $78 = ((0) + 4|0);
     $expanded70 = $78;
     $expanded69 = (($expanded70) - 1)|0;
     $79 = (($77) + ($expanded69))|0;
     $80 = ((0) + 4|0);
     $expanded74 = $80;
     $expanded73 = (($expanded74) - 1)|0;
     $expanded72 = $expanded73 ^ -1;
     $81 = $79 & $expanded72;
     $82 = $81;
     $83 = HEAP32[$82>>2]|0;
     $arglist_next18 = ((($82)) + 4|0);
     HEAP32[$2>>2] = $arglist_next18;
     $84 = $83&255;
     $85 = $84 << 24 >> 24;
     $86 = ($85|0)<(0);
     $87 = $86 << 31 >> 31;
     $88 = $0;
     $89 = $88;
     HEAP32[$89>>2] = $85;
     $90 = (($88) + 4)|0;
     $91 = $90;
     HEAP32[$91>>2] = $87;
     break L1;
     break;
    }
    case 16:  {
     $arglist_current20 = HEAP32[$2>>2]|0;
     $92 = $arglist_current20;
     $93 = ((0) + 4|0);
     $expanded77 = $93;
     $expanded76 = (($expanded77) - 1)|0;
     $94 = (($92) + ($expanded76))|0;
     $95 = ((0) + 4|0);
     $expanded81 = $95;
     $expanded80 = (($expanded81) - 1)|0;
     $expanded79 = $expanded80 ^ -1;
     $96 = $94 & $expanded79;
     $97 = $96;
     $98 = HEAP32[$97>>2]|0;
     $arglist_next21 = ((($97)) + 4|0);
     HEAP32[$2>>2] = $arglist_next21;
     $$mask = $98 & 255;
     $99 = $0;
     $100 = $99;
     HEAP32[$100>>2] = $$mask;
     $101 = (($99) + 4)|0;
     $102 = $101;
     HEAP32[$102>>2] = 0;
     break L1;
     break;
    }
    case 17:  {
     $arglist_current23 = HEAP32[$2>>2]|0;
     $103 = $arglist_current23;
     $104 = ((0) + 8|0);
     $expanded84 = $104;
     $expanded83 = (($expanded84) - 1)|0;
     $105 = (($103) + ($expanded83))|0;
     $106 = ((0) + 8|0);
     $expanded88 = $106;
     $expanded87 = (($expanded88) - 1)|0;
     $expanded86 = $expanded87 ^ -1;
     $107 = $105 & $expanded86;
     $108 = $107;
     $109 = +HEAPF64[$108>>3];
     $arglist_next24 = ((($108)) + 8|0);
     HEAP32[$2>>2] = $arglist_next24;
     HEAPF64[$0>>3] = $109;
     break L1;
     break;
    }
    case 18:  {
     $arglist_current26 = HEAP32[$2>>2]|0;
     $110 = $arglist_current26;
     $111 = ((0) + 8|0);
     $expanded91 = $111;
     $expanded90 = (($expanded91) - 1)|0;
     $112 = (($110) + ($expanded90))|0;
     $113 = ((0) + 8|0);
     $expanded95 = $113;
     $expanded94 = (($expanded95) - 1)|0;
     $expanded93 = $expanded94 ^ -1;
     $114 = $112 & $expanded93;
     $115 = $114;
     $116 = +HEAPF64[$115>>3];
     $arglist_next27 = ((($115)) + 8|0);
     HEAP32[$2>>2] = $arglist_next27;
     HEAPF64[$0>>3] = $116;
     break L1;
     break;
    }
    default: {
     break L1;
    }
    }
   } while(0);
  }
 } while(0);
 return;
}
function _fmt_x($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $$05$lcssa = 0, $$056 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 $4 = ($0|0)==(0);
 $5 = ($1|0)==(0);
 $6 = $4 & $5;
 if ($6) {
  $$05$lcssa = $2;
 } else {
  $$056 = $2;$15 = $1;$8 = $0;
  while(1) {
   $7 = $8 & 15;
   $9 = (33498 + ($7)|0);
   $10 = HEAP8[$9>>0]|0;
   $11 = $10&255;
   $12 = $11 | $3;
   $13 = $12&255;
   $14 = ((($$056)) + -1|0);
   HEAP8[$14>>0] = $13;
   $16 = (_bitshift64Lshr(($8|0),($15|0),4)|0);
   $17 = tempRet0;
   $18 = ($16|0)==(0);
   $19 = ($17|0)==(0);
   $20 = $18 & $19;
   if ($20) {
    $$05$lcssa = $14;
    break;
   } else {
    $$056 = $14;$15 = $17;$8 = $16;
   }
  }
 }
 return ($$05$lcssa|0);
}
function _fmt_o($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$0$lcssa = 0, $$06 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = ($0|0)==(0);
 $4 = ($1|0)==(0);
 $5 = $3 & $4;
 if ($5) {
  $$0$lcssa = $2;
 } else {
  $$06 = $2;$11 = $1;$7 = $0;
  while(1) {
   $6 = $7&255;
   $8 = $6 & 7;
   $9 = $8 | 48;
   $10 = ((($$06)) + -1|0);
   HEAP8[$10>>0] = $9;
   $12 = (_bitshift64Lshr(($7|0),($11|0),3)|0);
   $13 = tempRet0;
   $14 = ($12|0)==(0);
   $15 = ($13|0)==(0);
   $16 = $14 & $15;
   if ($16) {
    $$0$lcssa = $10;
    break;
   } else {
    $$06 = $10;$11 = $13;$7 = $12;
   }
  }
 }
 return ($$0$lcssa|0);
}
function _fmt_u($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$010$lcssa$off0 = 0, $$012 = 0, $$09$lcssa = 0, $$0914 = 0, $$1$lcssa = 0, $$111 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0;
 var $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = ($1>>>0)>(0);
 $4 = ($0>>>0)>(4294967295);
 $5 = ($1|0)==(0);
 $6 = $5 & $4;
 $7 = $3 | $6;
 if ($7) {
  $$0914 = $2;$8 = $0;$9 = $1;
  while(1) {
   $10 = (___uremdi3(($8|0),($9|0),10,0)|0);
   $11 = tempRet0;
   $12 = $10&255;
   $13 = $12 | 48;
   $14 = ((($$0914)) + -1|0);
   HEAP8[$14>>0] = $13;
   $15 = (___udivdi3(($8|0),($9|0),10,0)|0);
   $16 = tempRet0;
   $17 = ($9>>>0)>(9);
   $18 = ($8>>>0)>(4294967295);
   $19 = ($9|0)==(9);
   $20 = $19 & $18;
   $21 = $17 | $20;
   if ($21) {
    $$0914 = $14;$8 = $15;$9 = $16;
   } else {
    break;
   }
  }
  $$010$lcssa$off0 = $15;$$09$lcssa = $14;
 } else {
  $$010$lcssa$off0 = $0;$$09$lcssa = $2;
 }
 $22 = ($$010$lcssa$off0|0)==(0);
 if ($22) {
  $$1$lcssa = $$09$lcssa;
 } else {
  $$012 = $$010$lcssa$off0;$$111 = $$09$lcssa;
  while(1) {
   $23 = (($$012>>>0) % 10)&-1;
   $24 = $23 | 48;
   $25 = $24&255;
   $26 = ((($$111)) + -1|0);
   HEAP8[$26>>0] = $25;
   $27 = (($$012>>>0) / 10)&-1;
   $28 = ($$012>>>0)<(10);
   if ($28) {
    $$1$lcssa = $26;
    break;
   } else {
    $$012 = $27;$$111 = $26;
   }
  }
 }
 return ($$1$lcssa|0);
}
function _strerror($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = (___pthread_self_105()|0);
 $2 = ((($1)) + 188|0);
 $3 = HEAP32[$2>>2]|0;
 $4 = (___strerror_l($0,$3)|0);
 return ($4|0);
}
function _memchr($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$0$lcssa = 0, $$035$lcssa = 0, $$035$lcssa65 = 0, $$03555 = 0, $$036$lcssa = 0, $$036$lcssa64 = 0, $$03654 = 0, $$046 = 0, $$137$lcssa = 0, $$13745 = 0, $$140 = 0, $$2 = 0, $$23839 = 0, $$3 = 0, $$lcssa = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0;
 var $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0;
 var $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, $or$cond53 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = $1 & 255;
 $4 = $0;
 $5 = $4 & 3;
 $6 = ($5|0)!=(0);
 $7 = ($2|0)!=(0);
 $or$cond53 = $7 & $6;
 L1: do {
  if ($or$cond53) {
   $8 = $1&255;
   $$03555 = $0;$$03654 = $2;
   while(1) {
    $9 = HEAP8[$$03555>>0]|0;
    $10 = ($9<<24>>24)==($8<<24>>24);
    if ($10) {
     $$035$lcssa65 = $$03555;$$036$lcssa64 = $$03654;
     label = 6;
     break L1;
    }
    $11 = ((($$03555)) + 1|0);
    $12 = (($$03654) + -1)|0;
    $13 = $11;
    $14 = $13 & 3;
    $15 = ($14|0)!=(0);
    $16 = ($12|0)!=(0);
    $or$cond = $16 & $15;
    if ($or$cond) {
     $$03555 = $11;$$03654 = $12;
    } else {
     $$035$lcssa = $11;$$036$lcssa = $12;$$lcssa = $16;
     label = 5;
     break;
    }
   }
  } else {
   $$035$lcssa = $0;$$036$lcssa = $2;$$lcssa = $7;
   label = 5;
  }
 } while(0);
 if ((label|0) == 5) {
  if ($$lcssa) {
   $$035$lcssa65 = $$035$lcssa;$$036$lcssa64 = $$036$lcssa;
   label = 6;
  } else {
   $$2 = $$035$lcssa;$$3 = 0;
  }
 }
 L8: do {
  if ((label|0) == 6) {
   $17 = HEAP8[$$035$lcssa65>>0]|0;
   $18 = $1&255;
   $19 = ($17<<24>>24)==($18<<24>>24);
   if ($19) {
    $$2 = $$035$lcssa65;$$3 = $$036$lcssa64;
   } else {
    $20 = Math_imul($3, 16843009)|0;
    $21 = ($$036$lcssa64>>>0)>(3);
    L11: do {
     if ($21) {
      $$046 = $$035$lcssa65;$$13745 = $$036$lcssa64;
      while(1) {
       $22 = HEAP32[$$046>>2]|0;
       $23 = $22 ^ $20;
       $24 = (($23) + -16843009)|0;
       $25 = $23 & -2139062144;
       $26 = $25 ^ -2139062144;
       $27 = $26 & $24;
       $28 = ($27|0)==(0);
       if (!($28)) {
        break;
       }
       $29 = ((($$046)) + 4|0);
       $30 = (($$13745) + -4)|0;
       $31 = ($30>>>0)>(3);
       if ($31) {
        $$046 = $29;$$13745 = $30;
       } else {
        $$0$lcssa = $29;$$137$lcssa = $30;
        label = 11;
        break L11;
       }
      }
      $$140 = $$046;$$23839 = $$13745;
     } else {
      $$0$lcssa = $$035$lcssa65;$$137$lcssa = $$036$lcssa64;
      label = 11;
     }
    } while(0);
    if ((label|0) == 11) {
     $32 = ($$137$lcssa|0)==(0);
     if ($32) {
      $$2 = $$0$lcssa;$$3 = 0;
      break;
     } else {
      $$140 = $$0$lcssa;$$23839 = $$137$lcssa;
     }
    }
    while(1) {
     $33 = HEAP8[$$140>>0]|0;
     $34 = ($33<<24>>24)==($18<<24>>24);
     if ($34) {
      $$2 = $$140;$$3 = $$23839;
      break L8;
     }
     $35 = ((($$140)) + 1|0);
     $36 = (($$23839) + -1)|0;
     $37 = ($36|0)==(0);
     if ($37) {
      $$2 = $35;$$3 = 0;
      break;
     } else {
      $$140 = $35;$$23839 = $36;
     }
    }
   }
  }
 } while(0);
 $38 = ($$3|0)!=(0);
 $39 = $38 ? $$2 : 0;
 return ($39|0);
}
function _pad_669($0,$1,$2,$3,$4) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 var $$0$lcssa = 0, $$011 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 256|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(256|0);
 $5 = sp;
 $6 = $4 & 73728;
 $7 = ($6|0)==(0);
 $8 = ($2|0)>($3|0);
 $or$cond = $8 & $7;
 if ($or$cond) {
  $9 = (($2) - ($3))|0;
  $10 = ($9>>>0)<(256);
  $11 = $10 ? $9 : 256;
  _memset(($5|0),($1|0),($11|0))|0;
  $12 = ($9>>>0)>(255);
  if ($12) {
   $13 = (($2) - ($3))|0;
   $$011 = $9;
   while(1) {
    _out($0,$5,256);
    $14 = (($$011) + -256)|0;
    $15 = ($14>>>0)>(255);
    if ($15) {
     $$011 = $14;
    } else {
     break;
    }
   }
   $16 = $13 & 255;
   $$0$lcssa = $16;
  } else {
   $$0$lcssa = $9;
  }
  _out($0,$5,$$0$lcssa);
 }
 STACKTOP = sp;return;
}
function _wctomb($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$0 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ($0|0)==(0|0);
 if ($2) {
  $$0 = 0;
 } else {
  $3 = (_wcrtomb($0,$1,0)|0);
  $$0 = $3;
 }
 return ($$0|0);
}
function _fmt_fp($0,$1,$2,$3,$4,$5) {
 $0 = $0|0;
 $1 = +$1;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 $5 = $5|0;
 var $$ = 0, $$$ = 0, $$$$564 = 0.0, $$$3484 = 0, $$$3484699 = 0, $$$3484700 = 0, $$$3501 = 0, $$$4502 = 0, $$$543 = 0.0, $$$564 = 0.0, $$0 = 0, $$0463$lcssa = 0, $$0463587 = 0, $$0464597 = 0, $$0471 = 0.0, $$0479 = 0, $$0487644 = 0, $$0488 = 0, $$0488655 = 0, $$0488657 = 0;
 var $$0496$$9 = 0, $$0497656 = 0, $$0498 = 0, $$0509585 = 0.0, $$0510 = 0, $$0511 = 0, $$0514639 = 0, $$0520 = 0, $$0521 = 0, $$0521$ = 0, $$0523 = 0, $$0527 = 0, $$0527$in633 = 0, $$0530638 = 0, $$1465 = 0, $$1467 = 0.0, $$1469 = 0.0, $$1472 = 0.0, $$1480 = 0, $$1482$lcssa = 0;
 var $$1482663 = 0, $$1489643 = 0, $$1499$lcssa = 0, $$1499662 = 0, $$1508586 = 0, $$1512$lcssa = 0, $$1512610 = 0, $$1515 = 0, $$1524 = 0, $$1526 = 0, $$1528617 = 0, $$1531$lcssa = 0, $$1531632 = 0, $$1601 = 0, $$2 = 0, $$2473 = 0.0, $$2476 = 0, $$2476$$549 = 0, $$2476$$551 = 0, $$2483$ph = 0;
 var $$2500 = 0, $$2513 = 0, $$2516621 = 0, $$2529 = 0, $$2532620 = 0, $$3 = 0.0, $$3477 = 0, $$3484$lcssa = 0, $$3484650 = 0, $$3501$lcssa = 0, $$3501649 = 0, $$3533616 = 0, $$4 = 0.0, $$4478$lcssa = 0, $$4478593 = 0, $$4492 = 0, $$4502 = 0, $$4518 = 0, $$5$lcssa = 0, $$534$ = 0;
 var $$540 = 0, $$540$ = 0, $$543 = 0.0, $$548 = 0, $$5486$lcssa = 0, $$5486626 = 0, $$5493600 = 0, $$550 = 0, $$5519$ph = 0, $$557 = 0, $$5605 = 0, $$561 = 0, $$564 = 0.0, $$6 = 0, $$6494592 = 0, $$7495604 = 0, $$7505 = 0, $$7505$ = 0, $$7505$ph = 0, $$8 = 0;
 var $$9$ph = 0, $$lcssa675 = 0, $$neg = 0, $$neg568 = 0, $$pn = 0, $$pr = 0, $$pr566 = 0, $$pre = 0, $$pre$phi691Z2D = 0, $$pre$phi698Z2D = 0, $$pre690 = 0, $$pre693 = 0, $$pre697 = 0, $$sink = 0, $$sink547$lcssa = 0, $$sink547625 = 0, $$sink560 = 0, $10 = 0, $100 = 0, $101 = 0;
 var $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0.0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0.0, $119 = 0.0, $12 = 0;
 var $120 = 0.0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0;
 var $139 = 0, $14 = 0.0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0;
 var $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0;
 var $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0, $190 = 0, $191 = 0, $192 = 0;
 var $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0, $208 = 0, $209 = 0, $21 = 0, $210 = 0;
 var $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $218 = 0, $219 = 0, $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0, $224 = 0, $225 = 0, $226 = 0, $227 = 0, $228 = 0, $229 = 0;
 var $23 = 0, $230 = 0, $231 = 0.0, $232 = 0.0, $233 = 0, $234 = 0.0, $235 = 0, $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0, $242 = 0, $243 = 0, $244 = 0, $245 = 0, $246 = 0, $247 = 0;
 var $248 = 0, $249 = 0, $25 = 0, $250 = 0, $251 = 0, $252 = 0, $253 = 0, $254 = 0, $255 = 0, $256 = 0, $257 = 0, $258 = 0, $259 = 0, $26 = 0, $260 = 0, $261 = 0, $262 = 0, $263 = 0, $264 = 0, $265 = 0;
 var $266 = 0, $267 = 0, $268 = 0, $269 = 0, $27 = 0, $270 = 0, $271 = 0, $272 = 0, $273 = 0, $274 = 0, $275 = 0, $276 = 0, $277 = 0, $278 = 0, $279 = 0, $28 = 0, $280 = 0, $281 = 0, $282 = 0, $283 = 0;
 var $284 = 0, $285 = 0, $286 = 0, $287 = 0, $288 = 0, $289 = 0, $29 = 0, $290 = 0, $291 = 0, $292 = 0, $293 = 0, $294 = 0, $295 = 0, $296 = 0, $297 = 0, $298 = 0, $299 = 0, $30 = 0, $300 = 0, $301 = 0;
 var $302 = 0, $303 = 0, $304 = 0, $305 = 0, $306 = 0, $307 = 0, $308 = 0, $309 = 0, $31 = 0, $310 = 0, $311 = 0, $312 = 0, $313 = 0, $314 = 0, $315 = 0, $316 = 0, $317 = 0, $318 = 0, $319 = 0, $32 = 0;
 var $320 = 0, $321 = 0, $322 = 0, $323 = 0, $324 = 0, $325 = 0, $326 = 0, $327 = 0, $328 = 0, $329 = 0, $33 = 0, $330 = 0, $331 = 0, $332 = 0, $333 = 0, $334 = 0, $335 = 0, $336 = 0, $337 = 0, $338 = 0;
 var $339 = 0, $34 = 0.0, $340 = 0, $341 = 0, $342 = 0, $343 = 0, $344 = 0, $345 = 0, $346 = 0, $347 = 0, $348 = 0, $349 = 0, $35 = 0.0, $350 = 0, $351 = 0, $352 = 0, $353 = 0, $354 = 0, $355 = 0, $356 = 0;
 var $357 = 0, $358 = 0, $359 = 0, $36 = 0, $360 = 0, $361 = 0, $362 = 0, $363 = 0, $364 = 0, $365 = 0, $366 = 0, $367 = 0, $368 = 0, $369 = 0, $37 = 0, $370 = 0, $371 = 0, $372 = 0, $373 = 0, $374 = 0;
 var $375 = 0, $376 = 0, $377 = 0, $378 = 0, $379 = 0, $38 = 0, $380 = 0, $381 = 0, $382 = 0, $383 = 0, $384 = 0, $385 = 0, $386 = 0, $387 = 0, $388 = 0, $389 = 0, $39 = 0, $390 = 0, $391 = 0, $40 = 0;
 var $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $50 = 0.0, $51 = 0, $52 = 0, $53 = 0, $54 = 0.0, $55 = 0.0, $56 = 0.0, $57 = 0.0, $58 = 0.0, $59 = 0.0, $6 = 0;
 var $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0;
 var $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0.0, $88 = 0.0, $89 = 0.0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0;
 var $97 = 0, $98 = 0, $99 = 0, $not$ = 0, $or$cond = 0, $or$cond3$not = 0, $or$cond542 = 0, $or$cond545 = 0, $or$cond556 = 0, $or$cond6 = 0, $scevgep686 = 0, $scevgep686687 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 560|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(560|0);
 $6 = sp + 8|0;
 $7 = sp;
 $8 = sp + 524|0;
 $9 = $8;
 $10 = sp + 512|0;
 HEAP32[$7>>2] = 0;
 $11 = ((($10)) + 12|0);
 (___DOUBLE_BITS_670($1)|0);
 $12 = tempRet0;
 $13 = ($12|0)<(0);
 if ($13) {
  $14 = - $1;
  $$0471 = $14;$$0520 = 1;$$0521 = 33463;
 } else {
  $15 = $4 & 2048;
  $16 = ($15|0)==(0);
  $17 = $4 & 1;
  $18 = ($17|0)==(0);
  $$ = $18 ? (33464) : (33469);
  $$$ = $16 ? $$ : (33466);
  $19 = $4 & 2049;
  $20 = ($19|0)!=(0);
  $$534$ = $20&1;
  $$0471 = $1;$$0520 = $$534$;$$0521 = $$$;
 }
 (___DOUBLE_BITS_670($$0471)|0);
 $21 = tempRet0;
 $22 = $21 & 2146435072;
 $23 = (0)==(0);
 $24 = ($22|0)==(2146435072);
 $25 = $23 & $24;
 do {
  if ($25) {
   $26 = $5 & 32;
   $27 = ($26|0)!=(0);
   $28 = $27 ? 33482 : 33486;
   $29 = ($$0471 != $$0471) | (0.0 != 0.0);
   $30 = $27 ? 33490 : 33494;
   $$0510 = $29 ? $30 : $28;
   $31 = (($$0520) + 3)|0;
   $32 = $4 & -65537;
   _pad_669($0,32,$2,$31,$32);
   _out($0,$$0521,$$0520);
   _out($0,$$0510,3);
   $33 = $4 ^ 8192;
   _pad_669($0,32,$2,$31,$33);
   $$sink560 = $31;
  } else {
   $34 = (+_frexpl($$0471,$7));
   $35 = $34 * 2.0;
   $36 = $35 != 0.0;
   if ($36) {
    $37 = HEAP32[$7>>2]|0;
    $38 = (($37) + -1)|0;
    HEAP32[$7>>2] = $38;
   }
   $39 = $5 | 32;
   $40 = ($39|0)==(97);
   if ($40) {
    $41 = $5 & 32;
    $42 = ($41|0)==(0);
    $43 = ((($$0521)) + 9|0);
    $$0521$ = $42 ? $$0521 : $43;
    $44 = $$0520 | 2;
    $45 = ($3>>>0)>(11);
    $46 = (12 - ($3))|0;
    $47 = ($46|0)==(0);
    $48 = $45 | $47;
    do {
     if ($48) {
      $$1472 = $35;
     } else {
      $$0509585 = 8.0;$$1508586 = $46;
      while(1) {
       $49 = (($$1508586) + -1)|0;
       $50 = $$0509585 * 16.0;
       $51 = ($49|0)==(0);
       if ($51) {
        break;
       } else {
        $$0509585 = $50;$$1508586 = $49;
       }
      }
      $52 = HEAP8[$$0521$>>0]|0;
      $53 = ($52<<24>>24)==(45);
      if ($53) {
       $54 = - $35;
       $55 = $54 - $50;
       $56 = $50 + $55;
       $57 = - $56;
       $$1472 = $57;
       break;
      } else {
       $58 = $35 + $50;
       $59 = $58 - $50;
       $$1472 = $59;
       break;
      }
     }
    } while(0);
    $60 = HEAP32[$7>>2]|0;
    $61 = ($60|0)<(0);
    $62 = (0 - ($60))|0;
    $63 = $61 ? $62 : $60;
    $64 = ($63|0)<(0);
    $65 = $64 << 31 >> 31;
    $66 = (_fmt_u($63,$65,$11)|0);
    $67 = ($66|0)==($11|0);
    if ($67) {
     $68 = ((($10)) + 11|0);
     HEAP8[$68>>0] = 48;
     $$0511 = $68;
    } else {
     $$0511 = $66;
    }
    $69 = $60 >> 31;
    $70 = $69 & 2;
    $71 = (($70) + 43)|0;
    $72 = $71&255;
    $73 = ((($$0511)) + -1|0);
    HEAP8[$73>>0] = $72;
    $74 = (($5) + 15)|0;
    $75 = $74&255;
    $76 = ((($$0511)) + -2|0);
    HEAP8[$76>>0] = $75;
    $77 = ($3|0)<(1);
    $78 = $4 & 8;
    $79 = ($78|0)==(0);
    $$0523 = $8;$$2473 = $$1472;
    while(1) {
     $80 = (~~(($$2473)));
     $81 = (33498 + ($80)|0);
     $82 = HEAP8[$81>>0]|0;
     $83 = $82&255;
     $84 = $41 | $83;
     $85 = $84&255;
     $86 = ((($$0523)) + 1|0);
     HEAP8[$$0523>>0] = $85;
     $87 = (+($80|0));
     $88 = $$2473 - $87;
     $89 = $88 * 16.0;
     $90 = $86;
     $91 = (($90) - ($9))|0;
     $92 = ($91|0)==(1);
     if ($92) {
      $93 = $89 == 0.0;
      $or$cond3$not = $77 & $93;
      $or$cond = $79 & $or$cond3$not;
      if ($or$cond) {
       $$1524 = $86;
      } else {
       $94 = ((($$0523)) + 2|0);
       HEAP8[$86>>0] = 46;
       $$1524 = $94;
      }
     } else {
      $$1524 = $86;
     }
     $95 = $89 != 0.0;
     if ($95) {
      $$0523 = $$1524;$$2473 = $89;
     } else {
      break;
     }
    }
    $96 = ($3|0)==(0);
    $$pre693 = $$1524;
    if ($96) {
     label = 24;
    } else {
     $97 = (-2 - ($9))|0;
     $98 = (($97) + ($$pre693))|0;
     $99 = ($98|0)<($3|0);
     if ($99) {
      $100 = (($3) + 2)|0;
      $$pre690 = (($$pre693) - ($9))|0;
      $$pre$phi691Z2D = $$pre690;$$sink = $100;
     } else {
      label = 24;
     }
    }
    if ((label|0) == 24) {
     $101 = (($$pre693) - ($9))|0;
     $$pre$phi691Z2D = $101;$$sink = $101;
    }
    $102 = $11;
    $103 = $76;
    $104 = (($102) - ($103))|0;
    $105 = (($104) + ($44))|0;
    $106 = (($105) + ($$sink))|0;
    _pad_669($0,32,$2,$106,$4);
    _out($0,$$0521$,$44);
    $107 = $4 ^ 65536;
    _pad_669($0,48,$2,$106,$107);
    _out($0,$8,$$pre$phi691Z2D);
    $108 = (($$sink) - ($$pre$phi691Z2D))|0;
    _pad_669($0,48,$108,0,0);
    _out($0,$76,$104);
    $109 = $4 ^ 8192;
    _pad_669($0,32,$2,$106,$109);
    $$sink560 = $106;
    break;
   }
   $110 = ($3|0)<(0);
   $$540 = $110 ? 6 : $3;
   if ($36) {
    $111 = $35 * 268435456.0;
    $112 = HEAP32[$7>>2]|0;
    $113 = (($112) + -28)|0;
    HEAP32[$7>>2] = $113;
    $$3 = $111;$$pr = $113;
   } else {
    $$pre = HEAP32[$7>>2]|0;
    $$3 = $35;$$pr = $$pre;
   }
   $114 = ($$pr|0)<(0);
   $115 = ((($6)) + 288|0);
   $$561 = $114 ? $6 : $115;
   $$0498 = $$561;$$4 = $$3;
   while(1) {
    $116 = (~~(($$4))>>>0);
    HEAP32[$$0498>>2] = $116;
    $117 = ((($$0498)) + 4|0);
    $118 = (+($116>>>0));
    $119 = $$4 - $118;
    $120 = $119 * 1.0E+9;
    $121 = $120 != 0.0;
    if ($121) {
     $$0498 = $117;$$4 = $120;
    } else {
     break;
    }
   }
   $122 = ($$pr|0)>(0);
   if ($122) {
    $$1482663 = $$561;$$1499662 = $117;$124 = $$pr;
    while(1) {
     $123 = ($124|0)<(29);
     $125 = $123 ? $124 : 29;
     $$0488655 = ((($$1499662)) + -4|0);
     $126 = ($$0488655>>>0)<($$1482663>>>0);
     if ($126) {
      $$2483$ph = $$1482663;
     } else {
      $$0488657 = $$0488655;$$0497656 = 0;
      while(1) {
       $127 = HEAP32[$$0488657>>2]|0;
       $128 = (_bitshift64Shl(($127|0),0,($125|0))|0);
       $129 = tempRet0;
       $130 = (_i64Add(($128|0),($129|0),($$0497656|0),0)|0);
       $131 = tempRet0;
       $132 = (___uremdi3(($130|0),($131|0),1000000000,0)|0);
       $133 = tempRet0;
       HEAP32[$$0488657>>2] = $132;
       $134 = (___udivdi3(($130|0),($131|0),1000000000,0)|0);
       $135 = tempRet0;
       $$0488 = ((($$0488657)) + -4|0);
       $136 = ($$0488>>>0)<($$1482663>>>0);
       if ($136) {
        break;
       } else {
        $$0488657 = $$0488;$$0497656 = $134;
       }
      }
      $137 = ($134|0)==(0);
      if ($137) {
       $$2483$ph = $$1482663;
      } else {
       $138 = ((($$1482663)) + -4|0);
       HEAP32[$138>>2] = $134;
       $$2483$ph = $138;
      }
     }
     $$2500 = $$1499662;
     while(1) {
      $139 = ($$2500>>>0)>($$2483$ph>>>0);
      if (!($139)) {
       break;
      }
      $140 = ((($$2500)) + -4|0);
      $141 = HEAP32[$140>>2]|0;
      $142 = ($141|0)==(0);
      if ($142) {
       $$2500 = $140;
      } else {
       break;
      }
     }
     $143 = HEAP32[$7>>2]|0;
     $144 = (($143) - ($125))|0;
     HEAP32[$7>>2] = $144;
     $145 = ($144|0)>(0);
     if ($145) {
      $$1482663 = $$2483$ph;$$1499662 = $$2500;$124 = $144;
     } else {
      $$1482$lcssa = $$2483$ph;$$1499$lcssa = $$2500;$$pr566 = $144;
      break;
     }
    }
   } else {
    $$1482$lcssa = $$561;$$1499$lcssa = $117;$$pr566 = $$pr;
   }
   $146 = ($$pr566|0)<(0);
   if ($146) {
    $147 = (($$540) + 25)|0;
    $148 = (($147|0) / 9)&-1;
    $149 = (($148) + 1)|0;
    $150 = ($39|0)==(102);
    $$3484650 = $$1482$lcssa;$$3501649 = $$1499$lcssa;$152 = $$pr566;
    while(1) {
     $151 = (0 - ($152))|0;
     $153 = ($151|0)<(9);
     $154 = $153 ? $151 : 9;
     $155 = ($$3484650>>>0)<($$3501649>>>0);
     if ($155) {
      $159 = 1 << $154;
      $160 = (($159) + -1)|0;
      $161 = 1000000000 >>> $154;
      $$0487644 = 0;$$1489643 = $$3484650;
      while(1) {
       $162 = HEAP32[$$1489643>>2]|0;
       $163 = $162 & $160;
       $164 = $162 >>> $154;
       $165 = (($164) + ($$0487644))|0;
       HEAP32[$$1489643>>2] = $165;
       $166 = Math_imul($163, $161)|0;
       $167 = ((($$1489643)) + 4|0);
       $168 = ($167>>>0)<($$3501649>>>0);
       if ($168) {
        $$0487644 = $166;$$1489643 = $167;
       } else {
        break;
       }
      }
      $169 = HEAP32[$$3484650>>2]|0;
      $170 = ($169|0)==(0);
      $171 = ((($$3484650)) + 4|0);
      $$$3484 = $170 ? $171 : $$3484650;
      $172 = ($166|0)==(0);
      if ($172) {
       $$$3484700 = $$$3484;$$4502 = $$3501649;
      } else {
       $173 = ((($$3501649)) + 4|0);
       HEAP32[$$3501649>>2] = $166;
       $$$3484700 = $$$3484;$$4502 = $173;
      }
     } else {
      $156 = HEAP32[$$3484650>>2]|0;
      $157 = ($156|0)==(0);
      $158 = ((($$3484650)) + 4|0);
      $$$3484699 = $157 ? $158 : $$3484650;
      $$$3484700 = $$$3484699;$$4502 = $$3501649;
     }
     $174 = $150 ? $$561 : $$$3484700;
     $175 = $$4502;
     $176 = $174;
     $177 = (($175) - ($176))|0;
     $178 = $177 >> 2;
     $179 = ($178|0)>($149|0);
     $180 = (($174) + ($149<<2)|0);
     $$$4502 = $179 ? $180 : $$4502;
     $181 = HEAP32[$7>>2]|0;
     $182 = (($181) + ($154))|0;
     HEAP32[$7>>2] = $182;
     $183 = ($182|0)<(0);
     if ($183) {
      $$3484650 = $$$3484700;$$3501649 = $$$4502;$152 = $182;
     } else {
      $$3484$lcssa = $$$3484700;$$3501$lcssa = $$$4502;
      break;
     }
    }
   } else {
    $$3484$lcssa = $$1482$lcssa;$$3501$lcssa = $$1499$lcssa;
   }
   $184 = ($$3484$lcssa>>>0)<($$3501$lcssa>>>0);
   $185 = $$561;
   if ($184) {
    $186 = $$3484$lcssa;
    $187 = (($185) - ($186))|0;
    $188 = $187 >> 2;
    $189 = ($188*9)|0;
    $190 = HEAP32[$$3484$lcssa>>2]|0;
    $191 = ($190>>>0)<(10);
    if ($191) {
     $$1515 = $189;
    } else {
     $$0514639 = $189;$$0530638 = 10;
     while(1) {
      $192 = ($$0530638*10)|0;
      $193 = (($$0514639) + 1)|0;
      $194 = ($190>>>0)<($192>>>0);
      if ($194) {
       $$1515 = $193;
       break;
      } else {
       $$0514639 = $193;$$0530638 = $192;
      }
     }
    }
   } else {
    $$1515 = 0;
   }
   $195 = ($39|0)!=(102);
   $196 = $195 ? $$1515 : 0;
   $197 = (($$540) - ($196))|0;
   $198 = ($39|0)==(103);
   $199 = ($$540|0)!=(0);
   $200 = $199 & $198;
   $$neg = $200 << 31 >> 31;
   $201 = (($197) + ($$neg))|0;
   $202 = $$3501$lcssa;
   $203 = (($202) - ($185))|0;
   $204 = $203 >> 2;
   $205 = ($204*9)|0;
   $206 = (($205) + -9)|0;
   $207 = ($201|0)<($206|0);
   if ($207) {
    $208 = ((($$561)) + 4|0);
    $209 = (($201) + 9216)|0;
    $210 = (($209|0) / 9)&-1;
    $211 = (($210) + -1024)|0;
    $212 = (($208) + ($211<<2)|0);
    $213 = (($209|0) % 9)&-1;
    $214 = ($213|0)<(8);
    if ($214) {
     $$0527$in633 = $213;$$1531632 = 10;
     while(1) {
      $$0527 = (($$0527$in633) + 1)|0;
      $215 = ($$1531632*10)|0;
      $216 = ($$0527$in633|0)<(7);
      if ($216) {
       $$0527$in633 = $$0527;$$1531632 = $215;
      } else {
       $$1531$lcssa = $215;
       break;
      }
     }
    } else {
     $$1531$lcssa = 10;
    }
    $217 = HEAP32[$212>>2]|0;
    $218 = (($217>>>0) % ($$1531$lcssa>>>0))&-1;
    $219 = ($218|0)==(0);
    $220 = ((($212)) + 4|0);
    $221 = ($220|0)==($$3501$lcssa|0);
    $or$cond542 = $221 & $219;
    if ($or$cond542) {
     $$4492 = $212;$$4518 = $$1515;$$8 = $$3484$lcssa;
    } else {
     $222 = (($217>>>0) / ($$1531$lcssa>>>0))&-1;
     $223 = $222 & 1;
     $224 = ($223|0)==(0);
     $$543 = $224 ? 9007199254740992.0 : 9007199254740994.0;
     $225 = (($$1531$lcssa|0) / 2)&-1;
     $226 = ($218>>>0)<($225>>>0);
     $227 = ($218|0)==($225|0);
     $or$cond545 = $221 & $227;
     $$564 = $or$cond545 ? 1.0 : 1.5;
     $$$564 = $226 ? 0.5 : $$564;
     $228 = ($$0520|0)==(0);
     if ($228) {
      $$1467 = $$$564;$$1469 = $$543;
     } else {
      $229 = HEAP8[$$0521>>0]|0;
      $230 = ($229<<24>>24)==(45);
      $231 = - $$543;
      $232 = - $$$564;
      $$$543 = $230 ? $231 : $$543;
      $$$$564 = $230 ? $232 : $$$564;
      $$1467 = $$$$564;$$1469 = $$$543;
     }
     $233 = (($217) - ($218))|0;
     HEAP32[$212>>2] = $233;
     $234 = $$1469 + $$1467;
     $235 = $234 != $$1469;
     if ($235) {
      $236 = (($233) + ($$1531$lcssa))|0;
      HEAP32[$212>>2] = $236;
      $237 = ($236>>>0)>(999999999);
      if ($237) {
       $$5486626 = $$3484$lcssa;$$sink547625 = $212;
       while(1) {
        $238 = ((($$sink547625)) + -4|0);
        HEAP32[$$sink547625>>2] = 0;
        $239 = ($238>>>0)<($$5486626>>>0);
        if ($239) {
         $240 = ((($$5486626)) + -4|0);
         HEAP32[$240>>2] = 0;
         $$6 = $240;
        } else {
         $$6 = $$5486626;
        }
        $241 = HEAP32[$238>>2]|0;
        $242 = (($241) + 1)|0;
        HEAP32[$238>>2] = $242;
        $243 = ($242>>>0)>(999999999);
        if ($243) {
         $$5486626 = $$6;$$sink547625 = $238;
        } else {
         $$5486$lcssa = $$6;$$sink547$lcssa = $238;
         break;
        }
       }
      } else {
       $$5486$lcssa = $$3484$lcssa;$$sink547$lcssa = $212;
      }
      $244 = $$5486$lcssa;
      $245 = (($185) - ($244))|0;
      $246 = $245 >> 2;
      $247 = ($246*9)|0;
      $248 = HEAP32[$$5486$lcssa>>2]|0;
      $249 = ($248>>>0)<(10);
      if ($249) {
       $$4492 = $$sink547$lcssa;$$4518 = $247;$$8 = $$5486$lcssa;
      } else {
       $$2516621 = $247;$$2532620 = 10;
       while(1) {
        $250 = ($$2532620*10)|0;
        $251 = (($$2516621) + 1)|0;
        $252 = ($248>>>0)<($250>>>0);
        if ($252) {
         $$4492 = $$sink547$lcssa;$$4518 = $251;$$8 = $$5486$lcssa;
         break;
        } else {
         $$2516621 = $251;$$2532620 = $250;
        }
       }
      }
     } else {
      $$4492 = $212;$$4518 = $$1515;$$8 = $$3484$lcssa;
     }
    }
    $253 = ((($$4492)) + 4|0);
    $254 = ($$3501$lcssa>>>0)>($253>>>0);
    $$$3501 = $254 ? $253 : $$3501$lcssa;
    $$5519$ph = $$4518;$$7505$ph = $$$3501;$$9$ph = $$8;
   } else {
    $$5519$ph = $$1515;$$7505$ph = $$3501$lcssa;$$9$ph = $$3484$lcssa;
   }
   $$7505 = $$7505$ph;
   while(1) {
    $255 = ($$7505>>>0)>($$9$ph>>>0);
    if (!($255)) {
     $$lcssa675 = 0;
     break;
    }
    $256 = ((($$7505)) + -4|0);
    $257 = HEAP32[$256>>2]|0;
    $258 = ($257|0)==(0);
    if ($258) {
     $$7505 = $256;
    } else {
     $$lcssa675 = 1;
     break;
    }
   }
   $259 = (0 - ($$5519$ph))|0;
   do {
    if ($198) {
     $not$ = $199 ^ 1;
     $260 = $not$&1;
     $$540$ = (($$540) + ($260))|0;
     $261 = ($$540$|0)>($$5519$ph|0);
     $262 = ($$5519$ph|0)>(-5);
     $or$cond6 = $261 & $262;
     if ($or$cond6) {
      $263 = (($5) + -1)|0;
      $$neg568 = (($$540$) + -1)|0;
      $264 = (($$neg568) - ($$5519$ph))|0;
      $$0479 = $263;$$2476 = $264;
     } else {
      $265 = (($5) + -2)|0;
      $266 = (($$540$) + -1)|0;
      $$0479 = $265;$$2476 = $266;
     }
     $267 = $4 & 8;
     $268 = ($267|0)==(0);
     if ($268) {
      if ($$lcssa675) {
       $269 = ((($$7505)) + -4|0);
       $270 = HEAP32[$269>>2]|0;
       $271 = ($270|0)==(0);
       if ($271) {
        $$2529 = 9;
       } else {
        $272 = (($270>>>0) % 10)&-1;
        $273 = ($272|0)==(0);
        if ($273) {
         $$1528617 = 0;$$3533616 = 10;
         while(1) {
          $274 = ($$3533616*10)|0;
          $275 = (($$1528617) + 1)|0;
          $276 = (($270>>>0) % ($274>>>0))&-1;
          $277 = ($276|0)==(0);
          if ($277) {
           $$1528617 = $275;$$3533616 = $274;
          } else {
           $$2529 = $275;
           break;
          }
         }
        } else {
         $$2529 = 0;
        }
       }
      } else {
       $$2529 = 9;
      }
      $278 = $$0479 | 32;
      $279 = ($278|0)==(102);
      $280 = $$7505;
      $281 = (($280) - ($185))|0;
      $282 = $281 >> 2;
      $283 = ($282*9)|0;
      $284 = (($283) + -9)|0;
      if ($279) {
       $285 = (($284) - ($$2529))|0;
       $286 = ($285|0)>(0);
       $$548 = $286 ? $285 : 0;
       $287 = ($$2476|0)<($$548|0);
       $$2476$$549 = $287 ? $$2476 : $$548;
       $$1480 = $$0479;$$3477 = $$2476$$549;$$pre$phi698Z2D = 0;
       break;
      } else {
       $288 = (($284) + ($$5519$ph))|0;
       $289 = (($288) - ($$2529))|0;
       $290 = ($289|0)>(0);
       $$550 = $290 ? $289 : 0;
       $291 = ($$2476|0)<($$550|0);
       $$2476$$551 = $291 ? $$2476 : $$550;
       $$1480 = $$0479;$$3477 = $$2476$$551;$$pre$phi698Z2D = 0;
       break;
      }
     } else {
      $$1480 = $$0479;$$3477 = $$2476;$$pre$phi698Z2D = $267;
     }
    } else {
     $$pre697 = $4 & 8;
     $$1480 = $5;$$3477 = $$540;$$pre$phi698Z2D = $$pre697;
    }
   } while(0);
   $292 = $$3477 | $$pre$phi698Z2D;
   $293 = ($292|0)!=(0);
   $294 = $293&1;
   $295 = $$1480 | 32;
   $296 = ($295|0)==(102);
   if ($296) {
    $297 = ($$5519$ph|0)>(0);
    $298 = $297 ? $$5519$ph : 0;
    $$2513 = 0;$$pn = $298;
   } else {
    $299 = ($$5519$ph|0)<(0);
    $300 = $299 ? $259 : $$5519$ph;
    $301 = ($300|0)<(0);
    $302 = $301 << 31 >> 31;
    $303 = (_fmt_u($300,$302,$11)|0);
    $304 = $11;
    $305 = $303;
    $306 = (($304) - ($305))|0;
    $307 = ($306|0)<(2);
    if ($307) {
     $$1512610 = $303;
     while(1) {
      $308 = ((($$1512610)) + -1|0);
      HEAP8[$308>>0] = 48;
      $309 = $308;
      $310 = (($304) - ($309))|0;
      $311 = ($310|0)<(2);
      if ($311) {
       $$1512610 = $308;
      } else {
       $$1512$lcssa = $308;
       break;
      }
     }
    } else {
     $$1512$lcssa = $303;
    }
    $312 = $$5519$ph >> 31;
    $313 = $312 & 2;
    $314 = (($313) + 43)|0;
    $315 = $314&255;
    $316 = ((($$1512$lcssa)) + -1|0);
    HEAP8[$316>>0] = $315;
    $317 = $$1480&255;
    $318 = ((($$1512$lcssa)) + -2|0);
    HEAP8[$318>>0] = $317;
    $319 = $318;
    $320 = (($304) - ($319))|0;
    $$2513 = $318;$$pn = $320;
   }
   $321 = (($$0520) + 1)|0;
   $322 = (($321) + ($$3477))|0;
   $$1526 = (($322) + ($294))|0;
   $323 = (($$1526) + ($$pn))|0;
   _pad_669($0,32,$2,$323,$4);
   _out($0,$$0521,$$0520);
   $324 = $4 ^ 65536;
   _pad_669($0,48,$2,$323,$324);
   if ($296) {
    $325 = ($$9$ph>>>0)>($$561>>>0);
    $$0496$$9 = $325 ? $$561 : $$9$ph;
    $326 = ((($8)) + 9|0);
    $327 = $326;
    $328 = ((($8)) + 8|0);
    $$5493600 = $$0496$$9;
    while(1) {
     $329 = HEAP32[$$5493600>>2]|0;
     $330 = (_fmt_u($329,0,$326)|0);
     $331 = ($$5493600|0)==($$0496$$9|0);
     if ($331) {
      $337 = ($330|0)==($326|0);
      if ($337) {
       HEAP8[$328>>0] = 48;
       $$1465 = $328;
      } else {
       $$1465 = $330;
      }
     } else {
      $332 = ($330>>>0)>($8>>>0);
      if ($332) {
       $333 = $330;
       $334 = (($333) - ($9))|0;
       _memset(($8|0),48,($334|0))|0;
       $$0464597 = $330;
       while(1) {
        $335 = ((($$0464597)) + -1|0);
        $336 = ($335>>>0)>($8>>>0);
        if ($336) {
         $$0464597 = $335;
        } else {
         $$1465 = $335;
         break;
        }
       }
      } else {
       $$1465 = $330;
      }
     }
     $338 = $$1465;
     $339 = (($327) - ($338))|0;
     _out($0,$$1465,$339);
     $340 = ((($$5493600)) + 4|0);
     $341 = ($340>>>0)>($$561>>>0);
     if ($341) {
      break;
     } else {
      $$5493600 = $340;
     }
    }
    $342 = ($292|0)==(0);
    if (!($342)) {
     _out($0,33514,1);
    }
    $343 = ($340>>>0)<($$7505>>>0);
    $344 = ($$3477|0)>(0);
    $345 = $343 & $344;
    if ($345) {
     $$4478593 = $$3477;$$6494592 = $340;
     while(1) {
      $346 = HEAP32[$$6494592>>2]|0;
      $347 = (_fmt_u($346,0,$326)|0);
      $348 = ($347>>>0)>($8>>>0);
      if ($348) {
       $349 = $347;
       $350 = (($349) - ($9))|0;
       _memset(($8|0),48,($350|0))|0;
       $$0463587 = $347;
       while(1) {
        $351 = ((($$0463587)) + -1|0);
        $352 = ($351>>>0)>($8>>>0);
        if ($352) {
         $$0463587 = $351;
        } else {
         $$0463$lcssa = $351;
         break;
        }
       }
      } else {
       $$0463$lcssa = $347;
      }
      $353 = ($$4478593|0)<(9);
      $354 = $353 ? $$4478593 : 9;
      _out($0,$$0463$lcssa,$354);
      $355 = ((($$6494592)) + 4|0);
      $356 = (($$4478593) + -9)|0;
      $357 = ($355>>>0)<($$7505>>>0);
      $358 = ($$4478593|0)>(9);
      $359 = $357 & $358;
      if ($359) {
       $$4478593 = $356;$$6494592 = $355;
      } else {
       $$4478$lcssa = $356;
       break;
      }
     }
    } else {
     $$4478$lcssa = $$3477;
    }
    $360 = (($$4478$lcssa) + 9)|0;
    _pad_669($0,48,$360,9,0);
   } else {
    $361 = ((($$9$ph)) + 4|0);
    $$7505$ = $$lcssa675 ? $$7505 : $361;
    $362 = ($$3477|0)>(-1);
    if ($362) {
     $363 = ((($8)) + 9|0);
     $364 = ($$pre$phi698Z2D|0)==(0);
     $365 = $363;
     $366 = (0 - ($9))|0;
     $367 = ((($8)) + 8|0);
     $$5605 = $$3477;$$7495604 = $$9$ph;
     while(1) {
      $368 = HEAP32[$$7495604>>2]|0;
      $369 = (_fmt_u($368,0,$363)|0);
      $370 = ($369|0)==($363|0);
      if ($370) {
       HEAP8[$367>>0] = 48;
       $$0 = $367;
      } else {
       $$0 = $369;
      }
      $371 = ($$7495604|0)==($$9$ph|0);
      do {
       if ($371) {
        $375 = ((($$0)) + 1|0);
        _out($0,$$0,1);
        $376 = ($$5605|0)<(1);
        $or$cond556 = $364 & $376;
        if ($or$cond556) {
         $$2 = $375;
         break;
        }
        _out($0,33514,1);
        $$2 = $375;
       } else {
        $372 = ($$0>>>0)>($8>>>0);
        if (!($372)) {
         $$2 = $$0;
         break;
        }
        $scevgep686 = (($$0) + ($366)|0);
        $scevgep686687 = $scevgep686;
        _memset(($8|0),48,($scevgep686687|0))|0;
        $$1601 = $$0;
        while(1) {
         $373 = ((($$1601)) + -1|0);
         $374 = ($373>>>0)>($8>>>0);
         if ($374) {
          $$1601 = $373;
         } else {
          $$2 = $373;
          break;
         }
        }
       }
      } while(0);
      $377 = $$2;
      $378 = (($365) - ($377))|0;
      $379 = ($$5605|0)>($378|0);
      $380 = $379 ? $378 : $$5605;
      _out($0,$$2,$380);
      $381 = (($$5605) - ($378))|0;
      $382 = ((($$7495604)) + 4|0);
      $383 = ($382>>>0)<($$7505$>>>0);
      $384 = ($381|0)>(-1);
      $385 = $383 & $384;
      if ($385) {
       $$5605 = $381;$$7495604 = $382;
      } else {
       $$5$lcssa = $381;
       break;
      }
     }
    } else {
     $$5$lcssa = $$3477;
    }
    $386 = (($$5$lcssa) + 18)|0;
    _pad_669($0,48,$386,18,0);
    $387 = $11;
    $388 = $$2513;
    $389 = (($387) - ($388))|0;
    _out($0,$$2513,$389);
   }
   $390 = $4 ^ 8192;
   _pad_669($0,32,$2,$323,$390);
   $$sink560 = $323;
  }
 } while(0);
 $391 = ($$sink560|0)<($2|0);
 $$557 = $391 ? $2 : $$sink560;
 STACKTOP = sp;return ($$557|0);
}
function ___DOUBLE_BITS_670($0) {
 $0 = +$0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 HEAPF64[tempDoublePtr>>3] = $0;$1 = HEAP32[tempDoublePtr>>2]|0;
 $2 = HEAP32[tempDoublePtr+4>>2]|0;
 tempRet0 = ($2);
 return ($1|0);
}
function _frexpl($0,$1) {
 $0 = +$0;
 $1 = $1|0;
 var $2 = 0.0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = (+_frexp($0,$1));
 return (+$2);
}
function _frexp($0,$1) {
 $0 = +$0;
 $1 = $1|0;
 var $$0 = 0.0, $$016 = 0.0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0.0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0.0, $9 = 0.0, $storemerge = 0, $trunc$clear = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 HEAPF64[tempDoublePtr>>3] = $0;$2 = HEAP32[tempDoublePtr>>2]|0;
 $3 = HEAP32[tempDoublePtr+4>>2]|0;
 $4 = (_bitshift64Lshr(($2|0),($3|0),52)|0);
 $5 = tempRet0;
 $6 = $4&65535;
 $trunc$clear = $6 & 2047;
 switch ($trunc$clear<<16>>16) {
 case 0:  {
  $7 = $0 != 0.0;
  if ($7) {
   $8 = $0 * 1.8446744073709552E+19;
   $9 = (+_frexp($8,$1));
   $10 = HEAP32[$1>>2]|0;
   $11 = (($10) + -64)|0;
   $$016 = $9;$storemerge = $11;
  } else {
   $$016 = $0;$storemerge = 0;
  }
  HEAP32[$1>>2] = $storemerge;
  $$0 = $$016;
  break;
 }
 case 2047:  {
  $$0 = $0;
  break;
 }
 default: {
  $12 = $4 & 2047;
  $13 = (($12) + -1022)|0;
  HEAP32[$1>>2] = $13;
  $14 = $3 & -2146435073;
  $15 = $14 | 1071644672;
  HEAP32[tempDoublePtr>>2] = $2;HEAP32[tempDoublePtr+4>>2] = $15;$16 = +HEAPF64[tempDoublePtr>>3];
  $$0 = $16;
 }
 }
 return (+$$0);
}
function _wcrtomb($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$0 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0;
 var $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = ($0|0)==(0|0);
 do {
  if ($3) {
   $$0 = 1;
  } else {
   $4 = ($1>>>0)<(128);
   if ($4) {
    $5 = $1&255;
    HEAP8[$0>>0] = $5;
    $$0 = 1;
    break;
   }
   $6 = (___pthread_self_443()|0);
   $7 = ((($6)) + 188|0);
   $8 = HEAP32[$7>>2]|0;
   $9 = HEAP32[$8>>2]|0;
   $10 = ($9|0)==(0|0);
   if ($10) {
    $11 = $1 & -128;
    $12 = ($11|0)==(57216);
    if ($12) {
     $14 = $1&255;
     HEAP8[$0>>0] = $14;
     $$0 = 1;
     break;
    } else {
     $13 = (___errno_location()|0);
     HEAP32[$13>>2] = 84;
     $$0 = -1;
     break;
    }
   }
   $15 = ($1>>>0)<(2048);
   if ($15) {
    $16 = $1 >>> 6;
    $17 = $16 | 192;
    $18 = $17&255;
    $19 = ((($0)) + 1|0);
    HEAP8[$0>>0] = $18;
    $20 = $1 & 63;
    $21 = $20 | 128;
    $22 = $21&255;
    HEAP8[$19>>0] = $22;
    $$0 = 2;
    break;
   }
   $23 = ($1>>>0)<(55296);
   $24 = $1 & -8192;
   $25 = ($24|0)==(57344);
   $or$cond = $23 | $25;
   if ($or$cond) {
    $26 = $1 >>> 12;
    $27 = $26 | 224;
    $28 = $27&255;
    $29 = ((($0)) + 1|0);
    HEAP8[$0>>0] = $28;
    $30 = $1 >>> 6;
    $31 = $30 & 63;
    $32 = $31 | 128;
    $33 = $32&255;
    $34 = ((($0)) + 2|0);
    HEAP8[$29>>0] = $33;
    $35 = $1 & 63;
    $36 = $35 | 128;
    $37 = $36&255;
    HEAP8[$34>>0] = $37;
    $$0 = 3;
    break;
   }
   $38 = (($1) + -65536)|0;
   $39 = ($38>>>0)<(1048576);
   if ($39) {
    $40 = $1 >>> 18;
    $41 = $40 | 240;
    $42 = $41&255;
    $43 = ((($0)) + 1|0);
    HEAP8[$0>>0] = $42;
    $44 = $1 >>> 12;
    $45 = $44 & 63;
    $46 = $45 | 128;
    $47 = $46&255;
    $48 = ((($0)) + 2|0);
    HEAP8[$43>>0] = $47;
    $49 = $1 >>> 6;
    $50 = $49 & 63;
    $51 = $50 | 128;
    $52 = $51&255;
    $53 = ((($0)) + 3|0);
    HEAP8[$48>>0] = $52;
    $54 = $1 & 63;
    $55 = $54 | 128;
    $56 = $55&255;
    HEAP8[$53>>0] = $56;
    $$0 = 4;
    break;
   } else {
    $57 = (___errno_location()|0);
    HEAP32[$57>>2] = 84;
    $$0 = -1;
    break;
   }
  }
 } while(0);
 return ($$0|0);
}
function ___pthread_self_443() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (_pthread_self()|0);
 return ($0|0);
}
function _pthread_self() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (3268|0);
}
function ___pthread_self_105() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (_pthread_self()|0);
 return ($0|0);
}
function ___strerror_l($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$012$lcssa = 0, $$01214 = 0, $$016 = 0, $$113 = 0, $$115 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 $$016 = 0;
 while(1) {
  $3 = (33516 + ($$016)|0);
  $4 = HEAP8[$3>>0]|0;
  $5 = $4&255;
  $6 = ($5|0)==($0|0);
  if ($6) {
   label = 2;
   break;
  }
  $7 = (($$016) + 1)|0;
  $8 = ($7|0)==(87);
  if ($8) {
   $$01214 = 33604;$$115 = 87;
   label = 5;
   break;
  } else {
   $$016 = $7;
  }
 }
 if ((label|0) == 2) {
  $2 = ($$016|0)==(0);
  if ($2) {
   $$012$lcssa = 33604;
  } else {
   $$01214 = 33604;$$115 = $$016;
   label = 5;
  }
 }
 if ((label|0) == 5) {
  while(1) {
   label = 0;
   $$113 = $$01214;
   while(1) {
    $9 = HEAP8[$$113>>0]|0;
    $10 = ($9<<24>>24)==(0);
    $11 = ((($$113)) + 1|0);
    if ($10) {
     break;
    } else {
     $$113 = $11;
    }
   }
   $12 = (($$115) + -1)|0;
   $13 = ($12|0)==(0);
   if ($13) {
    $$012$lcssa = $11;
    break;
   } else {
    $$01214 = $11;$$115 = $12;
    label = 5;
   }
  }
 }
 $14 = ((($1)) + 20|0);
 $15 = HEAP32[$14>>2]|0;
 $16 = (___lctrans($$012$lcssa,$15)|0);
 return ($16|0);
}
function ___lctrans($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = (___lctrans_impl($0,$1)|0);
 return ($2|0);
}
function ___lctrans_impl($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$0 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ($1|0)==(0|0);
 if ($2) {
  $$0 = 0;
 } else {
  $3 = HEAP32[$1>>2]|0;
  $4 = ((($1)) + 4|0);
  $5 = HEAP32[$4>>2]|0;
  $6 = (___mo_lookup($3,$5,$0)|0);
  $$0 = $6;
 }
 $7 = ($$0|0)!=(0|0);
 $8 = $7 ? $$0 : $0;
 return ($8|0);
}
function ___mo_lookup($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$ = 0, $$090 = 0, $$094 = 0, $$191 = 0, $$195 = 0, $$4 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0;
 var $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0;
 var $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0;
 var $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, $or$cond102 = 0, $or$cond104 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = HEAP32[$0>>2]|0;
 $4 = (($3) + 1794895138)|0;
 $5 = ((($0)) + 8|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = (_swapc($6,$4)|0);
 $8 = ((($0)) + 12|0);
 $9 = HEAP32[$8>>2]|0;
 $10 = (_swapc($9,$4)|0);
 $11 = ((($0)) + 16|0);
 $12 = HEAP32[$11>>2]|0;
 $13 = (_swapc($12,$4)|0);
 $14 = $1 >>> 2;
 $15 = ($7>>>0)<($14>>>0);
 L1: do {
  if ($15) {
   $16 = $7 << 2;
   $17 = (($1) - ($16))|0;
   $18 = ($10>>>0)<($17>>>0);
   $19 = ($13>>>0)<($17>>>0);
   $or$cond = $18 & $19;
   if ($or$cond) {
    $20 = $13 | $10;
    $21 = $20 & 3;
    $22 = ($21|0)==(0);
    if ($22) {
     $23 = $10 >>> 2;
     $24 = $13 >>> 2;
     $$090 = 0;$$094 = $7;
     while(1) {
      $25 = $$094 >>> 1;
      $26 = (($$090) + ($25))|0;
      $27 = $26 << 1;
      $28 = (($27) + ($23))|0;
      $29 = (($0) + ($28<<2)|0);
      $30 = HEAP32[$29>>2]|0;
      $31 = (_swapc($30,$4)|0);
      $32 = (($28) + 1)|0;
      $33 = (($0) + ($32<<2)|0);
      $34 = HEAP32[$33>>2]|0;
      $35 = (_swapc($34,$4)|0);
      $36 = ($35>>>0)<($1>>>0);
      $37 = (($1) - ($35))|0;
      $38 = ($31>>>0)<($37>>>0);
      $or$cond102 = $36 & $38;
      if (!($or$cond102)) {
       $$4 = 0;
       break L1;
      }
      $39 = (($35) + ($31))|0;
      $40 = (($0) + ($39)|0);
      $41 = HEAP8[$40>>0]|0;
      $42 = ($41<<24>>24)==(0);
      if (!($42)) {
       $$4 = 0;
       break L1;
      }
      $43 = (($0) + ($35)|0);
      $44 = (_strcmp($2,$43)|0);
      $45 = ($44|0)==(0);
      if ($45) {
       break;
      }
      $62 = ($$094|0)==(1);
      $63 = ($44|0)<(0);
      $64 = (($$094) - ($25))|0;
      $$195 = $63 ? $25 : $64;
      $$191 = $63 ? $$090 : $26;
      if ($62) {
       $$4 = 0;
       break L1;
      } else {
       $$090 = $$191;$$094 = $$195;
      }
     }
     $46 = (($27) + ($24))|0;
     $47 = (($0) + ($46<<2)|0);
     $48 = HEAP32[$47>>2]|0;
     $49 = (_swapc($48,$4)|0);
     $50 = (($46) + 1)|0;
     $51 = (($0) + ($50<<2)|0);
     $52 = HEAP32[$51>>2]|0;
     $53 = (_swapc($52,$4)|0);
     $54 = ($53>>>0)<($1>>>0);
     $55 = (($1) - ($53))|0;
     $56 = ($49>>>0)<($55>>>0);
     $or$cond104 = $54 & $56;
     if ($or$cond104) {
      $57 = (($0) + ($53)|0);
      $58 = (($53) + ($49))|0;
      $59 = (($0) + ($58)|0);
      $60 = HEAP8[$59>>0]|0;
      $61 = ($60<<24>>24)==(0);
      $$ = $61 ? $57 : 0;
      $$4 = $$;
     } else {
      $$4 = 0;
     }
    } else {
     $$4 = 0;
    }
   } else {
    $$4 = 0;
   }
  } else {
   $$4 = 0;
  }
 } while(0);
 return ($$4|0);
}
function _swapc($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$ = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ($1|0)==(0);
 $3 = (_llvm_bswap_i32(($0|0))|0);
 $$ = $2 ? $0 : $3;
 return ($$|0);
}
function ___fwritex($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$038 = 0, $$042 = 0, $$1 = 0, $$139 = 0, $$141 = 0, $$143 = 0, $$pre = 0, $$pre47 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0;
 var $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 $3 = ((($2)) + 16|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ($4|0)==(0|0);
 if ($5) {
  $7 = (___towrite($2)|0);
  $8 = ($7|0)==(0);
  if ($8) {
   $$pre = HEAP32[$3>>2]|0;
   $12 = $$pre;
   label = 5;
  } else {
   $$1 = 0;
  }
 } else {
  $6 = $4;
  $12 = $6;
  label = 5;
 }
 L5: do {
  if ((label|0) == 5) {
   $9 = ((($2)) + 20|0);
   $10 = HEAP32[$9>>2]|0;
   $11 = (($12) - ($10))|0;
   $13 = ($11>>>0)<($1>>>0);
   $14 = $10;
   if ($13) {
    $15 = ((($2)) + 36|0);
    $16 = HEAP32[$15>>2]|0;
    $17 = (FUNCTION_TABLE_iiii[$16 & 63]($2,$0,$1)|0);
    $$1 = $17;
    break;
   }
   $18 = ((($2)) + 75|0);
   $19 = HEAP8[$18>>0]|0;
   $20 = ($19<<24>>24)>(-1);
   L10: do {
    if ($20) {
     $$038 = $1;
     while(1) {
      $21 = ($$038|0)==(0);
      if ($21) {
       $$139 = 0;$$141 = $0;$$143 = $1;$31 = $14;
       break L10;
      }
      $22 = (($$038) + -1)|0;
      $23 = (($0) + ($22)|0);
      $24 = HEAP8[$23>>0]|0;
      $25 = ($24<<24>>24)==(10);
      if ($25) {
       break;
      } else {
       $$038 = $22;
      }
     }
     $26 = ((($2)) + 36|0);
     $27 = HEAP32[$26>>2]|0;
     $28 = (FUNCTION_TABLE_iiii[$27 & 63]($2,$0,$$038)|0);
     $29 = ($28>>>0)<($$038>>>0);
     if ($29) {
      $$1 = $28;
      break L5;
     }
     $30 = (($0) + ($$038)|0);
     $$042 = (($1) - ($$038))|0;
     $$pre47 = HEAP32[$9>>2]|0;
     $$139 = $$038;$$141 = $30;$$143 = $$042;$31 = $$pre47;
    } else {
     $$139 = 0;$$141 = $0;$$143 = $1;$31 = $14;
    }
   } while(0);
   _memcpy(($31|0),($$141|0),($$143|0))|0;
   $32 = HEAP32[$9>>2]|0;
   $33 = (($32) + ($$143)|0);
   HEAP32[$9>>2] = $33;
   $34 = (($$139) + ($$143))|0;
   $$1 = $34;
  }
 } while(0);
 return ($$1|0);
}
function ___towrite($0) {
 $0 = $0|0;
 var $$0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0;
 var $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 74|0);
 $2 = HEAP8[$1>>0]|0;
 $3 = $2 << 24 >> 24;
 $4 = (($3) + 255)|0;
 $5 = $4 | $3;
 $6 = $5&255;
 HEAP8[$1>>0] = $6;
 $7 = HEAP32[$0>>2]|0;
 $8 = $7 & 8;
 $9 = ($8|0)==(0);
 if ($9) {
  $11 = ((($0)) + 8|0);
  HEAP32[$11>>2] = 0;
  $12 = ((($0)) + 4|0);
  HEAP32[$12>>2] = 0;
  $13 = ((($0)) + 44|0);
  $14 = HEAP32[$13>>2]|0;
  $15 = ((($0)) + 28|0);
  HEAP32[$15>>2] = $14;
  $16 = ((($0)) + 20|0);
  HEAP32[$16>>2] = $14;
  $17 = $14;
  $18 = ((($0)) + 48|0);
  $19 = HEAP32[$18>>2]|0;
  $20 = (($17) + ($19)|0);
  $21 = ((($0)) + 16|0);
  HEAP32[$21>>2] = $20;
  $$0 = 0;
 } else {
  $10 = $7 | 32;
  HEAP32[$0>>2] = $10;
  $$0 = -1;
 }
 return ($$0|0);
}
function _strlen($0) {
 $0 = $0|0;
 var $$0 = 0, $$015$lcssa = 0, $$01519 = 0, $$1$lcssa = 0, $$pn = 0, $$pre = 0, $$sink = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0;
 var $21 = 0, $22 = 0, $23 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = $0;
 $2 = $1 & 3;
 $3 = ($2|0)==(0);
 L1: do {
  if ($3) {
   $$015$lcssa = $0;
   label = 4;
  } else {
   $$01519 = $0;$23 = $1;
   while(1) {
    $4 = HEAP8[$$01519>>0]|0;
    $5 = ($4<<24>>24)==(0);
    if ($5) {
     $$sink = $23;
     break L1;
    }
    $6 = ((($$01519)) + 1|0);
    $7 = $6;
    $8 = $7 & 3;
    $9 = ($8|0)==(0);
    if ($9) {
     $$015$lcssa = $6;
     label = 4;
     break;
    } else {
     $$01519 = $6;$23 = $7;
    }
   }
  }
 } while(0);
 if ((label|0) == 4) {
  $$0 = $$015$lcssa;
  while(1) {
   $10 = HEAP32[$$0>>2]|0;
   $11 = (($10) + -16843009)|0;
   $12 = $10 & -2139062144;
   $13 = $12 ^ -2139062144;
   $14 = $13 & $11;
   $15 = ($14|0)==(0);
   $16 = ((($$0)) + 4|0);
   if ($15) {
    $$0 = $16;
   } else {
    break;
   }
  }
  $17 = $10&255;
  $18 = ($17<<24>>24)==(0);
  if ($18) {
   $$1$lcssa = $$0;
  } else {
   $$pn = $$0;
   while(1) {
    $19 = ((($$pn)) + 1|0);
    $$pre = HEAP8[$19>>0]|0;
    $20 = ($$pre<<24>>24)==(0);
    if ($20) {
     $$1$lcssa = $19;
     break;
    } else {
     $$pn = $19;
    }
   }
  }
  $21 = $$1$lcssa;
  $$sink = $21;
 }
 $22 = (($$sink) - ($1))|0;
 return ($22|0);
}
function ___overflow($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$0 = 0, $$pre = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $3 = 0, $4 = 0;
 var $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $2 = sp;
 $3 = $1&255;
 HEAP8[$2>>0] = $3;
 $4 = ((($0)) + 16|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = ($5|0)==(0|0);
 if ($6) {
  $7 = (___towrite($0)|0);
  $8 = ($7|0)==(0);
  if ($8) {
   $$pre = HEAP32[$4>>2]|0;
   $12 = $$pre;
   label = 4;
  } else {
   $$0 = -1;
  }
 } else {
  $12 = $5;
  label = 4;
 }
 do {
  if ((label|0) == 4) {
   $9 = ((($0)) + 20|0);
   $10 = HEAP32[$9>>2]|0;
   $11 = ($10>>>0)<($12>>>0);
   if ($11) {
    $13 = $1 & 255;
    $14 = ((($0)) + 75|0);
    $15 = HEAP8[$14>>0]|0;
    $16 = $15 << 24 >> 24;
    $17 = ($13|0)==($16|0);
    if (!($17)) {
     $18 = ((($10)) + 1|0);
     HEAP32[$9>>2] = $18;
     HEAP8[$10>>0] = $3;
     $$0 = $13;
     break;
    }
   }
   $19 = ((($0)) + 36|0);
   $20 = HEAP32[$19>>2]|0;
   $21 = (FUNCTION_TABLE_iiii[$20 & 63]($0,$2,1)|0);
   $22 = ($21|0)==(1);
   if ($22) {
    $23 = HEAP8[$2>>0]|0;
    $24 = $23&255;
    $$0 = $24;
   } else {
    $$0 = -1;
   }
  }
 } while(0);
 STACKTOP = sp;return ($$0|0);
}
function ___strdup($0) {
 $0 = $0|0;
 var $$0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = (_strlen($0)|0);
 $2 = (($1) + 1)|0;
 $3 = (_malloc($2)|0);
 $4 = ($3|0)==(0|0);
 if ($4) {
  $$0 = 0;
 } else {
  _memcpy(($3|0),($0|0),($2|0))|0;
  $$0 = $3;
 }
 return ($$0|0);
}
function ___ofl_lock() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 ___lock((37064|0));
 return (37072|0);
}
function ___ofl_unlock() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 ___unlock((37064|0));
 return;
}
function _fflush($0) {
 $0 = $0|0;
 var $$0 = 0, $$023 = 0, $$02325 = 0, $$02327 = 0, $$024$lcssa = 0, $$02426 = 0, $$1 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0;
 var $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $phitmp = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ($0|0)==(0|0);
 do {
  if ($1) {
   $8 = HEAP32[816]|0;
   $9 = ($8|0)==(0|0);
   if ($9) {
    $29 = 0;
   } else {
    $10 = HEAP32[816]|0;
    $11 = (_fflush($10)|0);
    $29 = $11;
   }
   $12 = (___ofl_lock()|0);
   $$02325 = HEAP32[$12>>2]|0;
   $13 = ($$02325|0)==(0|0);
   if ($13) {
    $$024$lcssa = $29;
   } else {
    $$02327 = $$02325;$$02426 = $29;
    while(1) {
     $14 = ((($$02327)) + 76|0);
     $15 = HEAP32[$14>>2]|0;
     $16 = ($15|0)>(-1);
     if ($16) {
      $17 = (___lockfile($$02327)|0);
      $26 = $17;
     } else {
      $26 = 0;
     }
     $18 = ((($$02327)) + 20|0);
     $19 = HEAP32[$18>>2]|0;
     $20 = ((($$02327)) + 28|0);
     $21 = HEAP32[$20>>2]|0;
     $22 = ($19>>>0)>($21>>>0);
     if ($22) {
      $23 = (___fflush_unlocked($$02327)|0);
      $24 = $23 | $$02426;
      $$1 = $24;
     } else {
      $$1 = $$02426;
     }
     $25 = ($26|0)==(0);
     if (!($25)) {
      ___unlockfile($$02327);
     }
     $27 = ((($$02327)) + 56|0);
     $$023 = HEAP32[$27>>2]|0;
     $28 = ($$023|0)==(0|0);
     if ($28) {
      $$024$lcssa = $$1;
      break;
     } else {
      $$02327 = $$023;$$02426 = $$1;
     }
    }
   }
   ___ofl_unlock();
   $$0 = $$024$lcssa;
  } else {
   $2 = ((($0)) + 76|0);
   $3 = HEAP32[$2>>2]|0;
   $4 = ($3|0)>(-1);
   if (!($4)) {
    $5 = (___fflush_unlocked($0)|0);
    $$0 = $5;
    break;
   }
   $6 = (___lockfile($0)|0);
   $phitmp = ($6|0)==(0);
   $7 = (___fflush_unlocked($0)|0);
   if ($phitmp) {
    $$0 = $7;
   } else {
    ___unlockfile($0);
    $$0 = $7;
   }
  }
 } while(0);
 return ($$0|0);
}
function ___fflush_unlocked($0) {
 $0 = $0|0;
 var $$0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0;
 var $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ((($0)) + 20|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ((($0)) + 28|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = ($2>>>0)>($4>>>0);
 if ($5) {
  $6 = ((($0)) + 36|0);
  $7 = HEAP32[$6>>2]|0;
  (FUNCTION_TABLE_iiii[$7 & 63]($0,0,0)|0);
  $8 = HEAP32[$1>>2]|0;
  $9 = ($8|0)==(0|0);
  if ($9) {
   $$0 = -1;
  } else {
   label = 3;
  }
 } else {
  label = 3;
 }
 if ((label|0) == 3) {
  $10 = ((($0)) + 4|0);
  $11 = HEAP32[$10>>2]|0;
  $12 = ((($0)) + 8|0);
  $13 = HEAP32[$12>>2]|0;
  $14 = ($11>>>0)<($13>>>0);
  if ($14) {
   $15 = $11;
   $16 = $13;
   $17 = (($15) - ($16))|0;
   $18 = ((($0)) + 40|0);
   $19 = HEAP32[$18>>2]|0;
   (FUNCTION_TABLE_iiii[$19 & 63]($0,$17,1)|0);
  }
  $20 = ((($0)) + 16|0);
  HEAP32[$20>>2] = 0;
  HEAP32[$3>>2] = 0;
  HEAP32[$1>>2] = 0;
  HEAP32[$12>>2] = 0;
  HEAP32[$10>>2] = 0;
  $$0 = 0;
 }
 return ($$0|0);
}
function _fputc($0,$1) {
 $0 = $0|0;
 $1 = $1|0;
 var $$0 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ((($1)) + 76|0);
 $3 = HEAP32[$2>>2]|0;
 $4 = ($3|0)<(0);
 if ($4) {
  label = 3;
 } else {
  $5 = (___lockfile($1)|0);
  $6 = ($5|0)==(0);
  if ($6) {
   label = 3;
  } else {
   $20 = $0&255;
   $21 = $0 & 255;
   $22 = ((($1)) + 75|0);
   $23 = HEAP8[$22>>0]|0;
   $24 = $23 << 24 >> 24;
   $25 = ($21|0)==($24|0);
   if ($25) {
    label = 10;
   } else {
    $26 = ((($1)) + 20|0);
    $27 = HEAP32[$26>>2]|0;
    $28 = ((($1)) + 16|0);
    $29 = HEAP32[$28>>2]|0;
    $30 = ($27>>>0)<($29>>>0);
    if ($30) {
     $31 = ((($27)) + 1|0);
     HEAP32[$26>>2] = $31;
     HEAP8[$27>>0] = $20;
     $33 = $21;
    } else {
     label = 10;
    }
   }
   if ((label|0) == 10) {
    $32 = (___overflow($1,$0)|0);
    $33 = $32;
   }
   ___unlockfile($1);
   $$0 = $33;
  }
 }
 do {
  if ((label|0) == 3) {
   $7 = $0&255;
   $8 = $0 & 255;
   $9 = ((($1)) + 75|0);
   $10 = HEAP8[$9>>0]|0;
   $11 = $10 << 24 >> 24;
   $12 = ($8|0)==($11|0);
   if (!($12)) {
    $13 = ((($1)) + 20|0);
    $14 = HEAP32[$13>>2]|0;
    $15 = ((($1)) + 16|0);
    $16 = HEAP32[$15>>2]|0;
    $17 = ($14>>>0)<($16>>>0);
    if ($17) {
     $18 = ((($14)) + 1|0);
     HEAP32[$13>>2] = $18;
     HEAP8[$14>>0] = $7;
     $$0 = $8;
     break;
    }
   }
   $19 = (___overflow($1,$0)|0);
   $$0 = $19;
  }
 } while(0);
 return ($$0|0);
}
function __Znwj($0) {
 $0 = $0|0;
 var $$ = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ($0|0)==(0);
 $$ = $1 ? 1 : $0;
 while(1) {
  $2 = (_malloc($$)|0);
  $3 = ($2|0)==(0|0);
  if (!($3)) {
   label = 6;
   break;
  }
  $4 = (__ZSt15get_new_handlerv()|0);
  $5 = ($4|0)==(0|0);
  if ($5) {
   label = 5;
   break;
  }
  FUNCTION_TABLE_v[$4 & 127]();
 }
 if ((label|0) == 5) {
  $6 = (___cxa_allocate_exception(4)|0);
  __ZNSt9bad_allocC2Ev($6);
  ___cxa_throw(($6|0),(544|0),(18|0));
  // unreachable;
 }
 else if ((label|0) == 6) {
  return ($2|0);
 }
 return (0)|0;
}
function __ZdlPv($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 _free($0);
 return;
}
function __ZL25default_terminate_handlerv() {
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $vararg_buffer = 0, $vararg_buffer10 = 0, $vararg_buffer3 = 0, $vararg_buffer7 = 0, $vararg_ptr1 = 0;
 var $vararg_ptr2 = 0, $vararg_ptr6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 48|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(48|0);
 $vararg_buffer10 = sp + 32|0;
 $vararg_buffer7 = sp + 24|0;
 $vararg_buffer3 = sp + 16|0;
 $vararg_buffer = sp;
 $0 = sp + 36|0;
 $1 = (___cxa_get_globals_fast()|0);
 $2 = ($1|0)==(0|0);
 if (!($2)) {
  $3 = HEAP32[$1>>2]|0;
  $4 = ($3|0)==(0|0);
  if (!($4)) {
   $5 = ((($3)) + 80|0);
   $6 = ((($3)) + 48|0);
   $7 = $6;
   $8 = $7;
   $9 = HEAP32[$8>>2]|0;
   $10 = (($7) + 4)|0;
   $11 = $10;
   $12 = HEAP32[$11>>2]|0;
   $13 = $9 & -256;
   $14 = ($13|0)==(1126902528);
   $15 = ($12|0)==(1129074247);
   $16 = $14 & $15;
   if (!($16)) {
    HEAP32[$vararg_buffer7>>2] = 35544;
    _abort_message(35494,$vararg_buffer7);
    // unreachable;
   }
   $17 = ($9|0)==(1126902529);
   $18 = ($12|0)==(1129074247);
   $19 = $17 & $18;
   if ($19) {
    $20 = ((($3)) + 44|0);
    $21 = HEAP32[$20>>2]|0;
    $22 = $21;
   } else {
    $22 = $5;
   }
   HEAP32[$0>>2] = $22;
   $23 = HEAP32[$3>>2]|0;
   $24 = ((($23)) + 4|0);
   $25 = HEAP32[$24>>2]|0;
   $26 = HEAP32[120]|0;
   $27 = ((($26)) + 16|0);
   $28 = HEAP32[$27>>2]|0;
   $29 = (FUNCTION_TABLE_iiii[$28 & 63](480,$23,$0)|0);
   if ($29) {
    $30 = HEAP32[$0>>2]|0;
    $31 = HEAP32[$30>>2]|0;
    $32 = ((($31)) + 8|0);
    $33 = HEAP32[$32>>2]|0;
    $34 = (FUNCTION_TABLE_ii[$33 & 127]($30)|0);
    HEAP32[$vararg_buffer>>2] = 35544;
    $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
    HEAP32[$vararg_ptr1>>2] = $25;
    $vararg_ptr2 = ((($vararg_buffer)) + 8|0);
    HEAP32[$vararg_ptr2>>2] = $34;
    _abort_message(35408,$vararg_buffer);
    // unreachable;
   } else {
    HEAP32[$vararg_buffer3>>2] = 35544;
    $vararg_ptr6 = ((($vararg_buffer3)) + 4|0);
    HEAP32[$vararg_ptr6>>2] = $25;
    _abort_message(35453,$vararg_buffer3);
    // unreachable;
   }
  }
 }
 _abort_message(35532,$vararg_buffer10);
 // unreachable;
}
function ___cxa_get_globals_fast() {
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $vararg_buffer = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $vararg_buffer = sp;
 $0 = (_pthread_once((37076|0),(122|0))|0);
 $1 = ($0|0)==(0);
 if ($1) {
  $2 = HEAP32[9270]|0;
  $3 = (_pthread_getspecific(($2|0))|0);
  STACKTOP = sp;return ($3|0);
 } else {
  _abort_message(35683,$vararg_buffer);
  // unreachable;
 }
 return (0)|0;
}
function _abort_message($0,$varargs) {
 $0 = $0|0;
 $varargs = $varargs|0;
 var $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $1 = sp;
 HEAP32[$1>>2] = $varargs;
 $2 = HEAP32[753]|0;
 (_vfprintf($2,$0,$1)|0);
 (_fputc(10,$2)|0);
 _abort();
 // unreachable;
}
function __ZN10__cxxabiv116__shim_type_infoD2Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function __ZN10__cxxabiv117__class_type_infoD0Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0);
 __ZdlPv($0);
 return;
}
function __ZNK10__cxxabiv116__shim_type_info5noop1Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function __ZNK10__cxxabiv116__shim_type_info5noop2Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function __ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$0 = 0, $$2 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0;
 var dest = 0, label = 0, sp = 0, stop = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 64|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(64|0);
 $3 = sp;
 $4 = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0,$1,0)|0);
 if ($4) {
  $$2 = 1;
 } else {
  $5 = ($1|0)==(0|0);
  if ($5) {
   $$2 = 0;
  } else {
   $6 = (___dynamic_cast($1,504,488,0)|0);
   $7 = ($6|0)==(0|0);
   if ($7) {
    $$2 = 0;
   } else {
    $8 = ((($3)) + 4|0);
    dest=$8; stop=dest+52|0; do { HEAP32[dest>>2]=0|0; dest=dest+4|0; } while ((dest|0) < (stop|0));
    HEAP32[$3>>2] = $6;
    $9 = ((($3)) + 8|0);
    HEAP32[$9>>2] = $0;
    $10 = ((($3)) + 12|0);
    HEAP32[$10>>2] = -1;
    $11 = ((($3)) + 48|0);
    HEAP32[$11>>2] = 1;
    $12 = HEAP32[$6>>2]|0;
    $13 = ((($12)) + 28|0);
    $14 = HEAP32[$13>>2]|0;
    $15 = HEAP32[$2>>2]|0;
    FUNCTION_TABLE_viiii[$14 & 127]($6,$3,$15,1);
    $16 = ((($3)) + 24|0);
    $17 = HEAP32[$16>>2]|0;
    $18 = ($17|0)==(1);
    if ($18) {
     $19 = ((($3)) + 16|0);
     $20 = HEAP32[$19>>2]|0;
     HEAP32[$2>>2] = $20;
     $$0 = 1;
    } else {
     $$0 = 0;
    }
    $$2 = $$0;
   }
  }
 }
 STACKTOP = sp;return ($$2|0);
}
function __ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0,$1,$2,$3,$4,$5) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 $5 = $5|0;
 var $6 = 0, $7 = 0, $8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $6 = ((($1)) + 8|0);
 $7 = HEAP32[$6>>2]|0;
 $8 = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0,$7,$5)|0);
 if ($8) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0,$1,$2,$3,$4);
 }
 return;
}
function __ZNK10__cxxabiv117__class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0,$1,$2,$3,$4) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $5 = ((($1)) + 8|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0,$6,$4)|0);
 do {
  if ($7) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0,$1,$2,$3);
  } else {
   $8 = HEAP32[$1>>2]|0;
   $9 = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0,$8,$4)|0);
   if ($9) {
    $10 = ((($1)) + 16|0);
    $11 = HEAP32[$10>>2]|0;
    $12 = ($11|0)==($2|0);
    if (!($12)) {
     $13 = ((($1)) + 20|0);
     $14 = HEAP32[$13>>2]|0;
     $15 = ($14|0)==($2|0);
     if (!($15)) {
      $18 = ((($1)) + 32|0);
      HEAP32[$18>>2] = $3;
      HEAP32[$13>>2] = $2;
      $19 = ((($1)) + 40|0);
      $20 = HEAP32[$19>>2]|0;
      $21 = (($20) + 1)|0;
      HEAP32[$19>>2] = $21;
      $22 = ((($1)) + 36|0);
      $23 = HEAP32[$22>>2]|0;
      $24 = ($23|0)==(1);
      if ($24) {
       $25 = ((($1)) + 24|0);
       $26 = HEAP32[$25>>2]|0;
       $27 = ($26|0)==(2);
       if ($27) {
        $28 = ((($1)) + 54|0);
        HEAP8[$28>>0] = 1;
       }
      }
      $29 = ((($1)) + 44|0);
      HEAP32[$29>>2] = 4;
      break;
     }
    }
    $16 = ($3|0)==(1);
    if ($16) {
     $17 = ((($1)) + 32|0);
     HEAP32[$17>>2] = 1;
    }
   }
  }
 } while(0);
 return;
}
function __ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $4 = 0, $5 = 0, $6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $4 = ((($1)) + 8|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0,$5,0)|0);
 if ($6) {
  __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0,$1,$2,$3);
 }
 return;
}
function __ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = ($0|0)==($1|0);
 return ($3|0);
}
function __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $4 = ((($1)) + 16|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = ($5|0)==(0|0);
 do {
  if ($6) {
   HEAP32[$4>>2] = $2;
   $7 = ((($1)) + 24|0);
   HEAP32[$7>>2] = $3;
   $8 = ((($1)) + 36|0);
   HEAP32[$8>>2] = 1;
  } else {
   $9 = ($5|0)==($2|0);
   if (!($9)) {
    $13 = ((($1)) + 36|0);
    $14 = HEAP32[$13>>2]|0;
    $15 = (($14) + 1)|0;
    HEAP32[$13>>2] = $15;
    $16 = ((($1)) + 24|0);
    HEAP32[$16>>2] = 2;
    $17 = ((($1)) + 54|0);
    HEAP8[$17>>0] = 1;
    break;
   }
   $10 = ((($1)) + 24|0);
   $11 = HEAP32[$10>>2]|0;
   $12 = ($11|0)==(2);
   if ($12) {
    HEAP32[$10>>2] = $3;
   }
  }
 } while(0);
 return;
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $4 = ((($1)) + 4|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = ($5|0)==($2|0);
 if ($6) {
  $7 = ((($1)) + 28|0);
  $8 = HEAP32[$7>>2]|0;
  $9 = ($8|0)==(1);
  if (!($9)) {
   HEAP32[$7>>2] = $3;
  }
 }
 return;
}
function __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i($0,$1,$2,$3,$4) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $30 = 0, $31 = 0, $32 = 0, $33 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, $or$cond22 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $5 = ((($1)) + 53|0);
 HEAP8[$5>>0] = 1;
 $6 = ((($1)) + 4|0);
 $7 = HEAP32[$6>>2]|0;
 $8 = ($7|0)==($3|0);
 do {
  if ($8) {
   $9 = ((($1)) + 52|0);
   HEAP8[$9>>0] = 1;
   $10 = ((($1)) + 16|0);
   $11 = HEAP32[$10>>2]|0;
   $12 = ($11|0)==(0|0);
   if ($12) {
    HEAP32[$10>>2] = $2;
    $13 = ((($1)) + 24|0);
    HEAP32[$13>>2] = $4;
    $14 = ((($1)) + 36|0);
    HEAP32[$14>>2] = 1;
    $15 = ((($1)) + 48|0);
    $16 = HEAP32[$15>>2]|0;
    $17 = ($16|0)==(1);
    $18 = ($4|0)==(1);
    $or$cond = $17 & $18;
    if (!($or$cond)) {
     break;
    }
    $19 = ((($1)) + 54|0);
    HEAP8[$19>>0] = 1;
    break;
   }
   $20 = ($11|0)==($2|0);
   if (!($20)) {
    $30 = ((($1)) + 36|0);
    $31 = HEAP32[$30>>2]|0;
    $32 = (($31) + 1)|0;
    HEAP32[$30>>2] = $32;
    $33 = ((($1)) + 54|0);
    HEAP8[$33>>0] = 1;
    break;
   }
   $21 = ((($1)) + 24|0);
   $22 = HEAP32[$21>>2]|0;
   $23 = ($22|0)==(2);
   if ($23) {
    HEAP32[$21>>2] = $4;
    $28 = $4;
   } else {
    $28 = $22;
   }
   $24 = ((($1)) + 48|0);
   $25 = HEAP32[$24>>2]|0;
   $26 = ($25|0)==(1);
   $27 = ($28|0)==(1);
   $or$cond22 = $26 & $27;
   if ($or$cond22) {
    $29 = ((($1)) + 54|0);
    HEAP8[$29>>0] = 1;
   }
  }
 } while(0);
 return;
}
function ___dynamic_cast($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $$ = 0, $$0 = 0, $$33 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0;
 var $46 = 0, $47 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, $or$cond28 = 0, $or$cond30 = 0, $or$cond32 = 0, dest = 0, label = 0, sp = 0, stop = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 64|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(64|0);
 $4 = sp;
 $5 = HEAP32[$0>>2]|0;
 $6 = ((($5)) + -8|0);
 $7 = HEAP32[$6>>2]|0;
 $8 = (($0) + ($7)|0);
 $9 = ((($5)) + -4|0);
 $10 = HEAP32[$9>>2]|0;
 HEAP32[$4>>2] = $2;
 $11 = ((($4)) + 4|0);
 HEAP32[$11>>2] = $0;
 $12 = ((($4)) + 8|0);
 HEAP32[$12>>2] = $1;
 $13 = ((($4)) + 12|0);
 HEAP32[$13>>2] = $3;
 $14 = ((($4)) + 16|0);
 $15 = ((($4)) + 20|0);
 $16 = ((($4)) + 24|0);
 $17 = ((($4)) + 28|0);
 $18 = ((($4)) + 32|0);
 $19 = ((($4)) + 40|0);
 dest=$14; stop=dest+36|0; do { HEAP32[dest>>2]=0|0; dest=dest+4|0; } while ((dest|0) < (stop|0));HEAP16[$14+36>>1]=0|0;HEAP8[$14+38>>0]=0|0;
 $20 = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($10,$2,0)|0);
 L1: do {
  if ($20) {
   $21 = ((($4)) + 48|0);
   HEAP32[$21>>2] = 1;
   $22 = HEAP32[$10>>2]|0;
   $23 = ((($22)) + 20|0);
   $24 = HEAP32[$23>>2]|0;
   FUNCTION_TABLE_viiiiii[$24 & 127]($10,$4,$8,$8,1,0);
   $25 = HEAP32[$16>>2]|0;
   $26 = ($25|0)==(1);
   $$ = $26 ? $8 : 0;
   $$0 = $$;
  } else {
   $27 = ((($4)) + 36|0);
   $28 = HEAP32[$10>>2]|0;
   $29 = ((($28)) + 24|0);
   $30 = HEAP32[$29>>2]|0;
   FUNCTION_TABLE_viiiii[$30 & 127]($10,$4,$8,1,0);
   $31 = HEAP32[$27>>2]|0;
   switch ($31|0) {
   case 0:  {
    $32 = HEAP32[$19>>2]|0;
    $33 = ($32|0)==(1);
    $34 = HEAP32[$17>>2]|0;
    $35 = ($34|0)==(1);
    $or$cond = $33 & $35;
    $36 = HEAP32[$18>>2]|0;
    $37 = ($36|0)==(1);
    $or$cond28 = $or$cond & $37;
    $38 = HEAP32[$15>>2]|0;
    $$33 = $or$cond28 ? $38 : 0;
    $$0 = $$33;
    break L1;
    break;
   }
   case 1:  {
    break;
   }
   default: {
    $$0 = 0;
    break L1;
   }
   }
   $39 = HEAP32[$16>>2]|0;
   $40 = ($39|0)==(1);
   if (!($40)) {
    $41 = HEAP32[$19>>2]|0;
    $42 = ($41|0)==(0);
    $43 = HEAP32[$17>>2]|0;
    $44 = ($43|0)==(1);
    $or$cond30 = $42 & $44;
    $45 = HEAP32[$18>>2]|0;
    $46 = ($45|0)==(1);
    $or$cond32 = $or$cond30 & $46;
    if (!($or$cond32)) {
     $$0 = 0;
     break;
    }
   }
   $47 = HEAP32[$14>>2]|0;
   $$0 = $47;
  }
 } while(0);
 STACKTOP = sp;return ($$0|0);
}
function __ZN10__cxxabiv120__si_class_type_infoD0Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0);
 __ZdlPv($0);
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0,$1,$2,$3,$4,$5) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 $5 = $5|0;
 var $10 = 0, $11 = 0, $12 = 0, $13 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $6 = ((($1)) + 8|0);
 $7 = HEAP32[$6>>2]|0;
 $8 = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0,$7,$5)|0);
 if ($8) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0,$1,$2,$3,$4);
 } else {
  $9 = ((($0)) + 8|0);
  $10 = HEAP32[$9>>2]|0;
  $11 = HEAP32[$10>>2]|0;
  $12 = ((($11)) + 20|0);
  $13 = HEAP32[$12>>2]|0;
  FUNCTION_TABLE_viiiiii[$13 & 127]($10,$1,$2,$3,$4,$5);
 }
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0,$1,$2,$3,$4) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 var $$037$off038 = 0, $$037$off039 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0;
 var $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $5 = ((($1)) + 8|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0,$6,$4)|0);
 do {
  if ($7) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0,$1,$2,$3);
  } else {
   $8 = HEAP32[$1>>2]|0;
   $9 = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0,$8,$4)|0);
   if (!($9)) {
    $43 = ((($0)) + 8|0);
    $44 = HEAP32[$43>>2]|0;
    $45 = HEAP32[$44>>2]|0;
    $46 = ((($45)) + 24|0);
    $47 = HEAP32[$46>>2]|0;
    FUNCTION_TABLE_viiiii[$47 & 127]($44,$1,$2,$3,$4);
    break;
   }
   $10 = ((($1)) + 16|0);
   $11 = HEAP32[$10>>2]|0;
   $12 = ($11|0)==($2|0);
   if (!($12)) {
    $13 = ((($1)) + 20|0);
    $14 = HEAP32[$13>>2]|0;
    $15 = ($14|0)==($2|0);
    if (!($15)) {
     $18 = ((($1)) + 32|0);
     HEAP32[$18>>2] = $3;
     $19 = ((($1)) + 44|0);
     $20 = HEAP32[$19>>2]|0;
     $21 = ($20|0)==(4);
     if ($21) {
      break;
     }
     $22 = ((($1)) + 52|0);
     HEAP8[$22>>0] = 0;
     $23 = ((($1)) + 53|0);
     HEAP8[$23>>0] = 0;
     $24 = ((($0)) + 8|0);
     $25 = HEAP32[$24>>2]|0;
     $26 = HEAP32[$25>>2]|0;
     $27 = ((($26)) + 20|0);
     $28 = HEAP32[$27>>2]|0;
     FUNCTION_TABLE_viiiiii[$28 & 127]($25,$1,$2,$2,1,$4);
     $29 = HEAP8[$23>>0]|0;
     $30 = ($29<<24>>24)==(0);
     if ($30) {
      $$037$off038 = 4;
      label = 11;
     } else {
      $31 = HEAP8[$22>>0]|0;
      $32 = ($31<<24>>24)==(0);
      if ($32) {
       $$037$off038 = 3;
       label = 11;
      } else {
       $$037$off039 = 3;
      }
     }
     if ((label|0) == 11) {
      HEAP32[$13>>2] = $2;
      $33 = ((($1)) + 40|0);
      $34 = HEAP32[$33>>2]|0;
      $35 = (($34) + 1)|0;
      HEAP32[$33>>2] = $35;
      $36 = ((($1)) + 36|0);
      $37 = HEAP32[$36>>2]|0;
      $38 = ($37|0)==(1);
      if ($38) {
       $39 = ((($1)) + 24|0);
       $40 = HEAP32[$39>>2]|0;
       $41 = ($40|0)==(2);
       if ($41) {
        $42 = ((($1)) + 54|0);
        HEAP8[$42>>0] = 1;
        $$037$off039 = $$037$off038;
       } else {
        $$037$off039 = $$037$off038;
       }
      } else {
       $$037$off039 = $$037$off038;
      }
     }
     HEAP32[$19>>2] = $$037$off039;
     break;
    }
   }
   $16 = ($3|0)==(1);
   if ($16) {
    $17 = ((($1)) + 32|0);
    HEAP32[$17>>2] = 1;
   }
  }
 } while(0);
 return;
}
function __ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $10 = 0, $11 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $4 = ((($1)) + 8|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0,$5,0)|0);
 if ($6) {
  __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0,$1,$2,$3);
 } else {
  $7 = ((($0)) + 8|0);
  $8 = HEAP32[$7>>2]|0;
  $9 = HEAP32[$8>>2]|0;
  $10 = ((($9)) + 28|0);
  $11 = HEAP32[$10>>2]|0;
  FUNCTION_TABLE_viiii[$11 & 127]($8,$1,$2,$3);
 }
 return;
}
function __ZNSt9type_infoD2Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function __ZN10__cxxabiv112_GLOBAL__N_110construct_Ev() {
 var $0 = 0, $1 = 0, $vararg_buffer = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $vararg_buffer = sp;
 $0 = (_pthread_key_create((37080|0),(123|0))|0);
 $1 = ($0|0)==(0);
 if ($1) {
  STACKTOP = sp;return;
 } else {
  _abort_message(35732,$vararg_buffer);
  // unreachable;
 }
}
function __ZN10__cxxabiv112_GLOBAL__N_19destruct_EPv($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $vararg_buffer = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $vararg_buffer = sp;
 _free($0);
 $1 = HEAP32[9270]|0;
 $2 = (_pthread_setspecific(($1|0),(0|0))|0);
 $3 = ($2|0)==(0);
 if ($3) {
  STACKTOP = sp;return;
 } else {
  _abort_message(35782,$vararg_buffer);
  // unreachable;
 }
}
function __ZSt9terminatev() {
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0;
 var $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 __THREW__ = 0;
 $0 = (invoke_i(124)|0);
 $1 = __THREW__; __THREW__ = 0;
 $2 = $1&1;
 if ($2) {
  $19 = ___cxa_find_matching_catch_3(0|0)|0;
  $20 = tempRet0;
  ___clang_call_terminate($19);
  // unreachable;
 }
 $3 = ($0|0)==(0|0);
 if (!($3)) {
  $4 = HEAP32[$0>>2]|0;
  $5 = ($4|0)==(0|0);
  if (!($5)) {
   $6 = ((($4)) + 48|0);
   $7 = $6;
   $8 = $7;
   $9 = HEAP32[$8>>2]|0;
   $10 = (($7) + 4)|0;
   $11 = $10;
   $12 = HEAP32[$11>>2]|0;
   $13 = $9 & -256;
   $14 = ($13|0)==(1126902528);
   $15 = ($12|0)==(1129074247);
   $16 = $14 & $15;
   if ($16) {
    $17 = ((($4)) + 12|0);
    $18 = HEAP32[$17>>2]|0;
    __ZSt11__terminatePFvvE($18);
    // unreachable;
   }
  }
 }
 $21 = (__ZSt13get_terminatev()|0);
 __ZSt11__terminatePFvvE($21);
 // unreachable;
}
function __ZSt11__terminatePFvvE($0) {
 $0 = $0|0;
 var $1 = 0, $10 = 0, $11 = 0, $12 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $vararg_buffer = 0, $vararg_buffer1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $vararg_buffer1 = sp + 8|0;
 $vararg_buffer = sp;
 __THREW__ = 0;
 invoke_v($0|0);
 $1 = __THREW__; __THREW__ = 0;
 $2 = $1&1;
 if (!($2)) {
  __THREW__ = 0;
  invoke_vii(125,(35835|0),($vararg_buffer|0));
  $3 = __THREW__; __THREW__ = 0;
 }
 $4 = ___cxa_find_matching_catch_3(0|0)|0;
 $5 = tempRet0;
 (___cxa_begin_catch(($4|0))|0);
 __THREW__ = 0;
 invoke_vii(125,(35875|0),($vararg_buffer1|0));
 $6 = __THREW__; __THREW__ = 0;
 $7 = ___cxa_find_matching_catch_3(0|0)|0;
 $8 = tempRet0;
 __THREW__ = 0;
 invoke_v(126);
 $9 = __THREW__; __THREW__ = 0;
 $10 = $9&1;
 if ($10) {
  $11 = ___cxa_find_matching_catch_3(0|0)|0;
  $12 = tempRet0;
  ___clang_call_terminate($11);
  // unreachable;
 } else {
  ___clang_call_terminate($7);
  // unreachable;
 }
}
function __ZSt13get_terminatev() {
 var $0 = 0, $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = HEAP32[878]|0;
 $1 = (($0) + 0)|0;
 HEAP32[878] = $1;
 $2 = $0;
 return ($2|0);
}
function __ZNSt9bad_allocD2Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function __ZNSt9bad_allocD0Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 __ZNSt9bad_allocD2Ev($0);
 __ZdlPv($0);
 return;
}
function __ZNKSt9bad_alloc4whatEv($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return (35925|0);
}
function __ZNSt9exceptionD2Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function __ZN10__cxxabiv123__fundamental_type_infoD0Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0);
 __ZdlPv($0);
 return;
}
function __ZNK10__cxxabiv123__fundamental_type_info9can_catchEPKNS_16__shim_type_infoERPv($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0,$1,0)|0);
 return ($3|0);
}
function __ZN10__cxxabiv119__pointer_type_infoD0Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0);
 __ZdlPv($0);
 return;
}
function __ZNK10__cxxabiv119__pointer_type_info9can_catchEPKNS_16__shim_type_infoERPv($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$0 = 0, $$4 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0;
 var $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $5 = 0;
 var $6 = 0, $7 = 0, $8 = 0, $9 = 0, dest = 0, label = 0, sp = 0, stop = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 64|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(64|0);
 $3 = sp;
 $4 = HEAP32[$2>>2]|0;
 $5 = HEAP32[$4>>2]|0;
 HEAP32[$2>>2] = $5;
 $6 = (__ZNK10__cxxabiv117__pbase_type_info9can_catchEPKNS_16__shim_type_infoERPv($0,$1,0)|0);
 if ($6) {
  $$4 = 1;
 } else {
  $7 = ($1|0)==(0|0);
  if ($7) {
   $$4 = 0;
  } else {
   $8 = (___dynamic_cast($1,504,576,0)|0);
   $9 = ($8|0)==(0|0);
   if ($9) {
    $$4 = 0;
   } else {
    $10 = ((($8)) + 8|0);
    $11 = HEAP32[$10>>2]|0;
    $12 = ((($0)) + 8|0);
    $13 = HEAP32[$12>>2]|0;
    $14 = $13 ^ -1;
    $15 = $11 & $14;
    $16 = ($15|0)==(0);
    if ($16) {
     $17 = ((($0)) + 12|0);
     $18 = HEAP32[$17>>2]|0;
     $19 = ((($8)) + 12|0);
     $20 = HEAP32[$19>>2]|0;
     $21 = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($18,$20,0)|0);
     if ($21) {
      $$4 = 1;
     } else {
      $22 = HEAP32[$17>>2]|0;
      $23 = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($22,608,0)|0);
      if ($23) {
       $$4 = 1;
      } else {
       $24 = HEAP32[$17>>2]|0;
       $25 = ($24|0)==(0|0);
       if ($25) {
        $$4 = 0;
       } else {
        $26 = (___dynamic_cast($24,504,488,0)|0);
        $27 = ($26|0)==(0|0);
        if ($27) {
         $$4 = 0;
        } else {
         $28 = HEAP32[$19>>2]|0;
         $29 = ($28|0)==(0|0);
         if ($29) {
          $$4 = 0;
         } else {
          $30 = (___dynamic_cast($28,504,488,0)|0);
          $31 = ($30|0)==(0|0);
          if ($31) {
           $$4 = 0;
          } else {
           $32 = ((($3)) + 4|0);
           dest=$32; stop=dest+52|0; do { HEAP32[dest>>2]=0|0; dest=dest+4|0; } while ((dest|0) < (stop|0));
           HEAP32[$3>>2] = $30;
           $33 = ((($3)) + 8|0);
           HEAP32[$33>>2] = $26;
           $34 = ((($3)) + 12|0);
           HEAP32[$34>>2] = -1;
           $35 = ((($3)) + 48|0);
           HEAP32[$35>>2] = 1;
           $36 = HEAP32[$30>>2]|0;
           $37 = ((($36)) + 28|0);
           $38 = HEAP32[$37>>2]|0;
           $39 = HEAP32[$2>>2]|0;
           FUNCTION_TABLE_viiii[$38 & 127]($30,$3,$39,1);
           $40 = ((($3)) + 24|0);
           $41 = HEAP32[$40>>2]|0;
           $42 = ($41|0)==(1);
           if ($42) {
            $43 = ((($3)) + 16|0);
            $44 = HEAP32[$43>>2]|0;
            HEAP32[$2>>2] = $44;
            $$0 = 1;
           } else {
            $$0 = 0;
           }
           $$4 = $$0;
          }
         }
        }
       }
      }
     }
    } else {
     $$4 = 0;
    }
   }
  }
 }
 STACKTOP = sp;return ($$4|0);
}
function __ZNK10__cxxabiv117__pbase_type_info9can_catchEPKNS_16__shim_type_infoERPv($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $$0 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $3 = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0,$1,0)|0);
 if ($3) {
  $$0 = 1;
 } else {
  $4 = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($1,616,0)|0);
  $$0 = $4;
 }
 return ($$0|0);
}
function __ZN10__cxxabiv121__vmi_class_type_infoD0Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 __ZN10__cxxabiv116__shim_type_infoD2Ev($0);
 __ZdlPv($0);
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0,$1,$2,$3,$4,$5) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 $5 = $5|0;
 var $$0 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $6 = ((($1)) + 8|0);
 $7 = HEAP32[$6>>2]|0;
 $8 = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0,$7,$5)|0);
 if ($8) {
  __ZNK10__cxxabiv117__class_type_info29process_static_type_above_dstEPNS_19__dynamic_cast_infoEPKvS4_i(0,$1,$2,$3,$4);
 } else {
  $9 = ((($1)) + 52|0);
  $10 = HEAP8[$9>>0]|0;
  $11 = ((($1)) + 53|0);
  $12 = HEAP8[$11>>0]|0;
  $13 = ((($0)) + 16|0);
  $14 = ((($0)) + 12|0);
  $15 = HEAP32[$14>>2]|0;
  $16 = (((($0)) + 16|0) + ($15<<3)|0);
  HEAP8[$9>>0] = 0;
  HEAP8[$11>>0] = 0;
  __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($13,$1,$2,$3,$4,$5);
  $17 = ($15|0)>(1);
  L4: do {
   if ($17) {
    $18 = ((($0)) + 24|0);
    $19 = ((($1)) + 24|0);
    $20 = ((($0)) + 8|0);
    $21 = ((($1)) + 54|0);
    $$0 = $18;
    while(1) {
     $22 = HEAP8[$21>>0]|0;
     $23 = ($22<<24>>24)==(0);
     if (!($23)) {
      break L4;
     }
     $24 = HEAP8[$9>>0]|0;
     $25 = ($24<<24>>24)==(0);
     if ($25) {
      $31 = HEAP8[$11>>0]|0;
      $32 = ($31<<24>>24)==(0);
      if (!($32)) {
       $33 = HEAP32[$20>>2]|0;
       $34 = $33 & 1;
       $35 = ($34|0)==(0);
       if ($35) {
        break L4;
       }
      }
     } else {
      $26 = HEAP32[$19>>2]|0;
      $27 = ($26|0)==(1);
      if ($27) {
       break L4;
      }
      $28 = HEAP32[$20>>2]|0;
      $29 = $28 & 2;
      $30 = ($29|0)==(0);
      if ($30) {
       break L4;
      }
     }
     HEAP8[$9>>0] = 0;
     HEAP8[$11>>0] = 0;
     __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($$0,$1,$2,$3,$4,$5);
     $36 = ((($$0)) + 8|0);
     $37 = ($36>>>0)<($16>>>0);
     if ($37) {
      $$0 = $36;
     } else {
      break;
     }
    }
   }
  } while(0);
  HEAP8[$9>>0] = $10;
  HEAP8[$11>>0] = $12;
 }
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0,$1,$2,$3,$4) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 var $$0 = 0, $$081$off0 = 0, $$084 = 0, $$085$off0 = 0, $$1 = 0, $$182$off0 = 0, $$186$off0 = 0, $$2 = 0, $$283$off0 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0;
 var $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $40 = 0;
 var $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0;
 var $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0;
 var $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $5 = ((($1)) + 8|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0,$6,$4)|0);
 L1: do {
  if ($7) {
   __ZNK10__cxxabiv117__class_type_info29process_static_type_below_dstEPNS_19__dynamic_cast_infoEPKvi(0,$1,$2,$3);
  } else {
   $8 = HEAP32[$1>>2]|0;
   $9 = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0,$8,$4)|0);
   if (!($9)) {
    $56 = ((($0)) + 16|0);
    $57 = ((($0)) + 12|0);
    $58 = HEAP32[$57>>2]|0;
    $59 = (((($0)) + 16|0) + ($58<<3)|0);
    __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($56,$1,$2,$3,$4);
    $60 = ((($0)) + 24|0);
    $61 = ($58|0)>(1);
    if (!($61)) {
     break;
    }
    $62 = ((($0)) + 8|0);
    $63 = HEAP32[$62>>2]|0;
    $64 = $63 & 2;
    $65 = ($64|0)==(0);
    if ($65) {
     $66 = ((($1)) + 36|0);
     $67 = HEAP32[$66>>2]|0;
     $68 = ($67|0)==(1);
     if (!($68)) {
      $74 = $63 & 1;
      $75 = ($74|0)==(0);
      if ($75) {
       $78 = ((($1)) + 54|0);
       $$2 = $60;
       while(1) {
        $87 = HEAP8[$78>>0]|0;
        $88 = ($87<<24>>24)==(0);
        if (!($88)) {
         break L1;
        }
        $89 = HEAP32[$66>>2]|0;
        $90 = ($89|0)==(1);
        if ($90) {
         break L1;
        }
        __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$2,$1,$2,$3,$4);
        $91 = ((($$2)) + 8|0);
        $92 = ($91>>>0)<($59>>>0);
        if ($92) {
         $$2 = $91;
        } else {
         break L1;
        }
       }
      }
      $76 = ((($1)) + 24|0);
      $77 = ((($1)) + 54|0);
      $$1 = $60;
      while(1) {
       $79 = HEAP8[$77>>0]|0;
       $80 = ($79<<24>>24)==(0);
       if (!($80)) {
        break L1;
       }
       $81 = HEAP32[$66>>2]|0;
       $82 = ($81|0)==(1);
       if ($82) {
        $83 = HEAP32[$76>>2]|0;
        $84 = ($83|0)==(1);
        if ($84) {
         break L1;
        }
       }
       __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$1,$1,$2,$3,$4);
       $85 = ((($$1)) + 8|0);
       $86 = ($85>>>0)<($59>>>0);
       if ($86) {
        $$1 = $85;
       } else {
        break L1;
       }
      }
     }
    }
    $69 = ((($1)) + 54|0);
    $$0 = $60;
    while(1) {
     $70 = HEAP8[$69>>0]|0;
     $71 = ($70<<24>>24)==(0);
     if (!($71)) {
      break L1;
     }
     __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($$0,$1,$2,$3,$4);
     $72 = ((($$0)) + 8|0);
     $73 = ($72>>>0)<($59>>>0);
     if ($73) {
      $$0 = $72;
     } else {
      break L1;
     }
    }
   }
   $10 = ((($1)) + 16|0);
   $11 = HEAP32[$10>>2]|0;
   $12 = ($11|0)==($2|0);
   if (!($12)) {
    $13 = ((($1)) + 20|0);
    $14 = HEAP32[$13>>2]|0;
    $15 = ($14|0)==($2|0);
    if (!($15)) {
     $18 = ((($1)) + 32|0);
     HEAP32[$18>>2] = $3;
     $19 = ((($1)) + 44|0);
     $20 = HEAP32[$19>>2]|0;
     $21 = ($20|0)==(4);
     if ($21) {
      break;
     }
     $22 = ((($0)) + 16|0);
     $23 = ((($0)) + 12|0);
     $24 = HEAP32[$23>>2]|0;
     $25 = (((($0)) + 16|0) + ($24<<3)|0);
     $26 = ((($1)) + 52|0);
     $27 = ((($1)) + 53|0);
     $28 = ((($1)) + 54|0);
     $29 = ((($0)) + 8|0);
     $30 = ((($1)) + 24|0);
     $$081$off0 = 0;$$084 = $22;$$085$off0 = 0;
     L32: while(1) {
      $31 = ($$084>>>0)<($25>>>0);
      if (!($31)) {
       $$283$off0 = $$081$off0;
       label = 18;
       break;
      }
      HEAP8[$26>>0] = 0;
      HEAP8[$27>>0] = 0;
      __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($$084,$1,$2,$2,1,$4);
      $32 = HEAP8[$28>>0]|0;
      $33 = ($32<<24>>24)==(0);
      if (!($33)) {
       $$283$off0 = $$081$off0;
       label = 18;
       break;
      }
      $34 = HEAP8[$27>>0]|0;
      $35 = ($34<<24>>24)==(0);
      do {
       if ($35) {
        $$182$off0 = $$081$off0;$$186$off0 = $$085$off0;
       } else {
        $36 = HEAP8[$26>>0]|0;
        $37 = ($36<<24>>24)==(0);
        if ($37) {
         $43 = HEAP32[$29>>2]|0;
         $44 = $43 & 1;
         $45 = ($44|0)==(0);
         if ($45) {
          $$283$off0 = 1;
          label = 18;
          break L32;
         } else {
          $$182$off0 = 1;$$186$off0 = $$085$off0;
          break;
         }
        }
        $38 = HEAP32[$30>>2]|0;
        $39 = ($38|0)==(1);
        if ($39) {
         label = 23;
         break L32;
        }
        $40 = HEAP32[$29>>2]|0;
        $41 = $40 & 2;
        $42 = ($41|0)==(0);
        if ($42) {
         label = 23;
         break L32;
        } else {
         $$182$off0 = 1;$$186$off0 = 1;
        }
       }
      } while(0);
      $46 = ((($$084)) + 8|0);
      $$081$off0 = $$182$off0;$$084 = $46;$$085$off0 = $$186$off0;
     }
     do {
      if ((label|0) == 18) {
       if (!($$085$off0)) {
        HEAP32[$13>>2] = $2;
        $47 = ((($1)) + 40|0);
        $48 = HEAP32[$47>>2]|0;
        $49 = (($48) + 1)|0;
        HEAP32[$47>>2] = $49;
        $50 = ((($1)) + 36|0);
        $51 = HEAP32[$50>>2]|0;
        $52 = ($51|0)==(1);
        if ($52) {
         $53 = HEAP32[$30>>2]|0;
         $54 = ($53|0)==(2);
         if ($54) {
          HEAP8[$28>>0] = 1;
          if ($$283$off0) {
           label = 23;
           break;
          } else {
           $55 = 4;
           break;
          }
         }
        }
       }
       if ($$283$off0) {
        label = 23;
       } else {
        $55 = 4;
       }
      }
     } while(0);
     if ((label|0) == 23) {
      $55 = 3;
     }
     HEAP32[$19>>2] = $55;
     break;
    }
   }
   $16 = ($3|0)==(1);
   if ($16) {
    $17 = ((($1)) + 32|0);
    HEAP32[$17>>2] = 1;
   }
  }
 } while(0);
 return;
}
function __ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $$0 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $4 = ((($1)) + 8|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = (__ZN10__cxxabiv18is_equalEPKSt9type_infoS2_b($0,$5,0)|0);
 L1: do {
  if ($6) {
   __ZNK10__cxxabiv117__class_type_info24process_found_base_classEPNS_19__dynamic_cast_infoEPvi(0,$1,$2,$3);
  } else {
   $7 = ((($0)) + 16|0);
   $8 = ((($0)) + 12|0);
   $9 = HEAP32[$8>>2]|0;
   $10 = (((($0)) + 16|0) + ($9<<3)|0);
   __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($7,$1,$2,$3);
   $11 = ($9|0)>(1);
   if ($11) {
    $12 = ((($0)) + 24|0);
    $13 = ((($1)) + 54|0);
    $$0 = $12;
    while(1) {
     __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($$0,$1,$2,$3);
     $14 = HEAP8[$13>>0]|0;
     $15 = ($14<<24>>24)==(0);
     if (!($15)) {
      break L1;
     }
     $16 = ((($$0)) + 8|0);
     $17 = ($16>>>0)<($10>>>0);
     if ($17) {
      $$0 = $16;
     } else {
      break;
     }
    }
   }
  }
 } while(0);
 return;
}
function __ZNK10__cxxabiv122__base_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi($0,$1,$2,$3) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 var $$0 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $4 = ((($0)) + 4|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = $5 >> 8;
 $7 = $5 & 1;
 $8 = ($7|0)==(0);
 if ($8) {
  $$0 = $6;
 } else {
  $9 = HEAP32[$2>>2]|0;
  $10 = (($9) + ($6)|0);
  $11 = HEAP32[$10>>2]|0;
  $$0 = $11;
 }
 $12 = HEAP32[$0>>2]|0;
 $13 = HEAP32[$12>>2]|0;
 $14 = ((($13)) + 28|0);
 $15 = HEAP32[$14>>2]|0;
 $16 = (($2) + ($$0)|0);
 $17 = $5 & 2;
 $18 = ($17|0)!=(0);
 $19 = $18 ? $3 : 2;
 FUNCTION_TABLE_viiii[$15 & 127]($12,$1,$16,$19);
 return;
}
function __ZNK10__cxxabiv122__base_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib($0,$1,$2,$3,$4,$5) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 $5 = $5|0;
 var $$0 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $21 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $6 = ((($0)) + 4|0);
 $7 = HEAP32[$6>>2]|0;
 $8 = $7 >> 8;
 $9 = $7 & 1;
 $10 = ($9|0)==(0);
 if ($10) {
  $$0 = $8;
 } else {
  $11 = HEAP32[$3>>2]|0;
  $12 = (($11) + ($8)|0);
  $13 = HEAP32[$12>>2]|0;
  $$0 = $13;
 }
 $14 = HEAP32[$0>>2]|0;
 $15 = HEAP32[$14>>2]|0;
 $16 = ((($15)) + 20|0);
 $17 = HEAP32[$16>>2]|0;
 $18 = (($3) + ($$0)|0);
 $19 = $7 & 2;
 $20 = ($19|0)!=(0);
 $21 = $20 ? $4 : 2;
 FUNCTION_TABLE_viiiiii[$17 & 127]($14,$1,$2,$18,$21,$5);
 return;
}
function __ZNK10__cxxabiv122__base_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib($0,$1,$2,$3,$4) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 $3 = $3|0;
 $4 = $4|0;
 var $$0 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $20 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $5 = ((($0)) + 4|0);
 $6 = HEAP32[$5>>2]|0;
 $7 = $6 >> 8;
 $8 = $6 & 1;
 $9 = ($8|0)==(0);
 if ($9) {
  $$0 = $7;
 } else {
  $10 = HEAP32[$2>>2]|0;
  $11 = (($10) + ($7)|0);
  $12 = HEAP32[$11>>2]|0;
  $$0 = $12;
 }
 $13 = HEAP32[$0>>2]|0;
 $14 = HEAP32[$13>>2]|0;
 $15 = ((($14)) + 24|0);
 $16 = HEAP32[$15>>2]|0;
 $17 = (($2) + ($$0)|0);
 $18 = $6 & 2;
 $19 = ($18|0)!=(0);
 $20 = $19 ? $3 : 2;
 FUNCTION_TABLE_viiiii[$16 & 127]($13,$1,$17,$20,$4);
 return;
}
function __ZNSt9bad_allocC2Ev($0) {
 $0 = $0|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 HEAP32[$0>>2] = (3604);
 return;
}
function __ZSt15get_new_handlerv() {
 var $0 = 0, $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = HEAP32[9271]|0;
 $1 = (($0) + 0)|0;
 HEAP32[9271] = $1;
 $2 = $0;
 return ($2|0);
}
function ___cxa_can_catch($0,$1,$2) {
 $0 = $0|0;
 $1 = $1|0;
 $2 = $2|0;
 var $10 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abortStackOverflow(16|0);
 $3 = sp;
 $4 = HEAP32[$2>>2]|0;
 HEAP32[$3>>2] = $4;
 $5 = HEAP32[$0>>2]|0;
 $6 = ((($5)) + 16|0);
 $7 = HEAP32[$6>>2]|0;
 $8 = (FUNCTION_TABLE_iiii[$7 & 63]($0,$1,$3)|0);
 $9 = $8&1;
 if ($8) {
  $10 = HEAP32[$3>>2]|0;
  HEAP32[$2>>2] = $10;
 }
 STACKTOP = sp;return ($9|0);
}
function ___cxa_is_pointer_type($0) {
 $0 = $0|0;
 var $1 = 0, $2 = 0, $3 = 0, $phitmp = 0, $phitmp1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $1 = ($0|0)==(0|0);
 if ($1) {
  $3 = 0;
 } else {
  $2 = (___dynamic_cast($0,504,576,0)|0);
  $phitmp = ($2|0)!=(0|0);
  $phitmp1 = $phitmp&1;
  $3 = $phitmp1;
 }
 return ($3|0);
}
function runPostSets() {
}
function _i64Add(a, b, c, d) {
    /*
      x = a + b*2^32
      y = c + d*2^32
      result = l + h*2^32
    */
    a = a|0; b = b|0; c = c|0; d = d|0;
    var l = 0, h = 0;
    l = (a + c)>>>0;
    h = (b + d + (((l>>>0) < (a>>>0))|0))>>>0; // Add carry from low word to high word on overflow.
    return ((tempRet0 = h,l|0)|0);
}
function _i64Subtract(a, b, c, d) {
    a = a|0; b = b|0; c = c|0; d = d|0;
    var l = 0, h = 0;
    l = (a - c)>>>0;
    h = (b - d)>>>0;
    h = (b - d - (((c>>>0) > (a>>>0))|0))>>>0; // Borrow one from high word to low word on underflow.
    return ((tempRet0 = h,l|0)|0);
}
function _llvm_cttz_i32(x) {
    x = x|0;
    var ret = 0;
    ret = ((HEAP8[(((cttz_i8)+(x & 0xff))>>0)])|0);
    if ((ret|0) < 8) return ret|0;
    ret = ((HEAP8[(((cttz_i8)+((x >> 8)&0xff))>>0)])|0);
    if ((ret|0) < 8) return (ret + 8)|0;
    ret = ((HEAP8[(((cttz_i8)+((x >> 16)&0xff))>>0)])|0);
    if ((ret|0) < 8) return (ret + 16)|0;
    return (((HEAP8[(((cttz_i8)+(x >>> 24))>>0)])|0) + 24)|0;
}
function ___udivmoddi4($a$0, $a$1, $b$0, $b$1, $rem) {
    $a$0 = $a$0 | 0;
    $a$1 = $a$1 | 0;
    $b$0 = $b$0 | 0;
    $b$1 = $b$1 | 0;
    $rem = $rem | 0;
    var $n_sroa_0_0_extract_trunc = 0, $n_sroa_1_4_extract_shift$0 = 0, $n_sroa_1_4_extract_trunc = 0, $d_sroa_0_0_extract_trunc = 0, $d_sroa_1_4_extract_shift$0 = 0, $d_sroa_1_4_extract_trunc = 0, $4 = 0, $17 = 0, $37 = 0, $49 = 0, $51 = 0, $57 = 0, $58 = 0, $66 = 0, $78 = 0, $86 = 0, $88 = 0, $89 = 0, $91 = 0, $92 = 0, $95 = 0, $105 = 0, $117 = 0, $119 = 0, $125 = 0, $126 = 0, $130 = 0, $q_sroa_1_1_ph = 0, $q_sroa_0_1_ph = 0, $r_sroa_1_1_ph = 0, $r_sroa_0_1_ph = 0, $sr_1_ph = 0, $d_sroa_0_0_insert_insert99$0 = 0, $d_sroa_0_0_insert_insert99$1 = 0, $137$0 = 0, $137$1 = 0, $carry_0203 = 0, $sr_1202 = 0, $r_sroa_0_1201 = 0, $r_sroa_1_1200 = 0, $q_sroa_0_1199 = 0, $q_sroa_1_1198 = 0, $147 = 0, $149 = 0, $r_sroa_0_0_insert_insert42$0 = 0, $r_sroa_0_0_insert_insert42$1 = 0, $150$1 = 0, $151$0 = 0, $152 = 0, $154$0 = 0, $r_sroa_0_0_extract_trunc = 0, $r_sroa_1_4_extract_trunc = 0, $155 = 0, $carry_0_lcssa$0 = 0, $carry_0_lcssa$1 = 0, $r_sroa_0_1_lcssa = 0, $r_sroa_1_1_lcssa = 0, $q_sroa_0_1_lcssa = 0, $q_sroa_1_1_lcssa = 0, $q_sroa_0_0_insert_ext75$0 = 0, $q_sroa_0_0_insert_ext75$1 = 0, $q_sroa_0_0_insert_insert77$1 = 0, $_0$0 = 0, $_0$1 = 0;
    $n_sroa_0_0_extract_trunc = $a$0;
    $n_sroa_1_4_extract_shift$0 = $a$1;
    $n_sroa_1_4_extract_trunc = $n_sroa_1_4_extract_shift$0;
    $d_sroa_0_0_extract_trunc = $b$0;
    $d_sroa_1_4_extract_shift$0 = $b$1;
    $d_sroa_1_4_extract_trunc = $d_sroa_1_4_extract_shift$0;
    if (($n_sroa_1_4_extract_trunc | 0) == 0) {
      $4 = ($rem | 0) != 0;
      if (($d_sroa_1_4_extract_trunc | 0) == 0) {
        if ($4) {
          HEAP32[$rem >> 2] = ($n_sroa_0_0_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0);
          HEAP32[$rem + 4 >> 2] = 0;
        }
        $_0$1 = 0;
        $_0$0 = ($n_sroa_0_0_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0;
        return (tempRet0 = $_0$1, $_0$0) | 0;
      } else {
        if (!$4) {
          $_0$1 = 0;
          $_0$0 = 0;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
        HEAP32[$rem >> 2] = $a$0 & -1;
        HEAP32[$rem + 4 >> 2] = $a$1 & 0;
        $_0$1 = 0;
        $_0$0 = 0;
        return (tempRet0 = $_0$1, $_0$0) | 0;
      }
    }
    $17 = ($d_sroa_1_4_extract_trunc | 0) == 0;
    do {
      if (($d_sroa_0_0_extract_trunc | 0) == 0) {
        if ($17) {
          if (($rem | 0) != 0) {
            HEAP32[$rem >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0);
            HEAP32[$rem + 4 >> 2] = 0;
          }
          $_0$1 = 0;
          $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
        if (($n_sroa_0_0_extract_trunc | 0) == 0) {
          if (($rem | 0) != 0) {
            HEAP32[$rem >> 2] = 0;
            HEAP32[$rem + 4 >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_1_4_extract_trunc >>> 0);
          }
          $_0$1 = 0;
          $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_1_4_extract_trunc >>> 0) >>> 0;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
        $37 = $d_sroa_1_4_extract_trunc - 1 | 0;
        if (($37 & $d_sroa_1_4_extract_trunc | 0) == 0) {
          if (($rem | 0) != 0) {
            HEAP32[$rem >> 2] = 0 | $a$0 & -1;
            HEAP32[$rem + 4 >> 2] = $37 & $n_sroa_1_4_extract_trunc | $a$1 & 0;
          }
          $_0$1 = 0;
          $_0$0 = $n_sroa_1_4_extract_trunc >>> ((_llvm_cttz_i32($d_sroa_1_4_extract_trunc | 0) | 0) >>> 0);
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
        $49 = Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0;
        $51 = $49 - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0;
        if ($51 >>> 0 <= 30) {
          $57 = $51 + 1 | 0;
          $58 = 31 - $51 | 0;
          $sr_1_ph = $57;
          $r_sroa_0_1_ph = $n_sroa_1_4_extract_trunc << $58 | $n_sroa_0_0_extract_trunc >>> ($57 >>> 0);
          $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($57 >>> 0);
          $q_sroa_0_1_ph = 0;
          $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $58;
          break;
        }
        if (($rem | 0) == 0) {
          $_0$1 = 0;
          $_0$0 = 0;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
        HEAP32[$rem >> 2] = 0 | $a$0 & -1;
        HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0;
        $_0$1 = 0;
        $_0$0 = 0;
        return (tempRet0 = $_0$1, $_0$0) | 0;
      } else {
        if (!$17) {
          $117 = Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0;
          $119 = $117 - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0;
          if ($119 >>> 0 <= 31) {
            $125 = $119 + 1 | 0;
            $126 = 31 - $119 | 0;
            $130 = $119 - 31 >> 31;
            $sr_1_ph = $125;
            $r_sroa_0_1_ph = $n_sroa_0_0_extract_trunc >>> ($125 >>> 0) & $130 | $n_sroa_1_4_extract_trunc << $126;
            $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($125 >>> 0) & $130;
            $q_sroa_0_1_ph = 0;
            $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $126;
            break;
          }
          if (($rem | 0) == 0) {
            $_0$1 = 0;
            $_0$0 = 0;
            return (tempRet0 = $_0$1, $_0$0) | 0;
          }
          HEAP32[$rem >> 2] = 0 | $a$0 & -1;
          HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0;
          $_0$1 = 0;
          $_0$0 = 0;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
        $66 = $d_sroa_0_0_extract_trunc - 1 | 0;
        if (($66 & $d_sroa_0_0_extract_trunc | 0) != 0) {
          $86 = (Math_clz32($d_sroa_0_0_extract_trunc | 0) | 0) + 33 | 0;
          $88 = $86 - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0;
          $89 = 64 - $88 | 0;
          $91 = 32 - $88 | 0;
          $92 = $91 >> 31;
          $95 = $88 - 32 | 0;
          $105 = $95 >> 31;
          $sr_1_ph = $88;
          $r_sroa_0_1_ph = $91 - 1 >> 31 & $n_sroa_1_4_extract_trunc >>> ($95 >>> 0) | ($n_sroa_1_4_extract_trunc << $91 | $n_sroa_0_0_extract_trunc >>> ($88 >>> 0)) & $105;
          $r_sroa_1_1_ph = $105 & $n_sroa_1_4_extract_trunc >>> ($88 >>> 0);
          $q_sroa_0_1_ph = $n_sroa_0_0_extract_trunc << $89 & $92;
          $q_sroa_1_1_ph = ($n_sroa_1_4_extract_trunc << $89 | $n_sroa_0_0_extract_trunc >>> ($95 >>> 0)) & $92 | $n_sroa_0_0_extract_trunc << $91 & $88 - 33 >> 31;
          break;
        }
        if (($rem | 0) != 0) {
          HEAP32[$rem >> 2] = $66 & $n_sroa_0_0_extract_trunc;
          HEAP32[$rem + 4 >> 2] = 0;
        }
        if (($d_sroa_0_0_extract_trunc | 0) == 1) {
          $_0$1 = $n_sroa_1_4_extract_shift$0 | $a$1 & 0;
          $_0$0 = 0 | $a$0 & -1;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        } else {
          $78 = _llvm_cttz_i32($d_sroa_0_0_extract_trunc | 0) | 0;
          $_0$1 = 0 | $n_sroa_1_4_extract_trunc >>> ($78 >>> 0);
          $_0$0 = $n_sroa_1_4_extract_trunc << 32 - $78 | $n_sroa_0_0_extract_trunc >>> ($78 >>> 0) | 0;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
      }
    } while (0);
    if (($sr_1_ph | 0) == 0) {
      $q_sroa_1_1_lcssa = $q_sroa_1_1_ph;
      $q_sroa_0_1_lcssa = $q_sroa_0_1_ph;
      $r_sroa_1_1_lcssa = $r_sroa_1_1_ph;
      $r_sroa_0_1_lcssa = $r_sroa_0_1_ph;
      $carry_0_lcssa$1 = 0;
      $carry_0_lcssa$0 = 0;
    } else {
      $d_sroa_0_0_insert_insert99$0 = 0 | $b$0 & -1;
      $d_sroa_0_0_insert_insert99$1 = $d_sroa_1_4_extract_shift$0 | $b$1 & 0;
      $137$0 = _i64Add($d_sroa_0_0_insert_insert99$0 | 0, $d_sroa_0_0_insert_insert99$1 | 0, -1, -1) | 0;
      $137$1 = tempRet0;
      $q_sroa_1_1198 = $q_sroa_1_1_ph;
      $q_sroa_0_1199 = $q_sroa_0_1_ph;
      $r_sroa_1_1200 = $r_sroa_1_1_ph;
      $r_sroa_0_1201 = $r_sroa_0_1_ph;
      $sr_1202 = $sr_1_ph;
      $carry_0203 = 0;
      while (1) {
        $147 = $q_sroa_0_1199 >>> 31 | $q_sroa_1_1198 << 1;
        $149 = $carry_0203 | $q_sroa_0_1199 << 1;
        $r_sroa_0_0_insert_insert42$0 = 0 | ($r_sroa_0_1201 << 1 | $q_sroa_1_1198 >>> 31);
        $r_sroa_0_0_insert_insert42$1 = $r_sroa_0_1201 >>> 31 | $r_sroa_1_1200 << 1 | 0;
        _i64Subtract($137$0 | 0, $137$1 | 0, $r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0) | 0;
        $150$1 = tempRet0;
        $151$0 = $150$1 >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1;
        $152 = $151$0 & 1;
        $154$0 = _i64Subtract($r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0, $151$0 & $d_sroa_0_0_insert_insert99$0 | 0, ((($150$1 | 0) < 0 ? -1 : 0) >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1) & $d_sroa_0_0_insert_insert99$1 | 0) | 0;
        $r_sroa_0_0_extract_trunc = $154$0;
        $r_sroa_1_4_extract_trunc = tempRet0;
        $155 = $sr_1202 - 1 | 0;
        if (($155 | 0) == 0) {
          break;
        } else {
          $q_sroa_1_1198 = $147;
          $q_sroa_0_1199 = $149;
          $r_sroa_1_1200 = $r_sroa_1_4_extract_trunc;
          $r_sroa_0_1201 = $r_sroa_0_0_extract_trunc;
          $sr_1202 = $155;
          $carry_0203 = $152;
        }
      }
      $q_sroa_1_1_lcssa = $147;
      $q_sroa_0_1_lcssa = $149;
      $r_sroa_1_1_lcssa = $r_sroa_1_4_extract_trunc;
      $r_sroa_0_1_lcssa = $r_sroa_0_0_extract_trunc;
      $carry_0_lcssa$1 = 0;
      $carry_0_lcssa$0 = $152;
    }
    $q_sroa_0_0_insert_ext75$0 = $q_sroa_0_1_lcssa;
    $q_sroa_0_0_insert_ext75$1 = 0;
    $q_sroa_0_0_insert_insert77$1 = $q_sroa_1_1_lcssa | $q_sroa_0_0_insert_ext75$1;
    if (($rem | 0) != 0) {
      HEAP32[$rem >> 2] = 0 | $r_sroa_0_1_lcssa;
      HEAP32[$rem + 4 >> 2] = $r_sroa_1_1_lcssa | 0;
    }
    $_0$1 = (0 | $q_sroa_0_0_insert_ext75$0) >>> 31 | $q_sroa_0_0_insert_insert77$1 << 1 | ($q_sroa_0_0_insert_ext75$1 << 1 | $q_sroa_0_0_insert_ext75$0 >>> 31) & 0 | $carry_0_lcssa$1;
    $_0$0 = ($q_sroa_0_0_insert_ext75$0 << 1 | 0 >>> 31) & -2 | $carry_0_lcssa$0;
    return (tempRet0 = $_0$1, $_0$0) | 0;
}
function ___udivdi3($a$0, $a$1, $b$0, $b$1) {
    $a$0 = $a$0 | 0;
    $a$1 = $a$1 | 0;
    $b$0 = $b$0 | 0;
    $b$1 = $b$1 | 0;
    var $1$0 = 0;
    $1$0 = ___udivmoddi4($a$0, $a$1, $b$0, $b$1, 0) | 0;
    return $1$0 | 0;
}
function ___uremdi3($a$0, $a$1, $b$0, $b$1) {
    $a$0 = $a$0 | 0;
    $a$1 = $a$1 | 0;
    $b$0 = $b$0 | 0;
    $b$1 = $b$1 | 0;
    var $rem = 0, __stackBase__ = 0;
    __stackBase__ = STACKTOP;
    STACKTOP = STACKTOP + 16 | 0;
    $rem = __stackBase__ | 0;
    ___udivmoddi4($a$0, $a$1, $b$0, $b$1, $rem) | 0;
    STACKTOP = __stackBase__;
    return (tempRet0 = HEAP32[$rem + 4 >> 2] | 0, HEAP32[$rem >> 2] | 0) | 0;
}
function _bitshift64Lshr(low, high, bits) {
    low = low|0; high = high|0; bits = bits|0;
    var ander = 0;
    if ((bits|0) < 32) {
      ander = ((1 << bits) - 1)|0;
      tempRet0 = high >>> bits;
      return (low >>> bits) | ((high&ander) << (32 - bits));
    }
    tempRet0 = 0;
    return (high >>> (bits - 32))|0;
}
function _bitshift64Shl(low, high, bits) {
    low = low|0; high = high|0; bits = bits|0;
    var ander = 0;
    if ((bits|0) < 32) {
      ander = ((1 << bits) - 1)|0;
      tempRet0 = (high << bits) | ((low&(ander << (32 - bits))) >>> (32 - bits));
      return low << bits;
    }
    tempRet0 = low << (bits - 32);
    return 0;
}
function _llvm_bswap_i32(x) {
    x = x|0;
    return (((x&0xff)<<24) | (((x>>8)&0xff)<<16) | (((x>>16)&0xff)<<8) | (x>>>24))|0;
}
function _memcpy(dest, src, num) {
    dest = dest|0; src = src|0; num = num|0;
    var ret = 0;
    var aligned_dest_end = 0;
    var block_aligned_dest_end = 0;
    var dest_end = 0;
    // Test against a benchmarked cutoff limit for when HEAPU8.set() becomes faster to use.
    if ((num|0) >=
      8192
    ) {
      return _emscripten_memcpy_big(dest|0, src|0, num|0)|0;
    }

    ret = dest|0;
    dest_end = (dest + num)|0;
    if ((dest&3) == (src&3)) {
      // The initial unaligned < 4-byte front.
      while (dest & 3) {
        if ((num|0) == 0) return ret|0;
        HEAP8[((dest)>>0)]=((HEAP8[((src)>>0)])|0);
        dest = (dest+1)|0;
        src = (src+1)|0;
        num = (num-1)|0;
      }
      aligned_dest_end = (dest_end & -4)|0;
      block_aligned_dest_end = (aligned_dest_end - 64)|0;
      while ((dest|0) <= (block_aligned_dest_end|0) ) {
        HEAP32[((dest)>>2)]=((HEAP32[((src)>>2)])|0);
        HEAP32[(((dest)+(4))>>2)]=((HEAP32[(((src)+(4))>>2)])|0);
        HEAP32[(((dest)+(8))>>2)]=((HEAP32[(((src)+(8))>>2)])|0);
        HEAP32[(((dest)+(12))>>2)]=((HEAP32[(((src)+(12))>>2)])|0);
        HEAP32[(((dest)+(16))>>2)]=((HEAP32[(((src)+(16))>>2)])|0);
        HEAP32[(((dest)+(20))>>2)]=((HEAP32[(((src)+(20))>>2)])|0);
        HEAP32[(((dest)+(24))>>2)]=((HEAP32[(((src)+(24))>>2)])|0);
        HEAP32[(((dest)+(28))>>2)]=((HEAP32[(((src)+(28))>>2)])|0);
        HEAP32[(((dest)+(32))>>2)]=((HEAP32[(((src)+(32))>>2)])|0);
        HEAP32[(((dest)+(36))>>2)]=((HEAP32[(((src)+(36))>>2)])|0);
        HEAP32[(((dest)+(40))>>2)]=((HEAP32[(((src)+(40))>>2)])|0);
        HEAP32[(((dest)+(44))>>2)]=((HEAP32[(((src)+(44))>>2)])|0);
        HEAP32[(((dest)+(48))>>2)]=((HEAP32[(((src)+(48))>>2)])|0);
        HEAP32[(((dest)+(52))>>2)]=((HEAP32[(((src)+(52))>>2)])|0);
        HEAP32[(((dest)+(56))>>2)]=((HEAP32[(((src)+(56))>>2)])|0);
        HEAP32[(((dest)+(60))>>2)]=((HEAP32[(((src)+(60))>>2)])|0);
        dest = (dest+64)|0;
        src = (src+64)|0;
      }
      while ((dest|0) < (aligned_dest_end|0) ) {
        HEAP32[((dest)>>2)]=((HEAP32[((src)>>2)])|0);
        dest = (dest+4)|0;
        src = (src+4)|0;
      }
    } else {
      // In the unaligned copy case, unroll a bit as well.
      aligned_dest_end = (dest_end - 4)|0;
      while ((dest|0) < (aligned_dest_end|0) ) {
        HEAP8[((dest)>>0)]=((HEAP8[((src)>>0)])|0);
        HEAP8[(((dest)+(1))>>0)]=((HEAP8[(((src)+(1))>>0)])|0);
        HEAP8[(((dest)+(2))>>0)]=((HEAP8[(((src)+(2))>>0)])|0);
        HEAP8[(((dest)+(3))>>0)]=((HEAP8[(((src)+(3))>>0)])|0);
        dest = (dest+4)|0;
        src = (src+4)|0;
      }
    }
    // The remaining unaligned < 4 byte tail.
    while ((dest|0) < (dest_end|0)) {
      HEAP8[((dest)>>0)]=((HEAP8[((src)>>0)])|0);
      dest = (dest+1)|0;
      src = (src+1)|0;
    }
    return ret|0;
}
function _memset(ptr, value, num) {
    ptr = ptr|0; value = value|0; num = num|0;
    var end = 0, aligned_end = 0, block_aligned_end = 0, value4 = 0;
    end = (ptr + num)|0;

    value = value & 0xff;
    if ((num|0) >= 67 /* 64 bytes for an unrolled loop + 3 bytes for unaligned head*/) {
      while ((ptr&3) != 0) {
        HEAP8[((ptr)>>0)]=value;
        ptr = (ptr+1)|0;
      }

      aligned_end = (end & -4)|0;
      block_aligned_end = (aligned_end - 64)|0;
      value4 = value | (value << 8) | (value << 16) | (value << 24);

      while((ptr|0) <= (block_aligned_end|0)) {
        HEAP32[((ptr)>>2)]=value4;
        HEAP32[(((ptr)+(4))>>2)]=value4;
        HEAP32[(((ptr)+(8))>>2)]=value4;
        HEAP32[(((ptr)+(12))>>2)]=value4;
        HEAP32[(((ptr)+(16))>>2)]=value4;
        HEAP32[(((ptr)+(20))>>2)]=value4;
        HEAP32[(((ptr)+(24))>>2)]=value4;
        HEAP32[(((ptr)+(28))>>2)]=value4;
        HEAP32[(((ptr)+(32))>>2)]=value4;
        HEAP32[(((ptr)+(36))>>2)]=value4;
        HEAP32[(((ptr)+(40))>>2)]=value4;
        HEAP32[(((ptr)+(44))>>2)]=value4;
        HEAP32[(((ptr)+(48))>>2)]=value4;
        HEAP32[(((ptr)+(52))>>2)]=value4;
        HEAP32[(((ptr)+(56))>>2)]=value4;
        HEAP32[(((ptr)+(60))>>2)]=value4;
        ptr = (ptr + 64)|0;
      }

      while ((ptr|0) < (aligned_end|0) ) {
        HEAP32[((ptr)>>2)]=value4;
        ptr = (ptr+4)|0;
      }
    }
    // The remaining bytes.
    while ((ptr|0) < (end|0)) {
      HEAP8[((ptr)>>0)]=value;
      ptr = (ptr+1)|0;
    }
    return (end-num)|0;
}
function _sbrk(increment) {
    increment = increment|0;
    var oldDynamicTop = 0;
    var oldDynamicTopOnChange = 0;
    var newDynamicTop = 0;
    var totalMemory = 0;
    increment = ((increment + 15) & -16)|0;
    oldDynamicTop = HEAP32[DYNAMICTOP_PTR>>2]|0;
    newDynamicTop = oldDynamicTop + increment | 0;

    if (((increment|0) > 0 & (newDynamicTop|0) < (oldDynamicTop|0)) // Detect and fail if we would wrap around signed 32-bit int.
      | (newDynamicTop|0) < 0) { // Also underflow, sbrk() should be able to be used to subtract.
      abortOnCannotGrowMemory()|0;
      ___setErrNo(12);
      return -1;
    }

    HEAP32[DYNAMICTOP_PTR>>2] = newDynamicTop;
    totalMemory = getTotalMemory()|0;
    if ((newDynamicTop|0) > (totalMemory|0)) {
      if ((enlargeMemory()|0) == 0) {
        HEAP32[DYNAMICTOP_PTR>>2] = oldDynamicTop;
        ___setErrNo(12);
        return -1;
      }
    }
    return oldDynamicTop|0;
}

  
function dynCall_d(index) {
  index = index|0;
  
  return +FUNCTION_TABLE_d[index&63]();
}


function dynCall_di(index,a1) {
  index = index|0;
  a1=a1|0;
  return +FUNCTION_TABLE_di[index&127](a1|0);
}


function dynCall_i(index) {
  index = index|0;
  
  return FUNCTION_TABLE_i[index&127]()|0;
}


function dynCall_ii(index,a1) {
  index = index|0;
  a1=a1|0;
  return FUNCTION_TABLE_ii[index&127](a1|0)|0;
}


function dynCall_iii(index,a1,a2) {
  index = index|0;
  a1=a1|0; a2=a2|0;
  return FUNCTION_TABLE_iii[index&127](a1|0,a2|0)|0;
}


function dynCall_iiii(index,a1,a2,a3) {
  index = index|0;
  a1=a1|0; a2=a2|0; a3=a3|0;
  return FUNCTION_TABLE_iiii[index&63](a1|0,a2|0,a3|0)|0;
}


function dynCall_v(index) {
  index = index|0;
  
  FUNCTION_TABLE_v[index&127]();
}


function dynCall_vi(index,a1) {
  index = index|0;
  a1=a1|0;
  FUNCTION_TABLE_vi[index&127](a1|0);
}


function dynCall_vii(index,a1,a2) {
  index = index|0;
  a1=a1|0; a2=a2|0;
  FUNCTION_TABLE_vii[index&127](a1|0,a2|0);
}


function dynCall_viii(index,a1,a2,a3) {
  index = index|0;
  a1=a1|0; a2=a2|0; a3=a3|0;
  FUNCTION_TABLE_viii[index&127](a1|0,a2|0,a3|0);
}


function dynCall_viiii(index,a1,a2,a3,a4) {
  index = index|0;
  a1=a1|0; a2=a2|0; a3=a3|0; a4=a4|0;
  FUNCTION_TABLE_viiii[index&127](a1|0,a2|0,a3|0,a4|0);
}


function dynCall_viiiii(index,a1,a2,a3,a4,a5) {
  index = index|0;
  a1=a1|0; a2=a2|0; a3=a3|0; a4=a4|0; a5=a5|0;
  FUNCTION_TABLE_viiiii[index&127](a1|0,a2|0,a3|0,a4|0,a5|0);
}


function dynCall_viiiiii(index,a1,a2,a3,a4,a5,a6) {
  index = index|0;
  a1=a1|0; a2=a2|0; a3=a3|0; a4=a4|0; a5=a5|0; a6=a6|0;
  FUNCTION_TABLE_viiiiii[index&127](a1|0,a2|0,a3|0,a4|0,a5|0,a6|0);
}

function b0() {
 ; nullFunc_d(0);return +0;
}
function b1(p0) {
 p0 = p0|0; nullFunc_di(1);return +0;
}
function b2() {
 ; nullFunc_i(2);return 0;
}
function b3(p0) {
 p0 = p0|0; nullFunc_ii(3);return 0;
}
function b4(p0,p1) {
 p0 = p0|0;p1 = p1|0; nullFunc_iii(4);return 0;
}
function b5(p0,p1,p2) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0; nullFunc_iiii(5);return 0;
}
function b6() {
 ; nullFunc_v(6);
}
function ___cxa_end_catch__wrapper() {
 ; ___cxa_end_catch();
}
function b7(p0) {
 p0 = p0|0; nullFunc_vi(7);
}
function __embind_finalize_value_object__wrapper(p0) {
 p0 = p0|0; __embind_finalize_value_object(p0|0);
}
function b8(p0,p1) {
 p0 = p0|0;p1 = p1|0; nullFunc_vii(8);
}
function b9(p0,p1,p2) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0; nullFunc_viii(9);
}
function b10(p0,p1,p2,p3) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0; nullFunc_viiii(10);
}
function b11(p0,p1,p2,p3,p4) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0;p4 = p4|0; nullFunc_viiiii(11);
}
function b12(p0,p1,p2,p3,p4,p5) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0;p4 = p4|0;p5 = p5|0; nullFunc_viiiiii(12);
}
function __embind_register_value_object__wrapper(p0,p1,p2,p3,p4,p5) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0;p4 = p4|0;p5 = p5|0; __embind_register_value_object(p0|0,p1|0,p2|0,p3|0,p4|0,p5|0);
}

// EMSCRIPTEN_END_FUNCS
var FUNCTION_TABLE_d = [b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0
,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,__ZL13getSampleRatev,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0,b0
,b0,b0,b0,b0,b0];
var FUNCTION_TABLE_di = [b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1
,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1
,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1
,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,b1,__ZN10emscripten8internal7InvokerIdJEE6invokeEPFdvE,b1,b1,b1,b1,b1
,b1,b1,b1,b1,b1,b1,b1,b1,b1];
var FUNCTION_TABLE_i = [b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2
,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,__ZL8getSynthv,b2,b2,b2,b2,b2,b2,b2,b2,__ZN10emscripten8internal12operator_newI4LerpJEEEPT_DpOT0_,b2,b2,b2,b2,b2,b2,b2
,b2,b2,__ZN10emscripten8internal12operator_newI5SynthJEEEPT_DpOT0_,b2,b2,b2,b2,b2,b2,b2,b2,b2,__ZN10emscripten8internal12operator_newI9MidiSynthJEEEPT_DpOT0_,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,b2,__ZN10emscripten8internal15raw_constructorI10HeapRegionIaEJEEEPT_DpNS0_11BindingTypeIT0_E8WireTypeE,b2,__ZN10emscripten8internal6TypeIDI10HeapRegionIaEE3getEv
,b2,b2,b2,b2,__ZN10emscripten8internal15raw_constructorI10HeapRegionIhEJEEEPT_DpNS0_11BindingTypeIT0_E8WireTypeE,b2,__ZN10emscripten8internal6TypeIDI10HeapRegionIhEE3getEv,b2,b2,__ZN10emscripten8internal15raw_constructorI10HeapRegionI9LerpStageEJEEEPT_DpNS0_11BindingTypeIT0_E8WireTypeE,b2,__ZN10emscripten8internal6TypeIDI10HeapRegionI9LerpStageEE3getEv,b2,b2,__ZN10emscripten8internal15raw_constructorI10HeapRegionI11LerpProgramEJEEEPT_DpNS0_11BindingTypeIT0_E8WireTypeE,b2,__ZN10emscripten8internal6TypeIDI10HeapRegionI11LerpProgramEE3getEv,b2,b2,__ZN10emscripten8internal15raw_constructorI10HeapRegionI10InstrumentEJEEEPT_DpNS0_11BindingTypeIT0_E8WireTypeE,b2,__ZN10emscripten8internal6TypeIDI10HeapRegionI10InstrumentEE3getEv,b2,b2,b2,b2,b2,b2,b2,b2
,b2,b2,b2,b2,b2,___cxa_get_globals_fast,b2,b2,b2];
var FUNCTION_TABLE_ii = [b3,___stdio_close,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,__ZNKSt9bad_alloc4whatEv,b3,b3,b3,b3,b3,b3,b3,b3
,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,__ZN10emscripten8internal13getActualTypeI9LerpStageEEPKvPT_,b3,__ZN10emscripten8internal13getActualTypeI11LerpProgramEEPKvPT_,b3,__ZN10emscripten8internal13getActualTypeI10InstrumentEEPKvPT_,b3,__ZN10emscripten8internal13getActualTypeI4LerpEEPKvPT_,b3,b3,__ZN10emscripten8internal7InvokerIP4LerpJEE6invokeEPFS3_vE,__ZN4Lerp8sampleEmEv,b3,b3,b3,b3,b3
,__ZN10emscripten8internal13getActualTypeI5SynthEEPKvPT_,b3,b3,__ZN10emscripten8internal7InvokerIP5SynthJEE6invokeEPFS3_vE,__ZN5Synth6sampleEv,b3,b3,b3,b3,b3,__ZN10emscripten8internal13getActualTypeI9MidiSynthEEPKvPT_,b3,b3,__ZN10emscripten8internal7InvokerIP9MidiSynthJEE6invokeEPFS3_vE,b3,b3,b3,b3,b3,b3,b3,b3,__ZN10emscripten8internal7InvokerIK10HeapRegionIhEJEE6invokeEPFS4_vE,__ZN10emscripten8internal7InvokerIK10HeapRegionIaEJEE6invokeEPFS4_vE,__ZN10emscripten8internal7InvokerIK10HeapRegionI9LerpStageEJEE6invokeEPFS5_vE,__ZN10emscripten8internal7InvokerIK10HeapRegionI11LerpProgramEJEE6invokeEPFS5_vE,__ZN10emscripten8internal7InvokerIK10HeapRegionI10InstrumentEJEE6invokeEPFS5_vE,b3,b3,b3
,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,b3,__ZN10emscripten4baseI5SynthE14convertPointerI9MidiSynthS1_EEPT0_PT_,__ZN10emscripten4baseI5SynthE14convertPointerIS1_9MidiSynthEEPT0_PT_,b3,b3,b3
,b3,b3,b3,b3,b3,b3,b3,b3,b3];
var FUNCTION_TABLE_iii = [b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4
,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,__ZN10emscripten8internal13MethodInvokerIM4LerpFhvEhPS2_JEE6invokeERKS4_S5_,b4,b4,b4,b4
,b4,b4,b4,b4,b4,__ZN10emscripten8internal13MethodInvokerIM5SynthFtvEtPS2_JEE6invokeERKS4_S5_,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4,b4
,b4,__ZN10emscripten8internal12MemberAccessI10HeapRegionIaEjE7getWireIS3_EEjRKMS3_jRKT_,b4,b4,b4,b4,b4,__ZN10emscripten8internal12MemberAccessI10HeapRegionIhEjE7getWireIS3_EEjRKMS3_jRKT_,b4,b4,b4,b4,__ZN10emscripten8internal12MemberAccessI10HeapRegionI9LerpStageEjE7getWireIS4_EEjRKMS4_jRKT_,b4,b4,b4,b4,__ZN10emscripten8internal12MemberAccessI10HeapRegionI11LerpProgramEjE7getWireIS4_EEjRKMS4_jRKT_,b4,b4,b4,b4,__ZN10emscripten8internal12MemberAccessI10HeapRegionI10InstrumentEjE7getWireIS4_EEjRKMS4_jRKT_,b4,b4,b4,b4,b4,b4,b4
,b4,b4,b4,b4,b4,b4,b4,b4,b4];
var FUNCTION_TABLE_iiii = [b5,b5,___stdio_write,___stdio_seek,___stdout_write,b5,b5,b5,b5,b5,__ZNK10__cxxabiv117__class_type_info9can_catchEPKNS_16__shim_type_infoERPv,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,__ZNK10__cxxabiv123__fundamental_type_info9can_catchEPKNS_16__shim_type_infoERPv,b5,__ZNK10__cxxabiv119__pointer_type_info9can_catchEPKNS_16__shim_type_infoERPv,b5,b5,b5,b5
,b5,b5,b5,b5,b5,b5,b5,__ZN10emscripten12value_objectI10HeapRegionIaEE5fieldIS2_jEERS3_PKcMT_T0_,__ZN10emscripten12value_objectI10HeapRegionIhEE5fieldIS2_jEERS3_PKcMT_T0_,__ZN10emscripten12value_objectI10HeapRegionI9LerpStageEE5fieldIS3_jEERS4_PKcMT_T0_,__ZN10emscripten12value_objectI10HeapRegionI11LerpProgramEE5fieldIS3_jEERS4_PKcMT_T0_,__ZN10emscripten12value_objectI10HeapRegionI10InstrumentEE5fieldIS3_jEERS4_PKcMT_T0_,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5,b5
,b5,b5,b5,b5,b5];
var FUNCTION_TABLE_v = [b6,b6,b6,b6,b6,__ZL25default_terminate_handlerv,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6
,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6
,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6
,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6,b6
,b6,b6,b6,__ZN10__cxxabiv112_GLOBAL__N_110construct_Ev,b6,b6,b6,___cxa_end_catch__wrapper,b6];
var FUNCTION_TABLE_vi = [b7,b7,b7,b7,b7,b7,__ZN10__cxxabiv116__shim_type_infoD2Ev,__ZN10__cxxabiv117__class_type_infoD0Ev,__ZNK10__cxxabiv116__shim_type_info5noop1Ev,__ZNK10__cxxabiv116__shim_type_info5noop2Ev,b7,b7,b7,b7,__ZN10__cxxabiv120__si_class_type_infoD0Ev,b7,b7,b7,__ZNSt9bad_allocD2Ev,__ZNSt9bad_allocD0Ev,b7,__ZN10__cxxabiv123__fundamental_type_infoD0Ev,b7,__ZN10__cxxabiv119__pointer_type_infoD0Ev,b7,__ZN10__cxxabiv121__vmi_class_type_infoD0Ev,b7,b7,b7
,__Z16midi_decode_byteh,__ZN11Instruments18getPercussionNotesEv,__ZN11Instruments12getWavetableEv,__ZN11Instruments13getLerpStagesEv,__ZN11Instruments15getLerpProgramsEv,__ZN11Instruments19getLerpProgressionsEv,__ZN11Instruments14getInstrumentsEv,b7,b7,b7,b7,b7,b7,b7,b7,__ZN10emscripten8internal14raw_destructorI9LerpStageEEvPT_,b7,__ZN10emscripten8internal14raw_destructorI11LerpProgramEEvPT_,b7,__ZN10emscripten8internal14raw_destructorI10InstrumentEEvPT_,b7,__ZN10emscripten8internal14raw_destructorI4LerpEEvPT_,b7,b7,b7,b7,b7,b7,__ZN4Lerp6stopEmEv,b7
,b7,__ZN10emscripten8internal14raw_destructorI5SynthEEvPT_,b7,b7,b7,b7,b7,b7,b7,b7,b7,__ZN10emscripten8internal14raw_destructorI9MidiSynthEEvPT_,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,b7,__ZN10emscripten8internal14raw_destructorI10HeapRegionIaEEEvPT_,b7
,b7,b7,b7,__embind_finalize_value_object__wrapper,b7,__ZN10emscripten8internal14raw_destructorI10HeapRegionIhEEEvPT_,b7,b7,b7,b7,__ZN10emscripten8internal14raw_destructorI10HeapRegionI9LerpStageEEEvPT_,b7,b7,b7,b7,__ZN10emscripten8internal14raw_destructorI10HeapRegionI11LerpProgramEEEvPT_,b7,b7,b7,b7,__ZN10emscripten8internal14raw_destructorI10HeapRegionI10InstrumentEEEvPT_,b7,b7,b7,b7,b7,b7,__ZN9MidiSynthC2Ev,__ZN10HeapRegionI10InstrumentEC2Ev,__ZN10HeapRegionI11LerpProgramEC2Ev
,__ZN10HeapRegionI9LerpStageEC2Ev,__ZN10HeapRegionIhEC2Ev,__ZN10HeapRegionIaEC2Ev,b7,__ZN10__cxxabiv112_GLOBAL__N_19destruct_EPv,b7,b7,b7,b7];
var FUNCTION_TABLE_vii = [b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8
,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,__ZN10emscripten8internal13MethodInvokerIM4LerpFvvEvPS2_JEE6invokeERKS4_S5_
,b8,b8,b8,b8,b8,b8,b8,b8,__ZN5Synth7noteOffEh,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,__ZN10emscripten8internal7InvokerIvJhEE6invokeEPFvhEh,b8,b8,b8,b8,b8,b8,b8,b8
,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8,b8
,b8,b8,b8,b8,b8,b8,_abort_message,b8,b8];
var FUNCTION_TABLE_viii = [b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9
,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9,__ZN4Lerp7startEmEhh,b9,b9,b9
,b9,b9,b9,b9,b9,b9,b9,b9,b9,__ZN10emscripten8internal13MethodInvokerIM5SynthFvhEvPS2_JhEE6invokeERKS4_S5_h,b9,b9,b9,b9,b9,b9,__ZN9MidiSynth11midiNoteOffEhh,b9,__ZN9MidiSynth17midiProgramChangeEhh,__ZN9MidiSynth13midiPitchBendEhs,b9,b9,b9,b9,b9,b9,b9,b9,b9,b9
,b9,b9,__ZN10emscripten8internal12MemberAccessI10HeapRegionIaEjE7setWireIS3_EEvRKMS3_jRT_j,b9,b9,b9,b9,b9,__ZN10emscripten8internal12MemberAccessI10HeapRegionIhEjE7setWireIS3_EEvRKMS3_jRT_j,b9,b9,b9,b9,__ZN10emscripten8internal12MemberAccessI10HeapRegionI9LerpStageEjE7setWireIS4_EEvRKMS4_jRT_j,b9,b9,b9,b9,__ZN10emscripten8internal12MemberAccessI10HeapRegionI11LerpProgramEjE7setWireIS4_EEvRKMS4_jRT_j,b9,b9,b9,b9,__ZN10emscripten8internal12MemberAccessI10HeapRegionI10InstrumentEjE7setWireIS4_EEvRKMS4_jRT_j,b9,b9,b9,b9,b9,b9
,b9,b9,b9,b9,b9,b9,b9,b9,b9];
var FUNCTION_TABLE_viiii = [b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,__ZNK10__cxxabiv117__class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,b10,b10,b10,__ZNK10__cxxabiv120__si_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,__ZNK10__cxxabiv121__vmi_class_type_info27has_unambiguous_public_baseEPNS_19__dynamic_cast_infoEPvi
,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,__ZN10emscripten8internal13MethodInvokerIM4LerpFvhhEvPS2_JhhEE6invokeERKS4_S5_hh,b10,b10
,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,__ZN9MidiSynth10midiNoteOnEhhh,b10,b10,__ZN10emscripten8internal13MethodInvokerIM9MidiSynthFvhhEvPS2_JhhEE6invokeERKS4_S5_hh,b10,b10,__ZN10emscripten8internal13MethodInvokerIM9MidiSynthFvhsEvPS2_JhsEE6invokeERKS4_S5_hs,b10,b10,b10,b10,b10,b10,b10,b10,b10
,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10,b10
,b10,b10,b10,b10,b10,b10,b10,b10,b10];
var FUNCTION_TABLE_viiiii = [b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,__ZNK10__cxxabiv117__class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,b11,b11,b11,__ZNK10__cxxabiv120__si_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,__ZNK10__cxxabiv121__vmi_class_type_info16search_below_dstEPNS_19__dynamic_cast_infoEPKvib,b11
,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11
,b11,b11,b11,b11,b11,b11,__ZN5Synth8noteOnEmEhhhh,b11,b11,b11,b11,b11,b11,b11,b11,__ZN10emscripten8internal13MethodInvokerIM9MidiSynthFvhhhEvPS2_JhhhEE6invokeERKS4_S5_hhh,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11
,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11,b11
,b11,b11,b11,b11,b11,b11,b11,b11,b11];
var FUNCTION_TABLE_viiiiii = [b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,__ZNK10__cxxabiv117__class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,b12,b12,b12,__ZNK10__cxxabiv120__si_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,__ZNK10__cxxabiv121__vmi_class_type_info16search_above_dstEPNS_19__dynamic_cast_infoEPKvS4_ib,b12,b12
,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12
,b12,b12,b12,b12,b12,b12,b12,__ZN10emscripten8internal13MethodInvokerIM5SynthFvhhhhEvPS2_JhhhhEE6invokeERKS4_S5_hhhh,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12
,__embind_register_value_object__wrapper,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12,b12
,b12,b12,b12,b12,b12,b12,b12,b12,b12];

  return { __GLOBAL__sub_I_bind_cpp: __GLOBAL__sub_I_bind_cpp, __GLOBAL__sub_I_bindings_cpp: __GLOBAL__sub_I_bindings_cpp, __GLOBAL__sub_I_main_cpp: __GLOBAL__sub_I_main_cpp, ___cxa_can_catch: ___cxa_can_catch, ___cxa_is_pointer_type: ___cxa_is_pointer_type, ___errno_location: ___errno_location, ___getTypeName: ___getTypeName, ___udivdi3: ___udivdi3, ___uremdi3: ___uremdi3, _bitshift64Lshr: _bitshift64Lshr, _bitshift64Shl: _bitshift64Shl, _fflush: _fflush, _free: _free, _i64Add: _i64Add, _i64Subtract: _i64Subtract, _llvm_bswap_i32: _llvm_bswap_i32, _malloc: _malloc, _memcpy: _memcpy, _memset: _memset, _sbrk: _sbrk, dynCall_d: dynCall_d, dynCall_di: dynCall_di, dynCall_i: dynCall_i, dynCall_ii: dynCall_ii, dynCall_iii: dynCall_iii, dynCall_iiii: dynCall_iiii, dynCall_v: dynCall_v, dynCall_vi: dynCall_vi, dynCall_vii: dynCall_vii, dynCall_viii: dynCall_viii, dynCall_viiii: dynCall_viiii, dynCall_viiiii: dynCall_viiiii, dynCall_viiiiii: dynCall_viiiiii, establishStackSpace: establishStackSpace, getTempRet0: getTempRet0, runPostSets: runPostSets, setTempRet0: setTempRet0, setThrew: setThrew, stackAlloc: stackAlloc, stackRestore: stackRestore, stackSave: stackSave };
})
// EMSCRIPTEN_END_ASM
(Module.asmGlobalArg, Module.asmLibraryArg, buffer);

var real___GLOBAL__sub_I_bind_cpp = asm["__GLOBAL__sub_I_bind_cpp"]; asm["__GLOBAL__sub_I_bind_cpp"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real___GLOBAL__sub_I_bind_cpp.apply(null, arguments);
};

var real___GLOBAL__sub_I_bindings_cpp = asm["__GLOBAL__sub_I_bindings_cpp"]; asm["__GLOBAL__sub_I_bindings_cpp"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real___GLOBAL__sub_I_bindings_cpp.apply(null, arguments);
};

var real___GLOBAL__sub_I_main_cpp = asm["__GLOBAL__sub_I_main_cpp"]; asm["__GLOBAL__sub_I_main_cpp"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real___GLOBAL__sub_I_main_cpp.apply(null, arguments);
};

var real____cxa_can_catch = asm["___cxa_can_catch"]; asm["___cxa_can_catch"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real____cxa_can_catch.apply(null, arguments);
};

var real____cxa_is_pointer_type = asm["___cxa_is_pointer_type"]; asm["___cxa_is_pointer_type"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real____cxa_is_pointer_type.apply(null, arguments);
};

var real____errno_location = asm["___errno_location"]; asm["___errno_location"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real____errno_location.apply(null, arguments);
};

var real____getTypeName = asm["___getTypeName"]; asm["___getTypeName"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real____getTypeName.apply(null, arguments);
};

var real____udivdi3 = asm["___udivdi3"]; asm["___udivdi3"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real____udivdi3.apply(null, arguments);
};

var real____uremdi3 = asm["___uremdi3"]; asm["___uremdi3"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real____uremdi3.apply(null, arguments);
};

var real__bitshift64Lshr = asm["_bitshift64Lshr"]; asm["_bitshift64Lshr"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__bitshift64Lshr.apply(null, arguments);
};

var real__bitshift64Shl = asm["_bitshift64Shl"]; asm["_bitshift64Shl"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__bitshift64Shl.apply(null, arguments);
};

var real__fflush = asm["_fflush"]; asm["_fflush"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__fflush.apply(null, arguments);
};

var real__free = asm["_free"]; asm["_free"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__free.apply(null, arguments);
};

var real__i64Add = asm["_i64Add"]; asm["_i64Add"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__i64Add.apply(null, arguments);
};

var real__i64Subtract = asm["_i64Subtract"]; asm["_i64Subtract"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__i64Subtract.apply(null, arguments);
};

var real__llvm_bswap_i32 = asm["_llvm_bswap_i32"]; asm["_llvm_bswap_i32"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__llvm_bswap_i32.apply(null, arguments);
};

var real__malloc = asm["_malloc"]; asm["_malloc"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__malloc.apply(null, arguments);
};

var real__sbrk = asm["_sbrk"]; asm["_sbrk"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real__sbrk.apply(null, arguments);
};

var real_establishStackSpace = asm["establishStackSpace"]; asm["establishStackSpace"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_establishStackSpace.apply(null, arguments);
};

var real_getTempRet0 = asm["getTempRet0"]; asm["getTempRet0"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_getTempRet0.apply(null, arguments);
};

var real_setTempRet0 = asm["setTempRet0"]; asm["setTempRet0"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_setTempRet0.apply(null, arguments);
};

var real_setThrew = asm["setThrew"]; asm["setThrew"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_setThrew.apply(null, arguments);
};

var real_stackAlloc = asm["stackAlloc"]; asm["stackAlloc"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_stackAlloc.apply(null, arguments);
};

var real_stackRestore = asm["stackRestore"]; asm["stackRestore"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_stackRestore.apply(null, arguments);
};

var real_stackSave = asm["stackSave"]; asm["stackSave"] = function() {
  assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
  assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
  return real_stackSave.apply(null, arguments);
};
var __GLOBAL__sub_I_bind_cpp = Module["__GLOBAL__sub_I_bind_cpp"] = asm["__GLOBAL__sub_I_bind_cpp"];
var __GLOBAL__sub_I_bindings_cpp = Module["__GLOBAL__sub_I_bindings_cpp"] = asm["__GLOBAL__sub_I_bindings_cpp"];
var __GLOBAL__sub_I_main_cpp = Module["__GLOBAL__sub_I_main_cpp"] = asm["__GLOBAL__sub_I_main_cpp"];
var ___cxa_can_catch = Module["___cxa_can_catch"] = asm["___cxa_can_catch"];
var ___cxa_is_pointer_type = Module["___cxa_is_pointer_type"] = asm["___cxa_is_pointer_type"];
var ___errno_location = Module["___errno_location"] = asm["___errno_location"];
var ___getTypeName = Module["___getTypeName"] = asm["___getTypeName"];
var ___udivdi3 = Module["___udivdi3"] = asm["___udivdi3"];
var ___uremdi3 = Module["___uremdi3"] = asm["___uremdi3"];
var _bitshift64Lshr = Module["_bitshift64Lshr"] = asm["_bitshift64Lshr"];
var _bitshift64Shl = Module["_bitshift64Shl"] = asm["_bitshift64Shl"];
var _fflush = Module["_fflush"] = asm["_fflush"];
var _free = Module["_free"] = asm["_free"];
var _i64Add = Module["_i64Add"] = asm["_i64Add"];
var _i64Subtract = Module["_i64Subtract"] = asm["_i64Subtract"];
var _llvm_bswap_i32 = Module["_llvm_bswap_i32"] = asm["_llvm_bswap_i32"];
var _malloc = Module["_malloc"] = asm["_malloc"];
var _memcpy = Module["_memcpy"] = asm["_memcpy"];
var _memset = Module["_memset"] = asm["_memset"];
var _sbrk = Module["_sbrk"] = asm["_sbrk"];
var establishStackSpace = Module["establishStackSpace"] = asm["establishStackSpace"];
var getTempRet0 = Module["getTempRet0"] = asm["getTempRet0"];
var runPostSets = Module["runPostSets"] = asm["runPostSets"];
var setTempRet0 = Module["setTempRet0"] = asm["setTempRet0"];
var setThrew = Module["setThrew"] = asm["setThrew"];
var stackAlloc = Module["stackAlloc"] = asm["stackAlloc"];
var stackRestore = Module["stackRestore"] = asm["stackRestore"];
var stackSave = Module["stackSave"] = asm["stackSave"];
var dynCall_d = Module["dynCall_d"] = asm["dynCall_d"];
var dynCall_di = Module["dynCall_di"] = asm["dynCall_di"];
var dynCall_i = Module["dynCall_i"] = asm["dynCall_i"];
var dynCall_ii = Module["dynCall_ii"] = asm["dynCall_ii"];
var dynCall_iii = Module["dynCall_iii"] = asm["dynCall_iii"];
var dynCall_iiii = Module["dynCall_iiii"] = asm["dynCall_iiii"];
var dynCall_v = Module["dynCall_v"] = asm["dynCall_v"];
var dynCall_vi = Module["dynCall_vi"] = asm["dynCall_vi"];
var dynCall_vii = Module["dynCall_vii"] = asm["dynCall_vii"];
var dynCall_viii = Module["dynCall_viii"] = asm["dynCall_viii"];
var dynCall_viiii = Module["dynCall_viiii"] = asm["dynCall_viiii"];
var dynCall_viiiii = Module["dynCall_viiiii"] = asm["dynCall_viiiii"];
var dynCall_viiiiii = Module["dynCall_viiiiii"] = asm["dynCall_viiiiii"];
;



// === Auto-generated postamble setup entry stuff ===

Module['asm'] = asm;

if (!Module["intArrayFromString"]) Module["intArrayFromString"] = function() { abort("'intArrayFromString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["intArrayToString"]) Module["intArrayToString"] = function() { abort("'intArrayToString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["ccall"]) Module["ccall"] = function() { abort("'ccall' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["cwrap"]) Module["cwrap"] = function() { abort("'cwrap' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["setValue"]) Module["setValue"] = function() { abort("'setValue' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["getValue"]) Module["getValue"] = function() { abort("'getValue' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["allocate"]) Module["allocate"] = function() { abort("'allocate' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["getMemory"]) Module["getMemory"] = function() { abort("'getMemory' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["Pointer_stringify"]) Module["Pointer_stringify"] = function() { abort("'Pointer_stringify' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["AsciiToString"]) Module["AsciiToString"] = function() { abort("'AsciiToString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["stringToAscii"]) Module["stringToAscii"] = function() { abort("'stringToAscii' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["UTF8ArrayToString"]) Module["UTF8ArrayToString"] = function() { abort("'UTF8ArrayToString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["UTF8ToString"]) Module["UTF8ToString"] = function() { abort("'UTF8ToString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["stringToUTF8Array"]) Module["stringToUTF8Array"] = function() { abort("'stringToUTF8Array' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["stringToUTF8"]) Module["stringToUTF8"] = function() { abort("'stringToUTF8' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["lengthBytesUTF8"]) Module["lengthBytesUTF8"] = function() { abort("'lengthBytesUTF8' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["UTF16ToString"]) Module["UTF16ToString"] = function() { abort("'UTF16ToString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["stringToUTF16"]) Module["stringToUTF16"] = function() { abort("'stringToUTF16' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["lengthBytesUTF16"]) Module["lengthBytesUTF16"] = function() { abort("'lengthBytesUTF16' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["UTF32ToString"]) Module["UTF32ToString"] = function() { abort("'UTF32ToString' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["stringToUTF32"]) Module["stringToUTF32"] = function() { abort("'stringToUTF32' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["lengthBytesUTF32"]) Module["lengthBytesUTF32"] = function() { abort("'lengthBytesUTF32' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["allocateUTF8"]) Module["allocateUTF8"] = function() { abort("'allocateUTF8' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["stackTrace"]) Module["stackTrace"] = function() { abort("'stackTrace' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["addOnPreRun"]) Module["addOnPreRun"] = function() { abort("'addOnPreRun' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["addOnInit"]) Module["addOnInit"] = function() { abort("'addOnInit' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["addOnPreMain"]) Module["addOnPreMain"] = function() { abort("'addOnPreMain' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["addOnExit"]) Module["addOnExit"] = function() { abort("'addOnExit' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["addOnPostRun"]) Module["addOnPostRun"] = function() { abort("'addOnPostRun' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["writeStringToMemory"]) Module["writeStringToMemory"] = function() { abort("'writeStringToMemory' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["writeArrayToMemory"]) Module["writeArrayToMemory"] = function() { abort("'writeArrayToMemory' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["writeAsciiToMemory"]) Module["writeAsciiToMemory"] = function() { abort("'writeAsciiToMemory' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["addRunDependency"]) Module["addRunDependency"] = function() { abort("'addRunDependency' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["removeRunDependency"]) Module["removeRunDependency"] = function() { abort("'removeRunDependency' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["FS"]) Module["FS"] = function() { abort("'FS' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["FS_createFolder"]) Module["FS_createFolder"] = function() { abort("'FS_createFolder' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["FS_createPath"]) Module["FS_createPath"] = function() { abort("'FS_createPath' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["FS_createDataFile"]) Module["FS_createDataFile"] = function() { abort("'FS_createDataFile' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["FS_createPreloadedFile"]) Module["FS_createPreloadedFile"] = function() { abort("'FS_createPreloadedFile' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["FS_createLazyFile"]) Module["FS_createLazyFile"] = function() { abort("'FS_createLazyFile' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["FS_createLink"]) Module["FS_createLink"] = function() { abort("'FS_createLink' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["FS_createDevice"]) Module["FS_createDevice"] = function() { abort("'FS_createDevice' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["FS_unlink"]) Module["FS_unlink"] = function() { abort("'FS_unlink' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ). Alternatively, forcing filesystem support (-s FORCE_FILESYSTEM=1) can export this for you") };
if (!Module["GL"]) Module["GL"] = function() { abort("'GL' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["staticAlloc"]) Module["staticAlloc"] = function() { abort("'staticAlloc' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["dynamicAlloc"]) Module["dynamicAlloc"] = function() { abort("'dynamicAlloc' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["warnOnce"]) Module["warnOnce"] = function() { abort("'warnOnce' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["loadDynamicLibrary"]) Module["loadDynamicLibrary"] = function() { abort("'loadDynamicLibrary' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["loadWebAssemblyModule"]) Module["loadWebAssemblyModule"] = function() { abort("'loadWebAssemblyModule' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["getLEB"]) Module["getLEB"] = function() { abort("'getLEB' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["getFunctionTables"]) Module["getFunctionTables"] = function() { abort("'getFunctionTables' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["alignFunctionTables"]) Module["alignFunctionTables"] = function() { abort("'alignFunctionTables' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["registerFunctions"]) Module["registerFunctions"] = function() { abort("'registerFunctions' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["addFunction"]) Module["addFunction"] = function() { abort("'addFunction' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["removeFunction"]) Module["removeFunction"] = function() { abort("'removeFunction' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["getFuncWrapper"]) Module["getFuncWrapper"] = function() { abort("'getFuncWrapper' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["prettyPrint"]) Module["prettyPrint"] = function() { abort("'prettyPrint' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["makeBigInt"]) Module["makeBigInt"] = function() { abort("'makeBigInt' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["dynCall"]) Module["dynCall"] = function() { abort("'dynCall' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };
if (!Module["getCompilerSetting"]) Module["getCompilerSetting"] = function() { abort("'getCompilerSetting' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") };if (!Module["ALLOC_NORMAL"]) Object.defineProperty(Module, "ALLOC_NORMAL", { get: function() { abort("'ALLOC_NORMAL' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") } });
if (!Module["ALLOC_STACK"]) Object.defineProperty(Module, "ALLOC_STACK", { get: function() { abort("'ALLOC_STACK' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") } });
if (!Module["ALLOC_STATIC"]) Object.defineProperty(Module, "ALLOC_STATIC", { get: function() { abort("'ALLOC_STATIC' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") } });
if (!Module["ALLOC_DYNAMIC"]) Object.defineProperty(Module, "ALLOC_DYNAMIC", { get: function() { abort("'ALLOC_DYNAMIC' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") } });
if (!Module["ALLOC_NONE"]) Object.defineProperty(Module, "ALLOC_NONE", { get: function() { abort("'ALLOC_NONE' was not exported. add it to EXTRA_EXPORTED_RUNTIME_METHODS (see the FAQ)") } });

if (memoryInitializer) {
  if (!isDataURI(memoryInitializer)) {
    if (typeof Module['locateFile'] === 'function') {
      memoryInitializer = Module['locateFile'](memoryInitializer);
    } else if (Module['memoryInitializerPrefixURL']) {
      memoryInitializer = Module['memoryInitializerPrefixURL'] + memoryInitializer;
    }
  }
  if (ENVIRONMENT_IS_NODE || ENVIRONMENT_IS_SHELL) {
    var data = Module['readBinary'](memoryInitializer);
    HEAPU8.set(data, GLOBAL_BASE);
  } else {
    addRunDependency('memory initializer');
    var applyMemoryInitializer = function(data) {
      if (data.byteLength) data = new Uint8Array(data);
      for (var i = 0; i < data.length; i++) {
        assert(HEAPU8[GLOBAL_BASE + i] === 0, "area for memory initializer should not have been touched before it's loaded");
      }
      HEAPU8.set(data, GLOBAL_BASE);
      // Delete the typed array that contains the large blob of the memory initializer request response so that
      // we won't keep unnecessary memory lying around. However, keep the XHR object itself alive so that e.g.
      // its .status field can still be accessed later.
      if (Module['memoryInitializerRequest']) delete Module['memoryInitializerRequest'].response;
      removeRunDependency('memory initializer');
    }
    function doBrowserLoad() {
      Module['readAsync'](memoryInitializer, applyMemoryInitializer, function() {
        throw 'could not load memory initializer ' + memoryInitializer;
      });
    }
    if (Module['memoryInitializerRequest']) {
      // a network request has already been created, just use that
      function useRequest() {
        var request = Module['memoryInitializerRequest'];
        var response = request.response;
        if (request.status !== 200 && request.status !== 0) {
            // If you see this warning, the issue may be that you are using locateFile or memoryInitializerPrefixURL, and defining them in JS. That
            // means that the HTML file doesn't know about them, and when it tries to create the mem init request early, does it to the wrong place.
            // Look in your browser's devtools network console to see what's going on.
            console.warn('a problem seems to have happened with Module.memoryInitializerRequest, status: ' + request.status + ', retrying ' + memoryInitializer);
            doBrowserLoad();
            return;
        }
        applyMemoryInitializer(response);
      }
      if (Module['memoryInitializerRequest'].response) {
        setTimeout(useRequest, 0); // it's already here; but, apply it asynchronously
      } else {
        Module['memoryInitializerRequest'].addEventListener('load', useRequest); // wait for it
      }
    } else {
      // fetch it from the network ourselves
      doBrowserLoad();
    }
  }
}



/**
 * @constructor
 * @extends {Error}
 * @this {ExitStatus}
 */
function ExitStatus(status) {
  this.name = "ExitStatus";
  this.message = "Program terminated with exit(" + status + ")";
  this.status = status;
};
ExitStatus.prototype = new Error();
ExitStatus.prototype.constructor = ExitStatus;

var initialStackTop;
var calledMain = false;

dependenciesFulfilled = function runCaller() {
  // If run has never been called, and we should call run (INVOKE_RUN is true, and Module.noInitialRun is not false)
  if (!Module['calledRun']) run();
  if (!Module['calledRun']) dependenciesFulfilled = runCaller; // try this again later, after new deps are fulfilled
}





/** @type {function(Array=)} */
function run(args) {
  args = args || Module['arguments'];

  if (runDependencies > 0) {
    return;
  }

  writeStackCookie();

  preRun();

  if (runDependencies > 0) return; // a preRun added a dependency, run will be called later
  if (Module['calledRun']) return; // run may have just been called through dependencies being fulfilled just in this very frame

  function doRun() {
    if (Module['calledRun']) return; // run may have just been called while the async setStatus time below was happening
    Module['calledRun'] = true;

    if (ABORT) return;

    ensureInitRuntime();

    preMain();

    if (Module['onRuntimeInitialized']) Module['onRuntimeInitialized']();

    assert(!Module['_main'], 'compiled without a main, but one is present. if you added it from JS, use Module["onRuntimeInitialized"]');

    postRun();
  }

  if (Module['setStatus']) {
    Module['setStatus']('Running...');
    setTimeout(function() {
      setTimeout(function() {
        Module['setStatus']('');
      }, 1);
      doRun();
    }, 1);
  } else {
    doRun();
  }
  checkStackCookie();
}
Module['run'] = run;

function checkUnflushedContent() {
  // Compiler settings do not allow exiting the runtime, so flushing
  // the streams is not possible. but in ASSERTIONS mode we check
  // if there was something to flush, and if so tell the user they
  // should request that the runtime be exitable.
  // Normally we would not even include flush() at all, but in ASSERTIONS
  // builds we do so just for this check, and here we see if there is any
  // content to flush, that is, we check if there would have been
  // something a non-ASSERTIONS build would have not seen.
  // How we flush the streams depends on whether we are in NO_FILESYSTEM
  // mode (which has its own special function for this; otherwise, all
  // the code is inside libc)
  var print = Module['print'];
  var printErr = Module['printErr'];
  var has = false;
  Module['print'] = Module['printErr'] = function(x) {
    has = true;
  }
  try { // it doesn't matter if it fails
    var flush = flush_NO_FILESYSTEM;
    if (flush) flush(0);
  } catch(e) {}
  Module['print'] = print;
  Module['printErr'] = printErr;
  if (has) {
    warnOnce('stdio streams had content in them that was not flushed. you should set NO_EXIT_RUNTIME to 0 (see the FAQ), or make sure to emit a newline when you printf etc.');
  }
}

function exit(status, implicit) {
  checkUnflushedContent();

  // if this is just main exit-ing implicitly, and the status is 0, then we
  // don't need to do anything here and can just leave. if the status is
  // non-zero, though, then we need to report it.
  // (we may have warned about this earlier, if a situation justifies doing so)
  if (implicit && Module['noExitRuntime'] && status === 0) {
    return;
  }

  if (Module['noExitRuntime']) {
    // if exit() was called, we may warn the user if the runtime isn't actually being shut down
    if (!implicit) {
      Module.printErr('exit(' + status + ') called, but NO_EXIT_RUNTIME is set, so halting execution but not exiting the runtime or preventing further async execution (build with NO_EXIT_RUNTIME=0, if you want a true shutdown)');
    }
  } else {

    ABORT = true;
    EXITSTATUS = status;
    STACKTOP = initialStackTop;

    exitRuntime();

    if (Module['onExit']) Module['onExit'](status);
  }

  if (ENVIRONMENT_IS_NODE) {
    process['exit'](status);
  }
  Module['quit'](status, new ExitStatus(status));
}
Module['exit'] = exit;

var abortDecorators = [];

function abort(what) {
  if (Module['onAbort']) {
    Module['onAbort'](what);
  }

  if (what !== undefined) {
    Module.print(what);
    Module.printErr(what);
    what = JSON.stringify(what)
  } else {
    what = '';
  }

  ABORT = true;
  EXITSTATUS = 1;

  var extra = '';
  var output = 'abort(' + what + ') at ' + stackTrace() + extra;
  if (abortDecorators) {
    abortDecorators.forEach(function(decorator) {
      output = decorator(output, what);
    });
  }
  throw output;
}
Module['abort'] = abort;

// {{PRE_RUN_ADDITIONS}}

if (Module['preInit']) {
  if (typeof Module['preInit'] == 'function') Module['preInit'] = [Module['preInit']];
  while (Module['preInit'].length > 0) {
    Module['preInit'].pop()();
  }
}


Module["noExitRuntime"] = true;

run();

// {{POST_RUN_ADDITIONS}}





// {{MODULE_ADDITIONS}}



//# sourceMappingURL=firmware.js.map