var jsonrpc = require('../lib/index');
var HttpTransport = jsonrpc.transports.client.http;
var http = require('http');

exports.loopback = function(test) {
    test.expect(1);
    var server = http.createServer(function(req, res) {
        var buffer = '';
        req.setEncoding('utf8');
        req.on('data', function(data) {
            buffer += data;
        });
        req.on('end', function() {
            res.write(buffer);
            res.end();
        });
    });
    server.listen(12345, 'localhost', function() {
        var httpTransport = new HttpTransport('localhost', 12345);
        httpTransport.request('foo', function(result) {
            test.equal('foo', result, 'loopback works correctly');
            server.close();
            test.done();
        });
    });
};