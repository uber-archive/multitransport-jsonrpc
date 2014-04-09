var jsonrpc = require('../lib/index');
var HttpTransport = jsonrpc.transports.client.http;
var TcpTransport = jsonrpc.transports.client.tcp;
var JSONRPCclient = jsonrpc.client;
var shared = require('../lib/transports/shared/tcp');
var l = require('lambda-js');
var http = require('http');
var net = require('net');

exports.loopbackHttp = function(test) {
    test.expect(1);
    var server = http.createServer(function(req, res) {
        var buffer = '';
        req.setEncoding('utf8');
        req.on('data', function(data) {
            buffer += data;
        });
        req.on('end', function() {
            var json;
            try {
                json = JSON.parse(buffer);
            } catch(e) {
            }
            res.write(JSON.stringify({
                id: json && json.id,
                result: json && json.params
            }));
            res.end();
        });
    });
    server.listen(22222);
    var jsonRpcClient = new JSONRPCclient(new HttpTransport('localhost', 22222));
    jsonRpcClient.register('foo');
    jsonRpcClient.foo('bar', function(err, result) {
        test.equal('bar', result, 'Looped-back correctly');
        server.close(function() {
            test.done();
        });
    });
};

exports.failureTcp = function(test) {
    test.expect(2);
    var server = net.createServer(function(con) {
        var buffers = [];
        var bufferLen = 0;
        var messageLen = 0;
        con.on('data', function(data) {
            buffers.push(data);
            bufferLen += data.length;
            if(messageLen === 0) messageLen = shared.getMessageLen(buffers);
            var res, obj;
            if(bufferLen - 4 >= messageLen) {
                while (messageLen && bufferLen - 4 >= messageLen && (res = shared.parseBuffer(buffers, messageLen))) {
                    buffers = res[0];
                    obj = res[1];
                    con.write(shared.formatMessage({
                        id: obj && obj.id,
                        error: "I have no idea what I'm doing."
                    }));
                    bufferLen = buffers.map(l('buffer', 'buffer.length')).reduce(l('fullLen, currLen', 'fullLen + currLen'), 0);
                    messageLen = shared.getMessageLen(buffers);
                }
            }
        });
    });
    server.listen(11111);
    var jsonRpcClient = new JSONRPCclient(new TcpTransport({ host: 'localhost', port: 11111 }));
    jsonRpcClient.register('foo');
    jsonRpcClient.foo('bar', function(err) {
        test.ok(!!err, 'error exists');
        test.equal("I have no idea what I'm doing.", err.message, 'The error message was received correctly');
        jsonRpcClient.transport.con.end();
        jsonRpcClient.shutdown(function() {
            server.close(test.done.bind(test));
        });
    });
};

exports.invalidHttp = function(test) {
    test.expect(1);
    var server = http.createServer(function(req, res) {
        res.end('Hahahaha');
    });
    server.listen(23232);
    var jsonRpcClient = new JSONRPCclient(new HttpTransport('localhost', 23232));
    jsonRpcClient.register('foo');
    jsonRpcClient.foo('bar', function(err) {
        test.ok(err instanceof Error, 'received the error response from the client library');
        server.close(test.done.bind(test));
    });
};
