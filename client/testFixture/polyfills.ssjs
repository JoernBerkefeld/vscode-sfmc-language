// SFMC SSJS Polyfill Bundle — add only what you need
/** @param {Function} cb - called with (element, index, array) @returns {void} */
Array.prototype.forEach   = Array.prototype.forEach   || function(cb) { if (typeof cb!=='function') return; for (var i=0;i<this.length;i++) cb(this[i],i,this); };
/** @param {Function} cb - called with (element, index, array); its return value becomes the new element @returns {Array} a new array of the results */
Array.prototype.map       = Array.prototype.map       || function(cb) { if (typeof cb!=='function') return []; var r=[]; for (var i=0;i<this.length;i++) r.push(cb(this[i],i,this)); return r; };
/** @param {Function} cb - test called with (element, index, array) @returns {Array} a new array of elements that passed the test */
Array.prototype.filter    = Array.prototype.filter    || function(cb) { if (typeof cb!=='function') return []; var r=[]; for (var i=0;i<this.length;i++) if (cb(this[i],i,this)) r.push(this[i]); return r; };
/** @param {Function} cb - test called with (element, index, array) @returns {*} the first matching element, or undefined */
Array.prototype.find      = Array.prototype.find      || function(cb) { if (typeof cb!=='function') return; for (var i=0;i<this.length;i++) if (cb(this[i],i,this)) return this[i]; };
/** @param {Function} cb - test called with (element, index, array) @returns {number} the index of the first match, or -1 */
Array.prototype.findIndex = Array.prototype.findIndex || function(cb) { if (typeof cb!=='function') return -1; for (var i=0;i<this.length;i++) if (cb(this[i],i,this)) return i; return -1; };
/** @param {*} v - value to search for @param {number} [f] - index to start searching from (default 0) @returns {number} the first matching index, or -1 */
Array.prototype.indexOf   = Array.prototype.indexOf   || function(v,f) { for (var i=f||0;i<this.length;i++) if (this[i]===v) return i; return -1; };
/** @param {*} v - value to search for @returns {boolean} true when the value is found */
Array.prototype.includes  = Array.prototype.includes  || function(v) { for (var i=0;i<this.length;i++) if (this[i]===v) return true; return false; };
/** @param {Function} cb - test called with (element, index, array) @returns {boolean} true when the predicate passes for any element */
Array.prototype.some      = Array.prototype.some      || function(cb) { if (typeof cb!=='function') return false; for (var i=0;i<this.length;i++) if (cb(this[i],i,this)) return true; return false; };
/** @param {Function} cb - test called with (element, index, array) @returns {boolean} true when the predicate passes for every element */
Array.prototype.every     = Array.prototype.every     || function(cb) { if (typeof cb!=='function') return true; for (var i=0;i<this.length;i++) if (!cb(this[i],i,this)) return false; return true; };
/** @param {Function} cb - called with (accumulator, element, index, array) @param {*} [init] - initial accumulator value; defaults to the first element @returns {*} the final accumulated value */
Array.prototype.reduce    = Array.prototype.reduce    || function(cb,init) { if (typeof cb!=='function') return init; var acc=(arguments.length>1)?init:this[0]; var s=(arguments.length>1)?0:1; for (var i=s;i<this.length;i++) acc=cb(acc,this[i],i,this); return acc; };
/** @param {Function} cb - called with (accumulator, element, index, array), iterating right to left @param {*} [init] - initial accumulator value; defaults to the last element @returns {*} the final accumulated value */
Array.prototype.reduceRight = Array.prototype.reduceRight || function(cb,init) { if (typeof cb!=='function') return init; var acc=(arguments.length>1)?init:this[this.length-1]; var s=(arguments.length>1)?this.length-1:this.length-2; for (var i=s;i>=0;i--) acc=cb(acc,this[i],i,this); return acc; };
/** @param {*} v - value to search for @param {number} [f] - index to start searching backwards from (default last index) @returns {number} the last matching index, or -1 */
Array.prototype.lastIndexOf = function(v,f) { var s=(f!==undefined)?f:this.length-1; for (var i=s;i>=0;i--) if (this[i]===v) return i; return -1; }; // broken native — always override
/** @param {number} start - index at which to start changing the array @param {number} [deleteCount] - number of elements to remove (default: all from start) @param {...*} [items] - elements to insert at start @returns {Array} an array of the removed elements */
Array.prototype.splice    = function(start,deleteCount) { var arr=this; var len=arr.length; start=start<0?(len+start<0?0:len+start):(start>len?len:start); var removeCount=arguments.length<2?len-start:(deleteCount<0?0:deleteCount); if (removeCount>len-start) removeCount=len-start; var endIndex=start+removeCount; var before=[]; var removed=[]; var after=[]; for (var i=0;i<len;i++){ if (i<start) before.push(arr[i]); else if (i<endIndex) removed.push(arr[i]); else after.push(arr[i]); } for (var j=2;j<arguments.length;j++) before.push(arguments[j]); var merged=before.concat(after); var maxLen=arr.length>merged.length?arr.length:merged.length; for (var k=0;k<maxLen;k++){ if (k<merged.length) arr[k]=merged[k]; else arr.pop(); } return removed; }; // broken (insert form) — override only if you insert items
/** @param {number} [start] - index to start extracting from (default 0; negative counts from the end) @param {number} [end] - index to stop before (default array length; negative counts from the end) @returns {Array} a new array with the extracted elements */
Array.prototype.slice     = function(start,end) { var len=this.length; var s=(start===undefined)?0:Number(start); var e=(end===undefined)?len:Number(end); if (s!==s) s=0; if (e!==e) e=0; if (s<0){s=len+s; if (s<0) s=0;} else if (s>len) s=len; if (e<0){e=len+e; if (e<0) e=0;} else if (e>len) e=len; var out=[]; for (var i=s;i<e;i++) out.push(this[i]); return out; }; // broken native — always override
/** @param {Function} [compareFn] - comparator returning <0, 0, or >0; defaults to lexicographic order @returns {Array} the array sorted in place */
Array.prototype.sort      = function(compareFn) { var cmp=(typeof compareFn==='function')?compareFn:function(a,b){var sa=String(a),sb=String(b);return sa<sb?-1:(sa>sb?1:0);}; var len=this.length; for (var i=1;i<len;i++){var current=this[i];var j=i-1;while (j>=0&&cmp(this[j],current)>0){this[j+1]=this[j];j--;}this[j+1]=current;} return this; }; // broken native — always override
/** @param {*} v - value to fill the array with @param {number} [s] - index to start filling at (default 0) @param {number} [e] - index to stop filling at (default array length) @returns {Array} the modified array */
Array.prototype.fill      = Array.prototype.fill      || function(v,s,e) { var start=s||0; var end=(!e||e>this.length)?this.length:e; for (var i=start;i<end;i++) this[i]=v; return this; };
/** @param {number} t - index to copy the sequence to @param {number} [s] - index to start copying from @param {number} [c] - number of elements to copy @returns {Array} the modified array */
Array.prototype.copyWithin = Array.prototype.copyWithin || function(t,s,c) { var n=c||1; for (var i=0;i<n;i++) this[t+i]=this[s+i]; return this; };
/** @returns {object} an iterator of [index, value] pairs */
Array.prototype.entries   = Array.prototype.entries   || function() { var idx=0; var a=this; return { next: function() { return idx<a.length ? {value:[idx,a[idx++]],done:false} : {done:true}; } }; };
/** @returns {string} the string with leading and trailing whitespace removed */
String.prototype.trim     = String.prototype.trim     || function() { return this.replace(/^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g,''); };
/** @param {string} s - characters to search for at the start @param {number} [p] - position to start searching from (default 0) @returns {boolean} true when the string starts with s */
String.prototype.startsWith = String.prototype.startsWith || function(s,p) { p=p||0; return this.indexOf(s,p)===p; };
/** @param {string} searchString - characters to search for at the end @param {number} [endPosition] - position treated as the end of the string (default string length) @returns {boolean} true when the string ends with searchString */
String.prototype.endsWith   = String.prototype.endsWith   || function(searchString,endPosition) { var str=String(this); var search=String(searchString); if (search.length===0) return true; var strLen=str.length; var end=(endPosition===undefined||endPosition>strLen)?strLen:Number(endPosition); if (end<0) end=0; var start=end-search.length; if (start<0) return false; return str.substring(start,end)===search; };
/** @param {number} start - index to start extracting from (negative counts from the end) @param {number} [length] - number of characters to extract (default: to the end) @returns {string} the extracted substring */
String.prototype.substr   = function(start,length) { var len=this.length; var from=start<0?Math.max(len+start,0):Math.min(start,len); var to=length===undefined?len:from+(length<0?0:length); return this.substring(from,to); }; // broken native — always override
/** @param {RegExp} regexp - the pattern to search for @returns {number} the index of the first match, or -1 */
String.prototype.search   = function(regexp) { var str=""+this; var m=str.match(regexp); if (m===null||m.length===0) return -1; return str.indexOf(m[0]); }; // broken native — always override
/** @param {string|RegExp} separator - the separator to split on @param {number} [limit] - maximum number of splits to include @returns {Array} the array of substrings */
String.prototype.split    = (function(){ var nativeSplit=String.prototype.split; return function(separator,limit){ var str=String(this); if (separator===''){ var out=[]; for (var i=0;i<str.length;i++){ if (limit!==undefined&&out.length>=limit) break; out.push(str.charAt(i)); } return out; } if (limit===undefined) return nativeSplit.call(str,separator); return nativeSplit.call(str,separator,limit); }; })(); // broken native — always override
/** @param {...number} [values] - numbers to compare @returns {number} the largest value, or NaN if any value is NaN */
Math.max = function() { if (arguments.length===0) return Number.NEGATIVE_INFINITY; var best=Number(arguments[0]); if (best!==best) return NaN; for (var i=1;i<arguments.length;i++){var v=Number(arguments[i]); if (v!==v) return NaN; if (v>best) best=v;} return best; }; // broken native — always override
/** @param {...number} [values] - numbers to compare @returns {number} the smallest value, or NaN if any value is NaN */
Math.min = function() { if (arguments.length===0) return Number.POSITIVE_INFINITY; var best=Number(arguments[0]); if (best!==best) return NaN; for (var i=1;i<arguments.length;i++){var v=Number(arguments[i]); if (v!==v) return NaN; if (v<best) best=v;} return best; }; // broken native — always override
/** @param {object} obj - the object whose prototype to return @returns {object|null} the prototype, or null */
Object.getPrototypeOf = function(obj) { if (obj===null||obj===undefined) return null; return obj.constructor ? obj.constructor.prototype : null; }; // broken native — always override
/** @param {*} v - the value to test @returns {boolean} true when the value is an Array */
Array.isArray = Array.isArray || function(v) { return Object.prototype.toString.call(v)==='[object Array]'; };
/** @param {...*} [items] - elements to place in the new array @returns {Array} a new array containing the arguments */
Array.of = Array.of || function() { var r=[]; for (var i=0;i<arguments.length;i++) r.push(arguments[i]); return r; };
// Function.prototype.bind is unavailable AND the prototype is sealed — use this standalone helper instead:
/** @param {Function} fn - the function to bind @param {*} thisArg - the value to use as `this` when calling fn @param {...*} [preArgs] - arguments to prepend to every call @returns {Function} a new function with `this` and leading arguments pre-bound */
function bindFn(fn,thisArg) { var preArgs=[]; for (var i=2;i<arguments.length;i++) preArgs.push(arguments[i]); return function() { var callArgs=[]; for (var a=0;a<preArgs.length;a++) callArgs.push(preArgs[a]); for (var b=0;b<arguments.length;b++) callArgs.push(arguments[b]); return fn.apply(thisArg,callArgs); }; }
