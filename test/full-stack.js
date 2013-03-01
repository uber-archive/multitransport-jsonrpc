var Client = require('../lib/client');
var Server = require('../lib/server');
var ClientHttp = require('../lib/transports/client/http');
var ClientTcp = require('../lib/transports/client/tcp');
var ServerHttp = require('../lib/transports/server/http');
var ServerTcp = require('../lib/transports/server/tcp');

exports.loopbackHttp = function(test) {
    test.expect(1);
    var server = new Server(new ServerHttp(33333), {
        loopback: function(arg, callback) { callback(null, arg); }
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

String.prototype.repeat = function( num )
{
        return new Array( num + 1 ).join( this );
}

function perf(testString, tcpParallelism, test) {
    test.expect(2);
    var numMessages = 10000;
    var tcpServer = new Server(new ServerTcp(9001), {
        loopback: function(arg, callback) { callback(null, arg); }
    });
    var httpServer = new Server(new ServerHttp(9002), {
        loopback: function(arg, callback) { callback(null, arg); }
    });
    var tcpClients = [];
    for(var i = 0; i < tcpParallelism; i++) {
        tcpClients[i] = new Client(new ClientTcp('localhost', 9001));
        tcpClients[i].register('loopback');
    }
    var tcpCount = 0, tcpStart = new Date().getTime(), tcpEnd;
    for(var i = 0; i < numMessages; i++) {
        tcpClients[i % tcpParallelism].loopback(testString || i, function() {
            tcpCount++;
            if(tcpCount === numMessages) {
                test.ok(true, 'tcp finished');
                tcpEnd = new Date().getTime();
                var tcpTime = tcpEnd - tcpStart;
                var tcpRate = numMessages * 1000 / tcpTime;
                console.log("TCP took " + tcpTime + "ms, " + tcpRate + " reqs/sec");
                next();
            }
        });
    }
    function next() {
        var httpClient = new Client(new ClientHttp('localhost', 9002));
        httpClient.register('loopback');
        var httpCount = 0, httpStart = new Date().getTime(), httpEnd;
        for(var i = 0; i < numMessages; i++) {
            httpClient.loopback(i, function() {
                httpCount++;
                if(httpCount === numMessages) {
                    test.ok(true, 'http finished');
                    httpEnd = new Date().getTime();
                    var httpTime = httpEnd - httpStart;
                    var httpRate = numMessages * 1000 / httpTime;
                    console.log("HTTP took " + httpTime + "ms, " + httpRate + " reqs/sec");
                    tcpClients.forEach(function(tcpClient) { tcpClient.shutdown(); });
                    httpClient.shutdown();
                    tcpServer.shutdown();
                    httpServer.shutdown();
                    test.done();
                }
            });
        }
    }
};

exports.perf_simple = perf.bind(null, null, 1);
exports.perf_100 = perf.bind(null, 'a'.repeat(100), 1);
exports.perf_1000 = perf.bind(null, 'a'.repeat(1000), 1);
exports.perf_10000 = perf.bind(null, 'a'.repeat(10000), 1);
exports.perf_100000 = perf.bind(null, 'a'.repeat(100000), 1);
exports.perf_100000_10 = perf.bind(null, 'a'.repeat(100000), 10);
exports.perf_100000_100 = perf.bind(null, 'a'.repeat(100000), 100);
