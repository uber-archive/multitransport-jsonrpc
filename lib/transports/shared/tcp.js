// Take a JSON object and transform it into a [Pascal string](http://en.wikipedia.org/wiki/String_%28computer_science%29#Length-prefixed) stored in a buffer.
// The length prefix is big-endian because DEATH TO THE LITTLE ENDIAN LILLIPUTIANS!
function formatMessage(obj, eventEmitter) {
    var str = JSON.stringify(obj);
    var strlen = Buffer.byteLength(str);
    if(eventEmitter) eventEmitter.emit('outMessage', obj, strlen);
    var buf = new Buffer(4 + strlen);
    buf.writeUInt32BE(strlen, 0);
    buf.write(str, 4, strlen, 'utf8');
    return buf;
}

// Since all messages start with a length prefix and the "current" message is the first in the buffers array,
// we can determine the message length just by the first buffer in the array. This technically assumes that
// a buffer is at least 4 bytes large, but that should be a safe assumption.
function getMessageLen(buffers) {
    if(buffers[0] && buffers[0].length >= 4) {
        return buffers[0].readUInt32BE(0);
    } else {
        return 0;
    }
}

// Simple helper function that returns the minimum value from all values passed into it
function min() {
    return Array.prototype.reduce.call(arguments, function(curr, val) {
        return (val < curr) ? val : curr;
    }, Infinity);
}

// Given an array of buffers, the message length, and the eventEmitter object (in case of error)
// try to parse the message and return the object it contains
function parseBuffer(buffers, messageLen, eventEmitter) {

    // Allocate a new buffer the size of the message to copy the buffers into
    // and keep track of how many bytes have been copied and what buffer we're currently on
    var buf = new Buffer(messageLen);
    var bytesCopied = 0;
    var currBuffer = 0;

    // Continue copying until we've hit the message size
    while (bytesCopied < messageLen) {

        // bytesToCopy contains how much of the buffer we'll copy, either the
        // "whole thing" or "the rest of the message".
        var bytesToCopy = 0;

        // Since the first buffer contains the message length itself, it's special-cased
        // to skip those 4 bytes
        if (currBuffer === 0) {
            bytesToCopy = min(messageLen, buffers[0].length-4);
            buffers[0].copy(buf, bytesCopied, 4, bytesToCopy+4);
        } else {
            bytesToCopy = min(messageLen-bytesCopied, buffers[currBuffer].length);
            buffers[currBuffer].copy(buf, bytesCopied, 0, bytesToCopy);
        }

        // Increment the number of bytes copied by how many were copied
        bytesCopied += bytesToCopy;

        // If we're done, we have some cleanup to do; either appending the final chunk of the buffer
        // to the next buffer, or making sure that the array slice after the while loop is done
        // appropriately
        if (bytesCopied === messageLen) {
            if(currBuffer === 0) bytesToCopy += 4;
            if(buffers[currBuffer].length !== bytesToCopy) {
                buffers[currBuffer] = buffers[currBuffer].slice(bytesToCopy);
                if (buffers[currBuffer].length < 4 && buffers[currBuffer+1]) {
                    buffers[currBuffer+1] = Buffer.concat([buffers[currBuffer], buffers[currBuffer+1]]);
                } else {
                    currBuffer--; // Counter the increment below
                }
            }
        }

        // Move on to the next buffer in the array
        currBuffer++;
    }

    // Trim the buffers array to the next message
    buffers = buffers.slice(currBuffer);

    // Parse the buffer we created into a string and then a JSON object, or emit the parsing error
    var obj;
    try {
        obj = JSON.parse(buf.toString());
    } catch (e) {
        eventEmitter.emit('babel', buf.toString());
        eventEmitter.emit('error', e);
    }
    return [buffers, obj];
}


function createDataHandler(self, callback) {
    var buffers = [], bufferLen = 0, messageLen = 0;
    return function dataHandler(data) {
        if(!data) { return; } // Should we emit some sort of error here?
        if(buffers[buffers.length-1] && buffers[buffers.length-1].length < 4) {
            buffers[buffers.length-1] = Buffer.concat([buffers[buffers.length-1], data], buffers[buffers.length-1].length + data.length);
        } else {
            buffers.push(data);
        }
        bufferLen += data.length;
        if(!messageLen) messageLen = getMessageLen(buffers);
        if(bufferLen - 4 >= messageLen) {
            var result, obj;
            while (messageLen && bufferLen - 4 >= messageLen && (result = parseBuffer(buffers, messageLen, self))) {
                buffers = result[0];
                obj = result[1];
                self.emit('message', obj, messageLen);
                try {
                    callback(obj);
                } catch(e) {
                    /* jshint loopfunc: true */
                    process.nextTick(function() { throw e; });
                }
                bufferLen = bufferLen - (messageLen + 4);
                messageLen = getMessageLen(buffers);
            }
        }
    };
}

// Export the public methods
module.exports.formatMessage = formatMessage;
module.exports.getMessageLen = getMessageLen;
module.exports.parseBuffer = parseBuffer;
module.exports.createDataHandler = createDataHandler;
