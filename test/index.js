var jsonrpc = require('../lib/index');
var Client = jsonrpc.client;
var Server = jsonrpc.server;
var ClientHttp = jsonrpc.transports.client.http;
var ClientTcp = jsonrpc.transports.client.tcp;
var ServerHttp = jsonrpc.transports.server.http;
var ServerTcp = jsonrpc.transports.server.tcp;
var ServerMiddleware = jsonrpc.transports.server.middleware;
var Loopback = jsonrpc.transports.shared.loopback;
var express = require('express');
var http = require('http');

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
        client.failure('foo', function(err, result) {
            test.ok(!!err, 'error exists');
            test.equal(err.message, "I have no idea what I'm doing.", 'error message transmitted successfully.');
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
    var server = http.createServer(app);
    server.listen(55555);

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
                server.close(test.done.bind(test));
            });
        });
    });
};