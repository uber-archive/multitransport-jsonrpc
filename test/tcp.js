var TcpTransport = require('../lib/transports/server/tcp');
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
        con.write(testJSON + '\0');
    });
    var responseData = '';
    con.on('data', function(data) {
        responseData += data.toString();
        if(/\0/.test(responseData)) con.end();
    });
    con.on('end', function() {
        test.equal(responseData, testJSON + '\0', 'Loopback functioned correctly');
        tcpTransport.server.close();
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
        con.write(testJSON + '\0');
    });
    var responseData = '';
    con.on('data', function(data) {
        responseData += data.toString();
        if(/\0/.test(responseData)) con.end();
    });
    con.on('end', function() {
        try {
            var obj = JSON.parse(responseData.substring(0, responseData.length-1));
            test.equal(obj.error, "I have no idea what I'm doing.", 'error returned correctly');
        } catch(e) {
            // Nothing
        }
        tcpTransport.server.close();
        test.done();
    });
};
