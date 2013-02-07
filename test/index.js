var jsonrpc = require('../lib/index');
var Client = jsonrpc.client;
var Server = jsonrpc.server;
var ClientHttp = jsonrpc.transports.client.http;
var ClientTcp = jsonrpc.transports.client.tcp;
var ServerHttp = jsonrpc.transports.server.http;
var ServerTcp = jsonrpc.transports.server.tcp;

exports.loopbackHttp = function(test) {
    test.expect(1);
    var server = new Server(new ServerHttp(33333), {
        loopback: function(arg, callback) { callback(arg); }
    });
    var client = new Client(new ClientHttp('localhost', 33333), {}, function(c) {
        c.loopback('foo', function(err, result) {
            test.equal('foo', result, 'loopback works as expected');
            server.transport.server.close(function() {
                test.done();
            });
        });
    });
};

exports.failureTcp = function(test) {
    test.expect(2);
    var server = new Server(new ServerTcp(44444), {
        failure: function(arg, callback) { callback(new Error("I have no idea what I'm doing.")); }
    });
    var client = new Client(new ClientTcp('localhost', 44444), {}, function(c) {
        c.failure('foo', function(err, result) {
            test.ok(!!err, 'error exists');
            test.equal(err.message, "I have no idea what I'm doing.", 'error message transmitted successfully.');
            c.shutdown(function() {
                server.shutdown(test.done.bind(test));
            });
        });
    });
};