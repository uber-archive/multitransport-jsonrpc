// # The Agrosica JSON-RPC Server
// Designed to work in *Node.js*. There are a few Node.js JSON-RPC servers on
// [GitHub](http://www.github.com) already, but all required a fairly extensive
// set of modifications to the RPC methods so they didn't look *natural*, and
// therefore reusable internally, if desired, while this server makes that its
// primary design goal. This JSON-RPC client is currently JSON-RPC 1.0 compliant.
// Will add 2.0 compatibility if this is determined to be important.

// ## The JSONRPC constructor
// Each JSON-RPC object is tied to a *scope*, an object containing functions to
// call. If not passed an explicit scope, *Node.js*' *root* scope will be used.
// Also, unlike the Javascript running in web browsers, functions not explicity
// assigned to a scope are attached to attached to the anonymous scope block only
// and cannot be accessed even from the *root* scope.
function JSONRPC(transport, scope) {
    this.scope = scope;
    
    // The actual object initialization occurs here. If the *scope* is not
    // defined, the *root* scope is used, and then the object is returned to
    // the developer.
    if(!scope || typeof(scope) != "object") {
        scope = root;
    }
    // ### The *rpc.methodList* method
    // is a JSON-RPC extension that returns a list of all methods in the scope
    scope['rpc.methodList'] = function(callback) {
        var methods = [];
        for(var i in scope) {
            methods.push(i);
        }
        callback(methods);
    };

    this.transport.handler = this.handleJSON.bind(this);

    return this;
}

// ### The *handleJSON* function
// makes up the majority of the JSON-RPC server logic, handling the requests
// from clients, passing the call to the correct function, catching any
// errors the function may throw, and calling the function to return the
// results back to the client.
JSONRPC.prototype.handleJSON = function handleJSON(data, callback) {
    if(data instanceof Object) {
        if(data.method) {
            // If the method is defined in the scope and is not marked as a
            // blocking function, then a callback must be defined for
            // the function. The callback takes two parameters: the
            // *result* of the function, and an *error* message.
            var arglen = data.params && data.params instanceof Array ? data.params.length : data.params ? 1 : 0;
            if(this.scope[data.method] && !(this.scope[data.method].length == arglen || this.scope[data.method].blocking)) {
                var next = function(result) {
                    var outObj = {};
                    if(data.id) {
                        outObj.id = data.id;
                    }
                    if(result instanceof Error) {
                        outObj.result = null;
                        outObj.error = {message: result.message};
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
                // This *try-catch* block seems pointless, since it is
                // not possible to *catch* an error further into a
                // *CPS* stack, but if the (normally short) blocking
                // portion of the call throws an error, this will
                // prevent the *Node.js* server from crashing.
                try {
                    this.scope[data.method].apply(this.scope, data.params);
                } catch(e) {
                    var outErr = {};
                    outErr.message = e.message ? e.message : "";
                    var outObj = { result: null, error: outErr };
                    if(data.id) outObj.id = data.id;
                    callback(outObj);
                }
                // A blocking function will *return* a value immediately or
                // *throw* an error, so this portion consists only of a
                // *try-catch* block, but is otherwise identical to the
                // above nonblocking code.
            } else if(this.scope[data.method] && this.scope[data.method].blocking) {
                if(data.params && !(data.params instanceof Array)) {
                    data.params = [data.params];
                } else if(!data.params) {
                    data.params = [];
                }
                try {
                    var outObj = { result: this.scope[data.method].apply(this.scope, data.params), error: null };
                    if(data.id) outObj.id = data.id;
                    callback(outObj);
                } catch(e) {
                    var outErr = { message: e.message ? e.message : "" };
                    var outObj = { result: null, error: outErr };
                    if(data.id) outObj.id = data.id;
                    callback(outObj);
                }
                // If the interpretation of the POSTed data fails at any
                // point, be sure to return a meaningful error message.
            } else {
                callback({result:null, error:{message:"Requested method does not exist."}, id:-1});
            }
        } else {
            callback({result:null, error:{message:"Did not receive valid JSON-RPC data."}, id:-1});
        }
    } else {
        callback({result:null, error:{message:"Did not receive valid JSON-RPC data."}, id:-1});
    }
};

// ### The *register* function
// allows one to attach a function to the current scope after the scope has
// been attached to the JSON-RPC server, for similar possible shenanigans as
// described above. This method in particular, though, by attaching new
// functions to the current scope, could be used for caching purposes or
// self-modifying code that rewrites its own definition.
JSONRPC.prototype.register = function(methodName, method) {
    if(!this.scope || typeof(this.scope) != "object") {
        this.scope = {};
    }
    this.scope[methodName] = method;
};

// Export the server constructor
module.exports = JSONRPC;
// Make a ``blocking`` helper method to identify blocking methods as blocking (if the heuristic fails)
module.exports.blocking = function blocking(func) {
    func.blocking = true;
    return func;
};