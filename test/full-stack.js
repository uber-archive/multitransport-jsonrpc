var jsonrpc = require('../lib/index');
var Client = jsonrpc.client;
var Server = jsonrpc.server;
var ClientHttp = jsonrpc.transports.client.http;
var ClientTcp = jsonrpc.transports.client.tcp;
var ClientChildProc = jsonrpc.transports.client.childProcess;
var ServerHttp = jsonrpc.transports.server.http;
var ServerTcp = jsonrpc.transports.server.tcp;
var ServerMiddleware = jsonrpc.transports.server.middleware;
var Loopback = jsonrpc.transports.shared.loopback;
var express = require('express');
var http = require('http');
var net = require('net');
var childProcess = require('child_process');
var child = childProcess.fork(__dirname + '/child/child.js');
var childProcClient = new Client(new ClientChildProc(child));
childProcClient.register('loopback');

exports.loopbackHttp = function(test) {
    test.expect(1);
    var server = new Server(new ServerHttp(33333), {
        loopback: function(arg, callback) { callback(null, arg); }
    });
    var client = new Client(new ClientHttp('localhost', 33333), {}, function(c) {
        c.loopback('foo', function(err, result) {
            test.equal('foo', result, 'loopback works as expected');
            server.transport.server.close(function() {
                client.shutdown();
                test.done();
            });
        });
    });
};

exports.failureTcp = function(test) {
    test.expect(4);
    var server = new Server(new ServerTcp(44444), {
        failure: function(arg, callback) { callback(new Error("I have no idea what I'm doing.")); }
    });
    var client = new Client(new ClientTcp('localhost', 44444), {}, function(c) {
        c.failure('foo', function(err) {
            test.ok(!!err, 'error exists');
            test.equal(err.message, "I have no idea what I'm doing.", 'error message transmitted successfully.');
            c.shutdown(function() {
                server.shutdown(test.done.bind(test));
            });
        });
    });
    client.transport.on('message', function() {
        test.ok('received a message'); // should happen twice
    });
};

exports.objectFailureTcp = function(test) {
    test.expect(4);
    var server = new Server(new ServerTcp(44444), {
        failure: function(arg, callback) { callback({ foo: "I have no idea what I'm doing." }); }
    });
    var client = new Client(new ClientTcp('localhost', 44444), {}, function(c) {
        c.failure('foo', function(err) {
            test.ok(!!err, 'error exists');
            test.equal(err.foo, "I have no idea what I'm doing.", 'error message transmitted successfully.');
            c.shutdown(function() {
                server.shutdown(test.done.bind(test));
            });
        });
    });
    client.transport.on('message', function() {
        test.ok('received a message'); // should happen twice
    });
};

exports.sweepedRequest = function(test) {
    test.expect(2);
    var client = new Client(new ClientTcp('localhost', 44444));
    client.register(['willNeverReachAServer']);
    client.willNeverReachAServer(function(err) {
        test.ok(err instanceof Error, 'received an error message');
        test.equal(err.message, 'Request Timed Out', 'received the "sweep" error message');
        client.shutdown();
        test.done();
    });
};

exports.loopbackLoopback = function(test) {
    test.expect(3);
    var loopback = new Loopback();
    var server = new Server(loopback, {
        loopback: function(arg, callback) { callback(null, arg); },
        failure: function(arg, callback) { callback(new Error("I have no idea what I'm doing.")); }
    });
    var client = new Client(loopback);
    client.register(['loopback', 'failure']);
    client.loopback('foo', function(err, result) {
        test.equal('foo', result, 'loopback works as expected');
        client.failure('foo', function(err) {
            test.ok(!!err, 'error exists');
            test.equal(err.message, "I have no idea what I'm doing.", 'error message transmitted successfully.');
            server.shutdown();
            test.done();
        });
    });
};

exports.loopbackExpress = function(test) {
    test.expect(2);

    var app = express();
    app.use(express.bodyParser());
    app.get('/foo', function(req, res) {
        res.end('bar');
    });

    var server = new Server(new ServerMiddleware(), {
        loopback: function(arg, callback) { callback(null, arg); }
    });
    app.use('/rpc', server.transport.middleware);

    //app.listen(55555); // Express 3.0 removed the ability to cleanly shutdown an express server
    // The following is copied from the definition of app.listen()
    var httpServer = http.createServer(app);
    httpServer.listen(55555);

    var client = new Client(new ClientHttp('localhost', 55555, { path: '/rpc' }));
    client.register('loopback');

    http.get({
        port: 55555,
        path: '/foo'
    }, function(res) {
        res.setEncoding('utf8');
        var data = '';
        res.on('data', function(chunk) { data += chunk; });
        res.on('end', function() {
            test.equal(data, 'bar', 'regular http requests work');
            client.loopback('bar', function(err, result) {
                test.equal(result, 'bar', 'JSON-RPC as a middleware works');
                httpServer.close(test.done.bind(test));
            });
        });
    });
};

exports.tcpServerEvents1 = function(test) {
    test.expect(10);
    var server = new Server(new ServerTcp(11111), {
        loopback: function(arg, callback) { callback(null, arg); }
    });
    server.transport.on('connection', function(con) {
        test.ok(con instanceof net.Socket, 'incoming connection is a socket');
    });
    server.transport.on('closedConnection', function(con) {
        test.ok(con instanceof net.Socket, 'closing connection is a socket');
    });
    server.transport.on('listening', function() {
        test.ok(true, 'server started correctly');
    });
    server.transport.on('shutdown', function() {
        test.ok(true, 'the server was shutdown correctly');
        test.done();
    });
    server.transport.on('message', function(obj, len) {
        test.ok(obj instanceof Object, 'object received');
        test.ok(len > 0, 'message length provided');
    });
    server.transport.on('outMessage', function(obj, len) {
        test.ok(obj instanceof Object, 'object ready');
        test.ok(len > 0, 'message length calcuated');
    });
    server.transport.on('retry', function() {
        // Not implemented yet
    });
    server.transport.on('error', function() {
        // Not implemented yet
    });
    var client = new Client(new ClientTcp('localhost', 11111), { autoRegister: false });
    client.register('loopback');
    client.loopback('foo', function(err, result) {
        test.ok(!err, 'no error');
        test.equal(result, 'foo', 'loopback worked');
        client.shutdown(function() {
            setTimeout(server.shutdown.bind(server), 500);
        });
    });
};

exports.tcpServerEvents2 = function(test) {
    test.expect(2);
    var server1 = new Server(new ServerTcp(11112), {
        loopback: function(arg, callback) { callback(null, arg); }
    });
    server1.transport.on('listening', function() {
        var server2 = new Server(new ServerTcp(11112, { retries: 1 }), {});
        server2.transport.on('retry', function() {
            test.ok(true, 'retried to connect to the specified port');
        });
        server2.transport.on('error', function(e) {
            test.ok(e instanceof Error, 'received the error object after second retry was denied');
            server1.shutdown(test.done.bind(test));
        });
    });
};

exports.multitransport = function(test) {
    test.expect(2);
    var server = new Server([new ServerTcp(9999), new ServerHttp(9998)], {
        loopback: function(arg, callback) { callback(null, arg); }
    });
    var client1 = new Client(new ClientTcp('localhost', 9999));
    var client2 = new Client(new ClientHttp('localhost', 9998));
    client1.register('loopback');
    client2.register('loopback');
    client1.loopback('foo', function(err, result) {
        test.equal('foo', result, 'got the result over TCP');
        client2.loopback('bar', function(err, result) {
            test.equal('bar', result, 'got the result of HTTP');
            client1.shutdown(function() {
                client2.shutdown(function() {
                    server.shutdown(test.done.bind(test));
                });
            });
        });
    });
};


String.prototype.repeat = function(num) {
    return new Array(num + 1).join(this);
};

function perf(testString, test) {
    test.expect(4);
    var numMessages = 1000;
    var tcpServer = new Server(new ServerTcp(9001), {
        loopback: function(arg, callback) { callback(null, arg); }
    });
    var httpServer = new Server(new ServerHttp(9002), {
        loopback: function(arg, callback) { callback(null, arg); }
    });
    var loopback = new Loopback();
    var loopbackServer = new Server(loopback, {
        loopback: function(arg, callback) { callback(null, arg); }
    });
    var tcpClient = new Client(new ClientTcp('localhost', 9001));
    tcpClient.register('loopback');
    var tcpCount = 0, tcpStart = new Date().getTime(), tcpEnd;
    for(var i = 0; i < numMessages; i++) {
        /* jshint loopfunc: true */
        tcpClient.loopback(testString || i, function() {
            tcpCount++;
            if(tcpCount === numMessages) {
                test.ok(true, 'tcp finished');
                tcpEnd = new Date().getTime();
                var tcpTime = tcpEnd - tcpStart;
                var tcpRate = numMessages * 1000 / tcpTime;
                console.log("TCP took " + tcpTime + "ms, " + tcpRate + " reqs/sec");
                tcpClient.shutdown();
                tcpServer.shutdown();
                next();
            }
        });
    }
    function next() {
        var httpClient = new Client(new ClientHttp('localhost', 9002));
        httpClient.register('loopback');
        var httpCount = 0, httpStart = new Date().getTime(), httpEnd;
        for(var i = 0; i < numMessages; i++) {
            /* jshint loopfunc: true */
            httpClient.loopback(i, function() {
                httpCount++;
                if(httpCount === numMessages) {
                    test.ok(true, 'http finished');
                    httpEnd = new Date().getTime();
                    var httpTime = httpEnd - httpStart;
                    var httpRate = numMessages * 1000 / httpTime;
                    console.log("HTTP took " + httpTime + "ms, " + httpRate + " reqs/sec");
                    httpClient.shutdown();
                    httpServer.shutdown();
                    more();
                }
            });
        }
    }
    function more() {
        var childProcCount = 0, childProcStart = Date.now(), childProcEnd;
        for(var i = 0; i < numMessages; i++) {
            /* jshint loopfunc: true */
            childProcClient.loopback(i, function() {
                childProcCount++;
                if(childProcCount === numMessages) {
                    test.ok(true, 'childProc finished');
                    childProcEnd = Date.now();
                    var childProcTime = childProcEnd - childProcStart;
                    var childProcRate = numMessages * 1000 / childProcTime;
                    console.log("Child Proc IPC took " + childProcTime + "ms, " + childProcRate + " reqs/sec");
                    last();
                }
            });
        }
    }
    function last() {
        var loopbackClient = new Client(loopback);
        loopbackClient.register('loopback');
        var loopbackCount = 0, loopbackStart = Date.now(), loopbackEnd;
        for(var i = 0; i < numMessages; i++) {
            /* jshint loopfunc: true */
            loopbackClient.loopback(i, function() {
                loopbackCount++;
                if(loopbackCount === numMessages) {
                    test.ok(true, 'loopback finished');
                    loopbackEnd = Date.now();
                    var loopbackTime = loopbackEnd - loopbackStart;
                    var loopbackRate = numMessages * 1000 / loopbackTime;
                    console.log("Loopback took " + loopbackTime + "ms, " + loopbackRate + " reqs/sec");
                    loopbackClient.shutdown();
                    loopbackServer.shutdown();
                    test.done();
                }
            });
        }
    }

}

exports.perfSimple = perf.bind(null, null);
exports.perf100 = perf.bind(null, 'a'.repeat(100));
exports.perf1000 = perf.bind(null, 'a'.repeat(1000));
exports.perf10000 = perf.bind(null, 'a'.repeat(10000));
exports.perf100000 = perf.bind(null, 'a'.repeat(100000));

exports.closeChild = function(test) {
    child.kill();
    test.done();
};
