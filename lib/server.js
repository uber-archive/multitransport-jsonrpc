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
function JSONRPC(scope) {
	var self = this;
	// ### The *handleJSON* function
	// makes up the majority of the JSON-RPC server logic, handling the requests
	// from clients, passing the call to the correct function, catching any
	// errors the function may throw, and calling the function to return the
	// results back to the client.
	this.handleJSON = function(request, response) {
		var DATA = "";
		// In order to handle uploaded data from the client, event handlers for
		// each received block of data and the end of the POST block must exist.
		// As JSON-RPC is a text-based protocol, utf8 is the encoding method,
		// and simply each *chunk* of data is concatenated onto a private
		// variable. The rest of the *handleJSON* function is defined in the
		// *end* event handler
		request.setEncoding('utf8');
		request.addListener('data', function(chunk) {
			DATA += chunk;
		});
		request.addListener('end', function() {
			// Once the data has been loaded, it is parsed into a JSON object or
			// reverted to an empty string (to indicate that an error message
			// should be returned).
			var data = "";
			try {
				data = JSON.parse(DATA);
			} catch(e) {
				data = "";
			}
			// Assuming the JSON object was built, we incrementally validate it
			// to determine the exact call mechanism to be used.
			if(data instanceof Object) {
				if(data.method) {
					var result = "";
					// If the method is defined in the scope and is not marked as a
					// blocking function, then a callback must be defined for
					// the function. The callback takes two parameters: the
					// *result* of the function, and an *error* message.
					if(scope[data.method] && !scope[data.method].blocking) {
						var callback = function(result) {
							var outObj = {};
							if(data.id) {
								outObj.id = data.id;
							}
							if(result instanceof Error) {
								// TODO Add a config check for debug output
								console.log(JSON.stringify(result));
								outObj.result = null;
								outObj.error = {message: result.message};
							} else {
								outObj.error = null;
								outObj.result = result;
							}
							self.returnVal(response, outObj);
						};
						// This *try-catch* block seems pointless, since it is
						// not possible to *catch* an error further into a
						// *CPS* stack, but if the (normally short) blocking
						// portion of the call throws an error, this will
						// prevent the *Node.js* server from crashing.
						try {
							if(data.params && data.params instanceof Array) {
								data.params.push(callback);
								scope[data.method].apply(scope, data.params);
							} else if(data.params) {
								scope[data.method].apply(scope, [data.params, callback]);
							} else {
								scope[data.method].apply(scope, [callback]);
							}
						} catch(e) {
							var outErr = {};
							if(e.message) {
								outErr.message = e.message;
							} else {
								outErr.message = e;
							}
							if(data.id) {
								self.returnVal(response, {result:null, error:outErr, id:data.id});
							} else {
								self.returnVal(response, {result:null, error:outErr});
							}
						}
					// A blocking function will *return* a value immediately or
					// *throw* an error, so this portion consists only of a
					// *try-catch* block, but is otherwise identical to the
					// above nonblocking code.
					} else if(scope[data.method] && scope[data.method].blocking) {
						try {
							if(data.params && data.params instanceof Array) {
								result = scope[data.method].apply(scope, data.params);
							} else if(data.params) {
								result = scope[data.method].apply(scope, [data.params]);
							} else {
								result = scope[data.method].apply(scope, []);
							}
							if(data.id) {
								self.returnVal(response, {result:result, error:null, id:data.id});
							} else {
								self.returnVal(response, {result:result, error:null});
							}
						} catch(e) {
							var outErr = {};
							if(e.message) {
								outErr.message = e.message;
							} else {
								outErr.message = e;
							}
							if(data.id) {
								self.returnVal(response, {result:null, error:outErr, id:data.id});
							} else {
								self.returnVal(response, {result:null, error:outErr});
							}
						}
					// If the interpretation of the POSTed data fails at any
					// point, be sure to return a meaningful error message.
					} else {
						self.returnVal(response, {result:null, error:{message:"Requested method does not exist."}, id:-1});
					}
				} else {
					// TODO Add a config check for debug output
					console.log("Method not found: data = [" + JSON.stringify(data) + "]");
					self.returnVal(response, {result:null, error:{message:"Did not receive valid JSON-RPC data."}, id:-1});
				}
			} else {
				// TODO Add a config check for debug output
				console.log("Data is not an object: data = [" + JSON.stringify(data) + "]");
				self.returnVal(response, {result:null, error:{message:"Did not receive valid JSON-RPC data."}, id:-1});
			}
		});
	};
	// ### The *returnVal* function
	// takes the *response* object and the JSON-RPC return object (*retVal*)
	// and constructs the output string to return to the client and any
	// necessary HTTP headers. The *Access-Control-Allow-Origin* header is
	// necessary for modern versions of Firefox, however it is a completely
	// useless header in my opinion, as the client must **opt-in** to the
	// restrictions implied, and could therefore be ignored at any time. Thus,
	// it has been set to allow all origin requests (since any restrictions
	// would need to be enforced elsewhere in the server source code).
	this.returnVal = function(response, retVal) {
		if(retVal.id || this.debug) {
			var outString = JSON.stringify(retVal);
			response.writeHead(retVal.error?500:200, {
				"Access-Control-Allow-Origin": "*",
				"Content-Length": Buffer.byteLength(outString, 'utf8'),
				"Content-Type": "application/json;charset=utf-8"
			});
			response.end(outString);
		} else {
			response.end();
		}
	};
	// ### The *setScope* function
	// simply allows the developer to change the scope of a JSON-RPC server
	// after it has been created. This could be useful if each user was given
	// its own JSON-RPC server object, and login credentials determined which
	// RPC methods are allowed to the user, but this would produce odd
	// "method not found" error messages and ought to live higher in the "stack"
	this.setScope = function(newScope) { scope = newScope; };
	// ### The *register* function
	// allows one to attach a function to the current scope after the scope has
	// been attached to the JSON-RPC server, for similar possible shenanigans as
	// described above. This method in particular, though, by attaching new
	// functions to the current scope, could be used for caching purposes or
	// self-modifying code that rewrites its own definition.
	this.register = function(methodName, method) {
		if(!scope || typeof(scope) != "object") {
			scope = {};
		}
		scope[methodName] = method;
	};
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
	return this;
}
// ## The *blocking* function
// attaches the *blocking* attribute to any function passed to it, and then
// *return*s that function. This is used in the convention:
//     var myRPCfunc = blocking(function() { ... });
// This allows inline declaration of blocking RPC functions and produces a
// naturally-self-documenting source
function blocking(func) {
	func.blocking = true;
	return func;
}

// Finally, the *JSONRPC* constructor, the *nonblocking* function, and a
// *createJSONRPCserver* helper function are attached to the *exports* object
// for other *Node.js* code to use.
//
// Until WebSockets are finalized, there is no need to get this working in web
// browsers.
exports.JSONRPC = JSONRPC;
exports.blocking = blocking;
exports.createJSONRPCserver = function(scope) {
	return new JSONRPC(scope);
};
