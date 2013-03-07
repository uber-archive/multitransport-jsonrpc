var HttpTransport = require('../lib/transports/server/http');
var TcpTransport = require('../lib/transports/server/tcp');
var shared = require('../lib/transports/shared/tcp');
var JSONRPCserver = require('../lib/server');
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

exports.failureTcp = function(test) {
    test.expect(1);
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
            test.equal(res[1].error.message, "I have no idea what I'm doing", 'Returns the error as an error');
        } catch(e) {
            // Do nothing
        }
        jsonRpcServer.transport.server.close();
        test.done();
    });
};
