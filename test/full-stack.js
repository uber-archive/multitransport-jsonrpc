var Client = require('../lib/client');
var Server = require('../lib/server');
var ClientHttp = require('../lib/transports/client/http');
var ClientTcp = require('../lib/transports/client/tcp');
var ServerHttp = require('../lib/transports/server/http');
var ServerTcp = require('../lib/transports/server/tcp');

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
            c.transport.con.end();
            server.transport.server.close(function() {
                test.done();
            });
        });
    });
};