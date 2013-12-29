// ## The JSONRPC constructor
// Each JSON-RPC object created is tied to a particular JSON-RPC server URL.
// This may be inconvenient for server architectures that have many URLs for
// each JSON-RPC server, but this is an odd use case we aren't implementing.
//
// The constructed JSON-RPC objects consist of three built-in methods:
//
// * request
// * register
//
// The *request* and *requestBlock* functions are the ones actually used to
// call the JSON-RPC server, and the *register* function constructs the expected
// function names to be used by the developer using this JSON-RPC client.

// The JSONRPC constructor *must* receive a server URL on initialization
function JSONRPC(transport, options, done) {
    this.transport = transport;
    // Parse any *options* provided to the client
    // If no *options* object provided, create an empty one
    if(typeof(options) !== "object" || options === null) {
        options = {};
    }
    // *autoRegister* methods from the server unless explicitly told otherwise
    if(!options.hasOwnProperty("autoRegister") || options.autoRegister) {
        this.request('rpc.methodList', [], function(err, result) {
            if(!err) this.register(result);
            if(done) done(this);
        }.bind(this));
    }
    // Once the JSONRPC object has been properly initialized, return the object
    // to the developer
    return this;
}

// ### The *request* function
// is a non-blocking function that takes an arbitrary number of arguments,
// where the first argument is the remote method name to execute, the last
// argument is the callback function to execute when the server returns its
// results, and all of the arguments in between are the values passed to the
// remote method.
JSONRPC.prototype.request = function(method, args, callback) {
    // The *contents* variable contains the JSON-RPC 1.0 POST string.
    var contents = {
        method: method,
        params: args,
        id: Math.random()
    };
    this.transport.request(contents, function(response) {
        if(!response && callback instanceof Function) {
            callback(new Error("Server did not return valid JSON-RPC response"));
            return;
        }
        if(callback instanceof Function) {
            if(response.error) {
                if(response.error.message) {
                    var err = new Error(response.error.message);
                    Object.keys(response.error).forEach(function(key) {
                        if(key !== 'message') err[key] = response.error[key];
                    });
                    callback(err);
                } else if (typeof response.error === 'string') {
                    callback(new Error(response.error));
                } else {
                    callback(response.error);
                }
            } else {
                callback(undefined, response.result);
            }
        }
    });
};

// ### The *register* function
// is a simple blocking function that takes a method name or array of
// method names and directly modifies the
JSONRPC.prototype.register = function(methods) {
    if(!(methods instanceof Array)) {
        methods = [methods];
    }
    methods.forEach(function(method) {
        if(method !== "transport" && method !== "request" && method !== "register" && method !== "shutdown") {
            this[method] = function() {
                var theArgs = [];
                for(var i = 0; i < arguments.length-1; i++) {
                    theArgs[i] = arguments[i];
                }
                var callback = arguments[arguments.length-1];
                this.request(method, theArgs, callback);
            };
        }
    }.bind(this));
};

// Cleanly shutdown the JSONRPC client
JSONRPC.prototype.shutdown = function(done) {
    this.transport.shutdown(done);
};

module.exports = JSONRPC;
