var jsonrpc = require('../lib/index');
var TcpTransport = jsonrpc.transports.server.tcp;
var shared = require('../lib/transports/shared/tcp');
var net = require('net');

exports.loopback = function(test) {
    test.expect(1);
    var tcpTransport = new TcpTransport(11235);
    tcpTransport.handler = function(jsonObj, callback) {
        callback(jsonObj);
    };
    var testJSON = JSON.stringify({ hello: 'world' });
    var con = net.connect({
        port: 11235,
        host: 'localhost'
    }, function() {
        con.write(shared.formatMessage(testJSON));
    });
    var buffers = [], bufferLen = 0, messageLen = 0;
    con.on('data', function(data) {
        buffers.push(data);
        bufferLen += data.length;
        if(messageLen === 0) messageLen = shared.getMessageLen(buffers);
        if(bufferLen === messageLen + 4) con.end();
    });
    con.on('end', function() {
        var result = buffers.reduce(function(outBuffer, currBuffer) {
            return Buffer.concat([outBuffer, currBuffer]);
        }, new Buffer(''));
        test.equal(result.toString(), shared.formatMessage(testJSON).toString(), 'Loopback functioned correctly');
        tcpTransport.shutdown();
        test.done();
    });
};

exports.failure = function(test) {
    test.expect(1);
    var tcpTransport = new TcpTransport(12345);
    tcpTransport.handler = function(jsonObj, callback) {
        callback({ error: "I have no idea what I'm doing." });
    };
    var testJSON = JSON.stringify({ hello: 'world' });
    var con = net.connect({
        port: 12345,
        host: 'localhost'
    }, function() {
        con.write(shared.formatMessage(testJSON));
    });
    var buffers = [], bufferLen = 0, messageLen = 0;
    con.on('data', function(data) {
        buffers.push(data);
        bufferLen += data.length;
        if(messageLen === 0) messageLen = shared.getMessageLen(buffers);
        if(bufferLen === messageLen + 4) con.end();
    });
    con.on('end', function() {
        var result = buffers.reduce(function(outBuffer, currBuffer) {
            return Buffer.concat([outBuffer, currBuffer]);
        }, new Buffer(''));
        try {
            var obj = JSON.parse(result.toString('utf8', 4));
            test.equal(obj.error, "I have no idea what I'm doing.", 'error returned correctly');
        } catch(e) {
            // Nothing
        }
        tcpTransport.shutdown();
        test.done();
    });
};

exports.listening = function(test) {
    test.expect(1);
    var tcpTransport = new TcpTransport(12346);
    tcpTransport.on('listening', function() {
        test.ok(true, 'listening callback fired');
        tcpTransport.server.close();
        test.done();
    });
};

exports.retry = function(test) {
    test.expect(1);
    var tcpTransport1 = new TcpTransport(2468);
    tcpTransport1.on('listening', function() {
        var tcpTransport2 = new TcpTransport(2468, { retries: 1 });
        tcpTransport2.on('listening', function() {
            test.ok(true, 'second tcpTransport eventually succeeded to start');
            tcpTransport2.server.close();
            test.done();
        });
        setTimeout(function() {
            tcpTransport1.shutdown();
        }, 50);
    });
};

exports.dontSendAfterClose = function(test) {
    test.expect(1);
    var tcpTransport = new TcpTransport(2222);
    tcpTransport.handler = function(jsonObj, callback) {
        // The timeout should cause it to try to send the message after the client disconnected
        // The server should not throw an error in this condition
        setTimeout(callback.bind(this, jsonObj), 3000);
    };
    tcpTransport.on('listening', function() {
        var con = net.connect({
            port: 2222,
            host: 'localhost'
        }, function() {
            con.write(shared.formatMessage({hello: 'world'}));
            test.ok(true, 'wrote the message to the server and killed the connection');
            con.destroy();
        });
    });
    setTimeout(function() {
        tcpTransport.shutdown(test.done.bind(test));
    }, 4000);
};
