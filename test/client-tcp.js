var TcpTransport = require('../lib/transports/client/tcp');
var net = require('net');

exports.loopback = function(test) {
    test.expect(1);
    var server = net.createServer(function(con) {
        var buffer = '';
        con.on('data', function(data) {
            buffer += data.toString();
            if(/\0/.test(buffer)) {
                con.write(buffer);
                con.end();
            }
        });
    });
    server.listen(23456);
    var tcpTransport = new TcpTransport('localhost', 23456);
    tcpTransport.request('foo', function(result) {
        test.equal('foo', result, 'loopback worked correctly');
        tcpTransport.shutdown(function() {
            server.close(test.done.bind(test));
        });
    });
};

exports.sweep = function(test) {
    test.expect(1);
    var server = net.createServer(function(con) {
        var buffer = '';
        con.on('data', function(data) {
            buffer += data.toString();
            if(/\0/.test(buffer)) {
                setTimeout(function() {
                    con.write(buffer);
                    con.end();
                }, 400);
            }
        });
    });
    server.listen(23457);
    var tcpTransport = new TcpTransport('localhost', 23457, { timeout: 200 });
    tcpTransport.request('foo', function(result) {
        console.log(result);
        test.ok(false, 'this should never run');
    });
    setTimeout(function() {
        test.ok(true, 'this should always run');
        tcpTransport.shutdown(function() {
            server.close(test.done.bind(test));
        });
    }, 1000);
};

exports.glitchedConnection = function(test) {
    test.expect(3);
    var serverFunc = function(con) {
        var buffer = '';
        con.on('data', function(data) {
            buffer += data.toString();
            if(/\0/.test(buffer)) {
                setTimeout(function() {
                    con.write(buffer);
                    buffer = '';
                }, 400);
            }
        });
    };
    var server = net.createServer(serverFunc);
    server.listen(23458);
    var tcpTransport = new TcpTransport('localhost', 23458, {
        retries: 1
    });
    tcpTransport.request('foo', function(result) {
        test.equal('foo', result, 'eventually received the response');
        server.close();
        tcpTransport.shutdown();
        test.done();
    });

    // Kill the original server to simulate an error
    setTimeout(function() {
        test.ok(true, 'server was killed');
        server.close();
    }, 50);

    // Start a new server to reconnect to
    setTimeout(function() {
        test.ok(true, 'new server created to actually handle the request');
        server = net.createServer(serverFunc);
        server.listen(23458);
    }, 100);
};