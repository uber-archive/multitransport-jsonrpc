var TcpTransport = require('../lib/transports/client/tcp');
var net = require('net');

exports.loopback = function(test) {
    test.expect(1);
    var server = net.createServer(function(con) {
        var buffer = '';
        con.on('data', function(data) {
            buffer += data.toString();
            if(/\0/.test(buffer)) {
                con.write(buffer);
                con.end();
            }
        });
    });
    server.listen(23456);
    var tcpTransport = new TcpTransport('localhost', 23456);
    tcpTransport.request('foo', function(result) {
        test.equal('foo', result, 'loopback worked correctly');
        server.close(function() {
            test.done();
        });
    });
};