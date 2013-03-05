var HttpTransport = require('../lib/transports/client/http');
var TcpTransport = require('../lib/transports/client/tcp');
var JSONRPCclient = require('../lib/client');
var shared = require('../lib/transports/shared/tcp');
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
        })
    });
};

exports.failureTcp = function(test) {
    test.expect(2);
    var server = net.createServer(function(con) {
        var buffer = new Buffer('');
        con.on('data', function(data) {
            buffer = buffer.concat(data);
            var res, obj;
            while ((res = shared.parseBuffer(buffer))) {
                buffer = res[0];
                obj = res[1];
                con.write(shared.formatMessage({
                    id: obj && obj.id,
                    error: "I have no idea what I'm doing."
                }));
            }
        });
    });
    server.listen(11111);
    var jsonRpcClient = new JSONRPCclient(new TcpTransport('localhost', 11111));
    jsonRpcClient.register('foo');
    jsonRpcClient.foo('bar', function(err, result) {
        test.ok(!!err, 'error exists');
        test.equal("I have no idea what I'm doing.", err.message, 'The error message was received correctly');
        jsonRpcClient.transport.con.end();
        jsonRpcClient.shutdown(function() {
            server.close(test.done.bind(test));
        });
    });
};
