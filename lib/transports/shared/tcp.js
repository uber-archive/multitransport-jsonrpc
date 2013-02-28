function formatMessage(obj) {
    var str = JSON.stringify(obj);
    return Buffer.byteLength(str) + '\0' + str + '\0';
}

function containsCompleteMessage(str) {
    return str.split('\0').length > 2;
}

function parseBuffer(buffer) {
    var nullSpot = buffer.indexOf('\0');
    if (nullSpot !== -1) {
        var messageSize = buffer.toString('utf8', 0, nullSpot);
        var messageSizePrefixBytes = Buffer.byteLength(messageSize);
        var totalMessageLength = 2 + messageSizePrefixBytes + Number(messageSize);
        // Return if We don't have a full message yet
        if (buffer[totalMessageLength - 1] === undefined) {
            return;
        } else if (buffer[totalMessageLength - 1] !== 0) {
            // TODO corrupted packet
            return;
        }
        var message = buffer.toString('utf8', messageSizePrefixBytes + 1, messageSizePrefixBytes + 1 + Number(messageSize));
        buffer = buffer.slice(totalMessageLength);
        var jsonObj;
        try {
            jsonObj = JSON.parse(message);
        } catch(e) {
            //this.emit('error', e);
        }
        return [buffer, jsonObj];
    }
}

module.exports.formatMessage = formatMessage;
module.exports.parseBuffer = parseBuffer;
module.exports.containsCompleteMessage = containsCompleteMessage;
