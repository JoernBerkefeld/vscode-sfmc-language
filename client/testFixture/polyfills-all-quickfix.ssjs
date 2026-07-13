// =============================================================================
// F5 test fixture - ALL SSJS polyfills as inserted by the quickfix
// -----------------------------------------------------------------------------
// One block per POLYFILLABLE_METHODS entry in ssjs-data, emitted exactly as the
// LSP quickfix inserts it (verbatim polyfill source + blank line).
// Regenerate: node scripts/gen-polyfill-fixture.mjs
// =============================================================================

Platform.Load("Core", "1.1.5");

/**
 * Polyfill for Array.prototype.copyWithin (SFMC SSJS).
 * @param {number} targetIndex - index to copy the sequence to
 * @param {number} [startIndex] - index to start copying from
 * @param {number} [count] - number of elements to copy
 * @returns {Array} the modified array
 */
Array.prototype.copyWithin = Array.prototype.copyWithin || function (targetIndex, startIndex, count) {
    var n = count || 1;
    for (var i = 0; i < n; i++) {
        this[targetIndex + i] = this[startIndex + i];
    }
    return this;
};

/**
 * Polyfill for Array.prototype.entries (SFMC SSJS).
 * @returns {object} an iterator of [index, value] pairs
 */
Array.prototype.entries = Array.prototype.entries || function () {
    var index = 0;
    var arr = this;
    return {
        next: function () {
            if (index < arr.length) {
                return { value: [index, arr[index++]], done: false };
            }
            return { done: true };
        }
    };
};

/**
 * Polyfill for Array.prototype.fill (SFMC SSJS).
 * @param {*} value - value to fill the array with
 * @param {number} [startIndex] - index to start filling at (default 0)
 * @param {number} [endIndex] - index to stop filling at (default array length)
 * @returns {Array} the modified array
 */
Array.prototype.fill = Array.prototype.fill || function (value, startIndex, endIndex) {
    var start = startIndex || 0;
    var end = (!endIndex || endIndex > this.length) ? this.length : endIndex;
    for (var i = start; i < end; i++) {
        this[i] = value;
    }
    return this;
};

/**
 * Polyfill for Array.prototype.filter (SFMC SSJS).
 * @param {Function} predicate - test called with (element, index, array)
 * @returns {Array} a new array of elements that passed the test
 */
Array.prototype.filter = Array.prototype.filter || function (predicate) {
    if (typeof predicate !== 'function') { return []; }
    var result = [];
    for (var i = 0; i < this.length; i++) {
        if (predicate(this[i], i, this)) { result.push(this[i]); }
    }
    return result;
};

/**
 * Polyfill for Array.prototype.find (SFMC SSJS).
 * @param {Function} predicate - test called with (element, index, array)
 * @returns {*} the first matching element, or undefined
 */
Array.prototype.find = Array.prototype.find || function (predicate) {
    if (typeof predicate !== 'function') { return undefined; }
    for (var i = 0; i < this.length; i++) {
        if (predicate(this[i], i, this)) { return this[i]; }
    }
    return undefined;
};

/**
 * Polyfill for Array.prototype.findIndex (SFMC SSJS).
 * @param {Function} predicate - test called with (element, index, array)
 * @returns {number} the index of the first match, or -1
 */
Array.prototype.findIndex = Array.prototype.findIndex || function (predicate) {
    if (typeof predicate !== 'function') { return -1; }
    for (var i = 0; i < this.length; i++) {
        if (predicate(this[i], i, this)) { return i; }
    }
    return -1;
};

/**
 * Polyfill for Array.prototype.forEach (SFMC SSJS).
 * @param {Function} callback - called with (element, index, array)
 * @returns {void}
 */
Array.prototype.forEach = Array.prototype.forEach || function (callback) {
    if (typeof callback !== 'function') { return; }
    for (var i = 0; i < this.length; i++) {
        callback(this[i], i, this);
    }
};

/**
 * Polyfill for Array.prototype.includes (SFMC SSJS).
 * @param {*} searchValue - value to search for
 * @returns {boolean} true when the value is found
 */
Array.prototype.includes = Array.prototype.includes || function (searchValue) {
    for (var i = 0; i < this.length; i++) {
        if (this[i] === searchValue) { return true; }
    }
    return false;
};

/**
 * Polyfill for Array.prototype.indexOf (SFMC SSJS).
 * @param {*} searchValue - value to search for
 * @param {number} [fromIndex] - index to start searching from (default 0)
 * @returns {number} the first matching index, or -1
 */
Array.prototype.indexOf = Array.prototype.indexOf || function (searchValue, fromIndex) {
    var start = fromIndex || 0;
    for (var i = start; i < this.length; i++) {
        if (this[i] === searchValue) { return i; }
    }
    return -1;
};

/**
 * Polyfill for Array.prototype.lastIndexOf (SFMC SSJS).
 * @param {*} searchValue - value to search for
 * @param {number} [fromIndex] - index to start searching backwards from (default last index)
 * @returns {number} the last matching index, or -1
 */
Array.prototype.lastIndexOf = function (searchValue, fromIndex) {
    var start = (fromIndex !== undefined) ? fromIndex : this.length - 1;
    for (var i = start; i >= 0; i--) {
        if (this[i] === searchValue) { return i; }
    }
    return -1;
};

/**
 * Polyfill for Array.prototype.map (SFMC SSJS).
 * @param {Function} callback - called with (element, index, array); its return value becomes the new element
 * @returns {Array} a new array of the callback results
 */
Array.prototype.map = Array.prototype.map || function (callback) {
    if (typeof callback !== 'function') { return []; }
    var result = [];
    for (var i = 0; i < this.length; i++) {
        result.push(callback(this[i], i, this));
    }
    return result;
};

/**
 * Polyfill for Array.prototype.reduce (SFMC SSJS).
 * @param {Function} callback - called with (accumulator, element, index, array)
 * @param {*} [initialValue] - initial accumulator value; defaults to the first element
 * @returns {*} the final accumulated value
 */
Array.prototype.reduce = Array.prototype.reduce || function (callback, initialValue) {
    if (typeof callback !== 'function') { return initialValue; }
    var accumulator = (arguments.length > 1) ? initialValue : this[0];
    var startIndex = (arguments.length > 1) ? 0 : 1;
    for (var i = startIndex; i < this.length; i++) {
        accumulator = callback(accumulator, this[i], i, this);
    }
    return accumulator;
};

/**
 * Polyfill for Array.prototype.reduceRight (SFMC SSJS).
 * @param {Function} callback - called with (accumulator, element, index, array), iterating right to left
 * @param {*} [initialValue] - initial accumulator value; defaults to the last element
 * @returns {*} the final accumulated value
 */
Array.prototype.reduceRight = Array.prototype.reduceRight || function (callback, initialValue) {
    if (typeof callback !== 'function') { return initialValue; }
    var accumulator = (arguments.length > 1) ? initialValue : this[this.length - 1];
    var startIndex = (arguments.length > 1) ? this.length - 1 : this.length - 2;
    for (var i = startIndex; i >= 0; i--) {
        accumulator = callback(accumulator, this[i], i, this);
    }
    return accumulator;
};

/**
 * Polyfill for Array.prototype.some (SFMC SSJS).
 * @param {Function} predicate - test called with (element, index, array)
 * @returns {boolean} true when the predicate passes for any element
 */
Array.prototype.some = Array.prototype.some || function (predicate) {
    if (typeof predicate !== 'function') { return false; }
    for (var i = 0; i < this.length; i++) {
        if (predicate(this[i], i, this)) { return true; }
    }
    return false;
};

/**
 * Polyfill for Array.prototype.every (SFMC SSJS).
 * @param {Function} predicate - test called with (element, index, array)
 * @returns {boolean} true when the predicate passes for every element
 */
Array.prototype.every = Array.prototype.every || function (predicate) {
    if (typeof predicate !== 'function') { return true; }
    for (var i = 0; i < this.length; i++) {
        if (!predicate(this[i], i, this)) { return false; }
    }
    return true;
};

/**
 * Polyfill for Array.prototype.splice (SFMC SSJS).
 * @param {number} start - index at which to start changing the array
 * @param {number} [deleteCount] - number of elements to remove (default: all from start)
 * @param {...*} [items] - elements to insert at start
 * @returns {Array} an array of the removed elements
 */
Array.prototype.splice = function (start, deleteCount) {
    var arr = this;
    var len = arr.length;
    start = start < 0 ? (len + start < 0 ? 0 : len + start) : (start > len ? len : start);
    var removeCount = arguments.length < 2 ? len - start : (deleteCount < 0 ? 0 : deleteCount);
    if (removeCount > len - start) { removeCount = len - start; }
    var endIndex = start + removeCount;
    var before = [];
    var removed = [];
    var after = [];
    for (var i = 0; i < len; i++) {
        if (i < start) { before.push(arr[i]); }
        else if (i < endIndex) { removed.push(arr[i]); }
        else { after.push(arr[i]); }
    }
    for (var j = 2; j < arguments.length; j++) {
        before.push(arguments[j]);
    }
    var merged = before.concat(after);
    var maxLen = arr.length > merged.length ? arr.length : merged.length;
    for (var k = 0; k < maxLen; k++) {
        if (k < merged.length) { arr[k] = merged[k]; }
        else { arr.pop(); }
    }
    return removed;
};

/**
 * Polyfill for String.prototype.trim (SFMC SSJS).
 * @returns {string} the string with leading and trailing whitespace removed
 */
String.prototype.trim = String.prototype.trim || function () {
    return this.replace(/^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g, '');
};

/**
 * Polyfill for String.prototype.startsWith (SFMC SSJS).
 * @param {string} searchString - characters to search for at the start
 * @param {number} [position] - position to start searching from (default 0)
 * @returns {boolean} true when the string starts with searchString
 */
String.prototype.startsWith = String.prototype.startsWith || function (searchString, position) {
    position = position || 0;
    return this.indexOf(searchString, position) === position;
};

/**
 * Polyfill for String.prototype.endsWith (SFMC SSJS).
 * @param {string} searchString - characters to search for at the end
 * @param {number} [endPosition] - position treated as the end of the string (default string length)
 * @returns {boolean} true when the string ends with searchString
 */
String.prototype.endsWith = String.prototype.endsWith || function (searchString, endPosition) {
    var str = String(this);
    var search = String(searchString);
    if (search.length === 0) { return true; }
    var strLen = str.length;
    var end = (endPosition === undefined || endPosition > strLen) ? strLen : Number(endPosition);
    if (end < 0) { end = 0; }
    var start = end - search.length;
    if (start < 0) { return false; }
    return str.substring(start, end) === search;
};

/**
 * Standalone replacement for the sealed Function.prototype bind method (SFMC SSJS).
 * @param {Function} fn - the function to bind
 * @param {*} thisArg - the value to use as `this` when calling fn
 * @param {...*} [preArgs] - arguments to prepend to every call
 * @returns {Function} a new function with `this` and leading arguments pre-bound
 */
function bindFn(fn, thisArg) {
    var preArgs = [];
    for (var i = 2; i < arguments.length; i++) { preArgs.push(arguments[i]); }
    return function () {
        var callArgs = [];
        for (var a = 0; a < preArgs.length; a++) { callArgs.push(preArgs[a]); }
        for (var b = 0; b < arguments.length; b++) { callArgs.push(arguments[b]); }
        return fn.apply(thisArg, callArgs);
    };
}

/**
 * Polyfill for Object.getPrototypeOf (SFMC SSJS).
 * @param {object} obj - the object whose prototype to return
 * @returns {object|null} the prototype, or null
 */
Object.getPrototypeOf = function (obj) {
    if (obj === null || obj === undefined) { return null; }
    return obj.constructor ? obj.constructor.prototype : null;
};

/**
 * Polyfill for Array.isArray (SFMC SSJS).
 * @param {*} value - the value to test
 * @returns {boolean} true when the value is an Array
 */
Array.isArray = Array.isArray || function (value) {
    return Object.prototype.toString.call(value) === '[object Array]';
};

/**
 * Polyfill for Array.of (SFMC SSJS).
 * @param {...*} [items] - elements to place in the new array
 * @returns {Array} a new array containing the arguments
 */
Array.of = Array.of || function () {
    var result = [];
    for (var i = 0; i < arguments.length; i++) {
        result.push(arguments[i]);
    }
    return result;
};

/**
 * Polyfill for String.prototype.substr (SFMC SSJS).
 * @param {number} start - index to start extracting from (negative counts from the end)
 * @param {number} [length] - number of characters to extract (default: to the end)
 * @returns {string} the extracted substring
 */
String.prototype.substr = String.prototype.substr || function (start, length) {
    var len = this.length;
    var from = start < 0 ? Math.max(len + start, 0) : Math.min(start, len);
    var to = length === undefined ? len : from + (length < 0 ? 0 : length);
    return this.substring(from, to);
};

/**
 * Polyfill for Array.prototype.slice (SFMC SSJS).
 * @param {number} [start] - index to start extracting from (default 0; negative counts from the end)
 * @param {number} [end] - index to stop before (default array length; negative counts from the end)
 * @returns {Array} a new array with the extracted elements
 */
Array.prototype.slice = function (start, end) {
    var len = this.length;
    var s = (start === undefined) ? 0 : Number(start);
    var e = (end === undefined) ? len : Number(end);
    if (s !== s) { s = 0; }
    if (e !== e) { e = 0; }
    if (s < 0) { s = len + s; if (s < 0) { s = 0; } } else if (s > len) { s = len; }
    if (e < 0) { e = len + e; if (e < 0) { e = 0; } } else if (e > len) { e = len; }
    var out = [];
    for (var i = s; i < e; i++) { out.push(this[i]); }
    return out;
};

/**
 * Polyfill for Array.prototype.sort (SFMC SSJS).
 * @param {Function} [compareFn] - comparator returning <0, 0, or >0; defaults to lexicographic order
 * @returns {Array} the array sorted in place
 */
Array.prototype.sort = function (compareFn) {
    var cmp = (typeof compareFn === 'function')
        ? compareFn
        : function (a, b) {
            var sa = String(a);
            var sb = String(b);
            return sa < sb ? -1 : (sa > sb ? 1 : 0);
        };
    var len = this.length;
    for (var i = 1; i < len; i++) {
        var current = this[i];
        var j = i - 1;
        while (j >= 0 && cmp(this[j], current) > 0) {
            this[j + 1] = this[j];
            j--;
        }
        this[j + 1] = current;
    }
    return this;
};

/**
 * Polyfill for String.prototype.search (SFMC SSJS).
 * @param {RegExp} regexp - the pattern to search for
 * @returns {number} the index of the first match, or -1
 */
String.prototype.search = function (regexp) {
    var str = "" + this;
    var m = str.match(regexp);
    if (m === null || m.length === 0) { return -1; }
    return str.indexOf(m[0]);
};

/**
 * Polyfill for String.prototype.split (SFMC SSJS) — fixes the empty-string separator.
 * @param {string|RegExp} separator - the separator to split on
 * @param {number} [limit] - maximum number of splits to include
 * @returns {Array} the array of substrings
 */
String.prototype.split = (function () {
    var nativeSplit = String.prototype.split;
    return function (separator, limit) {
        var str = String(this);
        if (separator === '') {
            var out = [];
            for (var i = 0; i < str.length; i++) {
                if (limit !== undefined && out.length >= limit) { break; }
                out.push(str.charAt(i));
            }
            return out;
        }
        if (limit === undefined) { return nativeSplit.call(str, separator); }
        return nativeSplit.call(str, separator, limit);
    };
})();

/**
 * Polyfill for Math.max (SFMC SSJS) — handles any argument count.
 * @param {...number} [values] - numbers to compare
 * @returns {number} the largest value, or NaN if any value is NaN
 */
Math.max = function () {
    if (arguments.length === 0) { return Number.NEGATIVE_INFINITY; }
    var best = Number(arguments[0]);
    if (best !== best) { return NaN; }
    for (var i = 1; i < arguments.length; i++) {
        var v = Number(arguments[i]);
        if (v !== v) { return NaN; }
        if (v > best) { best = v; }
    }
    return best;
};

/**
 * Polyfill for Math.min (SFMC SSJS) — handles any argument count.
 * @param {...number} [values] - numbers to compare
 * @returns {number} the smallest value, or NaN if any value is NaN
 */
Math.min = function () {
    if (arguments.length === 0) { return Number.POSITIVE_INFINITY; }
    var best = Number(arguments[0]);
    if (best !== best) { return NaN; }
    for (var i = 1; i < arguments.length; i++) {
        var v = Number(arguments[i]);
        if (v !== v) { return NaN; }
        if (v < best) { best = v; }
    }
    return best;
};
