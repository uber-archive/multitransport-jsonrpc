var jsonrpc = require('../lib/index');
var ChildProcessTransport = jsonrpc.transports.client.childProcess;
var JsonRpcClient = jsonrpc.client;
var childProcess = require('child_process');

var child = childProcess.fork(__dirname + '/child/child-compressed.js');
var jsonRpcClient = new JsonRpcClient(new ChildProcessTransport(child, { compressed: true, compressLength: 1000 }));
jsonRpcClient.register(['loopback', 'failure']);

exports.loopback = function(test) {
    test.expect(2);
    jsonRpcClient.loopback({foo: 'bar'}, function(err, result) {
        test.ok(!!result, 'result exists');
        test.equal(result.foo, 'bar', 'Looped back correctly');
        test.done();
    });
};

String.prototype.repeat = function(num) {
    return new Array(num + 1).join(this);
};

exports.loopbackCompressed = function(test) {
    test.expect(2);
    jsonRpcClient.loopback('a'.repeat(1001), function(err, result) {
        test.ok(!!result, 'result exists');
        test.equal(result, 'a'.repeat(1001), 'Looped back correctly');
        test.done();
    });
};

exports.failureTcp = function(test) {
    test.expect(3);
    jsonRpcClient.failure({foo: 'bar'}, function(err) {
        test.ok(!!err, 'error exists');
        test.equal("Whatchoo talkin' 'bout, Willis?", err.message, 'The error message was received correctly');
        test.equal(1, err.prop, 'The error message was received correctly');
        child.kill();
        test.done();
    });
};
