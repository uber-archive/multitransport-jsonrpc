var errorCode = require('./errorcode');

// ## The JSONRPC constructor
// Each JSON-RPC object is tied to a *scope*, an object containing functions to
// call. If not passed an explicit scope, *Node.js*' *root* scope will be used.
// Also, unlike the Javascript running in web browsers, functions not explicitly
// assigned to a scope are attached to the anonymous scope block only and cannot
// be accessed even from the *root* scope.
function JSONRPC(transports, scope) {
    this.transports = Array.isArray(transports) ? transports : [transports];
    this.transport = this.transports[0]; // For compatibility with existing code
    this.scope = scope;

    // The actual object initialization occurs here. If the *scope* is not
    // defined, the *root* scope is used, and then the object is returned to
    // the developer.
    if(!scope || typeof(scope) !== "object") {
        /* global root: false */
        scope = root;
    }
    // ### The *rpc.methodList* method
    // is a JSON-RPC extension that returns a list of all methods in the scope
    scope['rpc.methodList'] = function(callback) {
        callback(null, Object.keys(scope));
    };

    for(var i = 0; i < this.transports.length; i++) {
        this.transports[i].handler = this.handleJSON.bind(this);
    }

    return this;
}

// ### The *handleJSON* function
// makes up the majority of the JSON-RPC server logic, handling the requests
// from clients, passing the call to the correct function, catching any
// errors the function may throw, and calling the function to return the
// results back to the client.
JSONRPC.prototype.handleJSON = function handleJSON(data, callback) {
    function batchCallback(response, size) {
        return function cb(obj) {
            response.push(obj);
            if (response.length === size) {
                callback(response);
            }
        };
    }
    if(Array.isArray(data)) {
        var response = [];
        var len = data.length;
        for (var i = 0; i < len; ++i) {
            var x = data[i];
            this.handleJSON(x, batchCallback(response, len));
        }
    } else if(data instanceof Object) {
        if(data.method) {
            // If the method is defined in the scope and is not marked as a
            // blocking function, then a callback must be defined for
            // the function. The callback takes two parameters: the
            // *result* of the function, and an *error* message.
            var arglen = data.params && data.params instanceof Array ? data.params.length : data.params ? 1 : 0;
            if(this.scope[data.method] && !(this.scope[data.method].length === arglen || this.scope[data.method].blocking)) {
                var next = function(error, result) {
                    var outObj = {};
                    if(data.id) {
                        outObj.id = data.id;
                    }
                    if(error) {
                        outObj.result = null;
                        if(error instanceof Error) {
                            outObj.error = {};
                            var keys = Object.keys(error);
                            for (var i = 0; i < keys.length; ++i) {
                                var key = keys[i];
                                outObj.error[key] = error[key];
                            }
                            outObj.error.code = errorCode.internalError;
                            outObj.error.message = error.message;
                        } else {
                            outObj.error = error;
                        }
                    } else {
                        outObj.error = null;
                        outObj.result = result;
                    }
                    callback(outObj);
                };
                if(data.params && data.params instanceof Array) {
                    data.params.push(next);
                } else if(data.params) {
                    data.params = [data.params, next];
                } else {
                    data.params = [next];
                }
                // This *try-catch* block is for catching errors in an asynchronous server method.
                // Since the async methods are supposed to return an error in the callback, this
                // is assumed to be an unintended mistake, so we catch the error, send a JSON-RPC
                // error response, and then re-throw the error so the server code gets the error
                // and can deal with it appropriately (which could be "crash because this isn't
                // expected to happen").
                try {
                    this.scope[data.method].apply(this.scope, data.params);
                } catch(e) {
                    var outErr = {};
                    outErr.code = errorCode.internalError;
                    outErr.message = e.message ? e.message : "";
                    outErr.stack = e.stack ? e.stack : "";
                    var outObj = { result: null, error: outErr };
                    if(data.id) outObj.id = data.id;
                    callback(outObj);
                    throw e;
                }
            } else {
                callback({result:null, error:{code: errorCode.methodNotFound, message:"Requested method does not exist."}, id: data.hasOwnProperty('id') ? data.id : -1});
            }
        } else {
            callback({result:null, error:{code: errorCode.invalidRequest, message:"Did not receive valid JSON-RPC data."}, id: data.hasOwnProperty('id') ? data.id : -1});
        }
    } else {
        callback({result:null, error:{code: errorCode.parseError, message:"Did not receive valid JSON-RPC data."}, id: data.hasOwnProperty('id') ? data.id : -1});
    }
};

// ### The *register* function
// allows one to attach a function to the current scope after the scope has
// been attached to the JSON-RPC server, for similar possible shenanigans as
// described above. This method in particular, though, by attaching new
// functions to the current scope, could be used for caching purposes or
// self-modifying code that rewrites its own definition.
JSONRPC.prototype.register = function(methodName, method) {
    if(!this.scope || typeof(this.scope) !== "object") {
        this.scope = {};
    }
    this.scope[methodName] = method;
};

// Make a ``blocking`` helper method to async-ify them
JSONRPC.prototype.blocking = function blocking(func) {
    return function blocked() {
        var args = Array.prototype.slice.call(arguments, 0, arguments.length-1);
        var callback = arguments[arguments.length-1];
        var err, res;
        try {
            res = func.apply(this, args);
        } catch(e) {
            err = e; // Doesn't throw because it's the only way to return an error with sync methods
        }
        callback(err, res);
    };
};

// Cleanly shut down the JSONRPC server
JSONRPC.prototype.shutdown = function shutdown(done) {
    var closed = 0;
    var transports = this.transports;
    transports.forEach(function(transport) {
        transport.shutdown(function() {
            closed++;
            if(closed === transports.length && typeof done === 'function') done();
        });
    });
};

// Export the server constructor
module.exports = JSONRPC;
