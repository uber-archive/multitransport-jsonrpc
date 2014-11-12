var jsonrpc = require('../../lib/index');
var JsonRpcServer = jsonrpc.server;
var JsonRpcChildProcTransport = jsonrpc.transports.server.childProcess;

var server = new JsonRpcServer(new JsonRpcChildProcTransport(), {
    loopback: function(obj, callback) {
        callback(null, obj);
    },
    failure: function(obj, callback) {
        var error = new Error("Whatchoo talkin' 'bout, Willis?");
        error.prop = 1;
        callback(error);
    }
});
