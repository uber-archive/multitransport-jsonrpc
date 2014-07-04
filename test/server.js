var jsonrpc = require('../lib/index');
var HttpTransport = jsonrpc.transports.server.http;
var TcpTransport = jsonrpc.transports.server.tcp;
var shared = require('../lib/transports/shared/tcp');
var JSONRPCserver = jsonrpc.server;
var ErrorCode = jsonrpc.errorcode;
var http = require('http');
var net = require('net');

exports.loopbackHttp = function(test) {
    test.expect(3);
    var jsonRpcServer = new JSONRPCserver(new HttpTransport(98765), {
        loopback: function(arg1, callback) {
            callback(null, arg1);
        }
    });
    var testJSON = JSON.stringify({
        id: 1,
        method: 'loopback',
        params: [{ hello: 'world' }]
    });
    var req = http.request({
        hostname: 'localhost',
        port: 98765,
        path: '/',
        method: 'POST'
    }, function(res) {
        res.setEncoding('utf8');
        var resultString = '';
        res.on('data', function(data) {
            resultString += data;
        });
        res.on('end', function() {
            test.equal(200, res.statusCode, 'The http transport provided an OK status code');
            var resultObj;
            try {
                resultObj = JSON.parse(resultString);
            } catch(e) {
                // Do nothing, test will fail
            }
            test.equal(resultObj.id, 1, 'The JSON-RPC server sent back the same ID');
            test.equal(resultObj.result.hello, 'world', 'The loopback method worked as expected');
            test.done();
            jsonRpcServer.transport.server.close();
        });
    });
    req.write(testJSON);
    req.end();
};

exports.loopbackHttpBatch = function(test) {
    test.expect(8);
    var jsonRpcServer = new JSONRPCserver(new HttpTransport(98123), {
        loopback: function(arg1, callback) {
            callback(null, arg1);
        }
    });
    var testJSON = JSON.stringify([
        {
            id: 1,
            method: 'loopback',
            params: [{ hello: 'world' }]
        },
        {
            id: 2,
            method: 'noexists',
            params: [{ hello: 'world' }]
        },
        {
            id: 3,
            method: 'loopback',
            params: [{ hello: 'batch world' }]
        }
    ]);
    var req = http.request({
        hostname: 'localhost',
        port: 98123,
        path: '/',
        method: 'POST'
    }, function(res) {
        res.setEncoding('utf8');
        var resultString = '';
        res.on('data', function(data) {
            resultString += data;
        });
        res.on('end', function() {
            test.equal(200, res.statusCode, 'The http transport provided an OK status code');
            var resultObj;
            try {
                resultObj = JSON.parse(resultString);
            } catch(e) {
                // Do nothing, test will fail
            }
            test.equal(Array.isArray(resultObj), true, 'The batch response is array');
            var obj;
            {
                obj = resultObj[0];
                test.equal(obj.id, 1, 'The JSON-RPC server sent back the same ID');
                test.equal(obj.result.hello, 'world', 'The loopback method worked as expected');
            }
            {
                obj = resultObj[1];
                test.equal(obj.id, 2, 'The JSON-RPC server sent back the same ID');
                test.equal(obj.error.code, -32601, 'The method is not found');
            }
            {
                obj = resultObj[2];
                test.equal(obj.id, 3, 'The JSON-RPC server sent back the same ID');
                test.equal(obj.result.hello, 'batch world', 'The loopback method worked as expected');
            }
            test.done();
            jsonRpcServer.transport.server.close();
        });
    });
    req.write(testJSON);
    req.end();
};

exports.failureTcp = function(test) {
    test.expect(2);
    var jsonRpcServer = new JSONRPCserver(new TcpTransport(99863), {
        failure: function(arg1, callback) {
            callback(new Error("I have no idea what I'm doing"));
        }
    });
    var con = net.connect({
        port: 99863,
        host: 'localhost'
    }, function() {
        con.write(shared.formatMessage({
            id: 1,
            method: 'failure',
            params: [{ hello: 'world' }]
        }));
    });
    var buffers = [], bufferLen = 0, messageLen = 0;
    con.on('data', function(data) {
        buffers.push(data);
        bufferLen += data.length;
        if(messageLen === 0) messageLen = shared.getMessageLen(buffers);
        if(bufferLen === messageLen + 4) con.end();
    });
    con.on('end', function() {
        try {
            var res = shared.parseBuffer(buffers, messageLen);
            test.equal(res[1].error.code, ErrorCode.internalError);
            test.equal(res[1].error.message, "I have no idea what I'm doing", 'Returns the error as an error');
        } catch(e) {
            // Do nothing
        }
        jsonRpcServer.transport.server.close();
        test.done();
    });
};

exports.nonexistentMethod = function(test) {
    test.expect(3);
    var jsonRpcServer = new JSONRPCserver(new HttpTransport(99111), {});
    var testJSON = JSON.stringify({
        id: 25,
        method: 'nonexistent',
        params: []
    });
    var req = http.request({
        hostname: 'localhost',
        port: 99111,
        path: '/',
        method: 'POST'
    }, function(res) {
        res.setEncoding('utf8');
        var resultString = '';
        res.on('data', function(data) {
            resultString += data;
        });
        res.on('end', function() {
            var resultObj;
            try {
                resultObj = JSON.parse(resultString);
            } catch(e) {
                // Do nothing, test will fail
            }
            test.equal(resultObj.id, 25, 'The JSON-RPC server sent back the correct ID');
            test.equal(resultObj.error.code, ErrorCode.methodNotFound);
            test.equal(resultObj.error.message, 'Requested method does not exist.', 'The JSON-RPC server returned the expected error message.');
            jsonRpcServer.shutdown(test.done.bind(test));
        });
    });
    req.write(testJSON);
    req.end();
};

exports.noncompliantJSON = function(test) {
    test.expect(3);
    var jsonRpcServer = new JSONRPCserver(new HttpTransport(99123), {});
    var testJSON = JSON.stringify({ hello: 'world' });
    var req = http.request({
        hostname: 'localhost',
        port: 99123,
        path: '/',
        method: 'POST'
    }, function(res) {
        res.setEncoding('utf8');
        var resultString = '';
        res.on('data', function(data) {
            resultString += data;
        });
        res.on('end', function() {
            var resultObj;
            try {
                resultObj = JSON.parse(resultString);
            } catch(e) {
                // Do nothing, test will fail
            }
            test.equal(resultObj.id, -1, 'The JSON-RPC server sent back the correct ID');
            test.equal(resultObj.error.code, ErrorCode.invalidRequest);
            test.equal(resultObj.error.message, 'Did not receive valid JSON-RPC data.', 'The JSON-RPC server returned the expected error message.');
            jsonRpcServer.shutdown(test.done.bind(test));
        });
    });
    req.write(testJSON);
    req.end();
};
