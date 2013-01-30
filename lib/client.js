// # The Agrosica JSON-RPC Client
// Designed to work in the browser and in *Node.js*.
// This JSON-RPC client is currently JSON-RPC 1.0 compliant.
// Will add 2.0 compatibility if this is determined to be important.

// If running in *Node.js*, load the XMLHttpRequest object
if(typeof window === 'undefined') {
	var XMLHttpRequest = require('xmlhttprequest').XMLHttpRequest;
}

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
function JSONRPC(transport, options) {
    this.transport = transport;
	// Parse any *options* provided to the client
	// If no *options* object provided, create an empty one
	if(typeof(options) != "object") {
		options = {};
	}
	// *autoRegister* methods from the server unless explicitly told otherwise
	if(!options.hasOwnProperty("autoRegister") || options.autoRegister) {
        this.request('rpc.methodList', [], function(err, result) {
            if(!err) this.register(result);
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
	var contents = JSON.stringify({
		method: method,
		params: args,
		id: Math.random()
	});
    this.transport.request(contents, function(responseText) {
		var myResponse;
		try { 
			myResponse = JSON.parse(responseText);
		} catch(ex) {
			if(callback instanceof Function) {
				callback(new Error("Server did not return valid JSON-RPC response: " + responseText));
			}
		}
        if(callback instanceof Function) {
    		if(myResponse.error) {
	    		if(myResponse.error.message) {
                    callback(new Error(myResponse.error.message));
                } else {
                    callback(new Error(myResponse.error));
                }
		    } else {
                callback(undefined, myResponse.result);
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
		this[method] = function() {
			var theArgs = [];
            for(var i = 0; i < arguments.length-1; i++) {
                theArgs[i] = arguments[i];
            }
            var callback = arguments[arguments.length-1];
            this.request(method, theArgs, callback);
		};
	}.bind(this));
};

exports = JSONRPC;
