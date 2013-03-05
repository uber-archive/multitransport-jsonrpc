function formatMessage(obj) {
    var str = JSON.stringify(obj);
    return Buffer.byteLength(str) + '\0' + str + '\0';
}

function containsCompleteMessage(str) {
    return str.split('\0').length > 2;
}

function parseBuffer(buffer, eventEmitter) {
    var nullSpot = buffer.indexOf('\0');
    if (nullSpot !== -1) {
        var messageSizeStr = buffer.toString('utf8', 0, nullSpot);
        var messageSizePrefixBytes = Buffer.byteLength(messageSizeStr);
        var messageSize = Number(messageSizeStr);
        if (isNaN(messageSize) || messageSize < 0) {
            eventEmitter.emit('error', new Error('Invalid message format: Not a valid message length: "' + messageSizeStr + '"'));
            return parseBuffer(buffer.slice(nullSpot + 1), eventEmitter);
        }
        var totalMessageLength = 2 + messageSizePrefixBytes + messageSize;
        if (buffer[totalMessageLength - 1] === undefined) {
            // Return when we do not have the full contents of the message in the buffer
            return;
        } else if (buffer[totalMessageLength - 1] !== 0) {
            // There is no message delimiter where we expect one - we assume the buffer is
            // corrupt and try to recover by advancing to the next delimiter
            eventEmitter.emit('error', new Error('Invalid message format: No message delimiter as position ' + (totalMessageLength - 1) + ' for message "' + messageSizeStr + '"'));
            return parseBuffer(buffer.slice(nullSpot + 1), eventEmitter);
        }
        var message = buffer.toString('utf8', messageSizePrefixBytes + 1, messageSizePrefixBytes + 1 + messageSize);
        buffer = buffer.slice(totalMessageLength);
        var obj;
        try {
            obj = JSON.parse(message);
        } catch(e) {
            eventEmitter.emit('error', e);
        }
        return [buffer, obj];
    }
}

module.exports.formatMessage = formatMessage;
module.exports.parseBuffer = parseBuffer;
module.exports.containsCompleteMessage = containsCompleteMessage;
