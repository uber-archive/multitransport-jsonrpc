var TcpTransport = require('../lib/transports/server/tcp');
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
    var responseData = '';
    con.on('data', function(data) {
        responseData += data.toString();
        if(/\0/.test(responseData)) con.end();
    });
    con.on('end', function() {
        test.equal(responseData, shared.formatMessage(testJSON), 'Loopback functioned correctly');
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
    var responseData = '';
    con.on('data', function(data) {
        responseData += data.toString();
        if(shared.containsCompleteMessage(responseData)) con.end();
    });
    con.on('end', function() {
        try {
            var obj = JSON.parse(responseData.substring(responseData.search('\0') + 1, responseData.length-1));
            test.equal(obj.error, "I have no idea what I'm doing.", 'error returned correctly');
        } catch(e) {
            // Nothing
        }
        tcpTransport.shutdown();
        test.done();
    });
};

exports.corrupt1 = function(test) {
    test.expect(3);
    var tcpTransport = new TcpTransport(12345);
    tcpTransport.handler = function(jsonObj, callback) {
        test.equal(jsonObj, '{"hello":"world"}');
        callback(jsonObj);
    };
    tcpTransport.on('error', function (e) {
        test.ifError(!e);
    });
    var testJSON = JSON.stringify({ hello: 'world' });
    var con = net.connect({ port: 12345, host: 'localhost' }, function() {
        con.write('asdf\0' + shared.formatMessage(testJSON));
    });
    var buffer = new Buffer('');
    con.on('data', function(data) {
        buffer = buffer.concat(data);
        if(shared.containsCompleteMessage(buffer.toString())) con.end();
    });
    con.on('end', function() {
        try {
            var result = shared.parseBuffer(buffer);
            test.equal(JSON.parse(result[1]).hello, "world", 'response returned correctly');
        } catch(e) {
            // Nothing
        }
        tcpTransport.shutdown();
        test.done();
    });
};

exports.corrupt2 = function(test) {
    test.expect(3);
    var tcpTransport = new TcpTransport(12345);
    tcpTransport.handler = function(jsonObj, callback) {
        test.equal(jsonObj, '{"hello":"world"}');
        callback(jsonObj);
    };
    tcpTransport.on('error', function (e) {
        test.ifError(!e);
    });
    var testJSON = JSON.stringify({ hello: 'world' });
    var con = net.connect({ port: 12345, host: 'localhost' }, function() {
        con.write('10\0' + shared.formatMessage(testJSON));
    });
    var buffer = new Buffer('');
    con.on('data', function(data) {
        buffer = buffer.concat(data);
        if(shared.containsCompleteMessage(buffer.toString())) con.end();
    });
    con.on('end', function() {
        try {
            var result = shared.parseBuffer(buffer);
            test.equal(JSON.parse(result[1]).hello, "world", 'response returned correctly');
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
