var jsonrpc = require('../../lib/index');
var JsonRpcServer = jsonrpc.server;
var JsonRpcChildProcTransport = jsonrpc.transports.server.childProcess;

var server = new JsonRpcServer(new JsonRpcChildProcTransport(), {
    loopback: function(obj, callback) {
        callback(null, obj);
    },
    failure: function(obj, callback) {
        callback(new Error("Whatchoo talkin' 'bout, Willis?"));
    }
});