var HttpTransport = require('../lib/transports/client/http');
var TcpTransport = require('../lib/transports/client/tcp');
var JSONRPCclient = require('../lib/client');
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
        var buffer = '';
        con.on('data', function(data) {
            buffer += data.toString();
            var nullSpot = buffer.search(/\0/);
            while(nullSpot !== -1) {
                var previous = buffer.substring(0, nullSpot);
                var next = buffer.substring(nullSpot+1);
                var json;
                try {
                    json = JSON.parse(previous);
                } catch(e) {
                }
                buffer = next;
                nullSpot = buffer.search(/\0/);
                var outString = JSON.stringify({
                    id: json && json.id,
                    error: "I have no idea what I'm doing."
                }) + '\0';
                con.write(outString);
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
        server.close(function() {
            test.done();
        });
    });
};