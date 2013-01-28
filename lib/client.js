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
// * requestBlock
// * register
//
// The *request* and *requestBlock* functions are the ones actually used to
// call the JSON-RPC server, and the *register* function constructs the expected
// function names to be used by the developer using this JSON-RPC client.

// The JSONRPC constructor *must* receive a server URL on initialization
function JSONRPC(serverURL, options) {
	// ### The *request* function
	// is a non-blocking function that takes an arbitrary number of arguments,
	// where the first argument is the remote method name to execute, the last
	// argument is the callback function to execute when the server returns its
	// results, and all of the arguments in between are the values passed to the
	// remote method.
	this.request = function() {
		var method = arguments[0];
		var responseHandler = arguments[arguments.length-1];
		var params = [];
		// The remaining arguments are copied to an Array object because not
		// all JSON objects know how to "stringify" an Arguments object (they
		// are not exactly the same thing in Javascript)
		for(var i = 1; i < arguments.length-1; i++) {
			params[i-1] = arguments[i];
		}
		// The *contents* variable contains the JSON-RPC 1.0 POST string. This
		// implementation does not need the *id* parameter to distinguish one
		// server response from another, so an untracked random number is passed
		// in as a placeholder
		var contents = JSON.stringify({
			method: method,
			params: params,
			id: Math.random()
		});
		// Creating the XMLHttpRequest to POST the request to the server
		var req = new XMLHttpRequest();
		req.open("POST", serverURL, true);
		// Fairly simplistic XMLHttpRequest handler either returns the JSON-RPC
		// object given by the server or states that it could not communicate
		// with the server.
		req.onreadystatechange = function() {
			// Fully loaded server response now
			if(req.readyState == 4) {
				// If it executed successfully or if the server reports an
				// internal server error, parse the returned JSON and call the
				// provided callback with the JSON-RPC object (minus the *id*)
				if(req.status == 200 || req.status == 500) {
					var myResponse;
					try { 
						myResponse = JSON.parse(req.responseText);
					} catch(ex) {
						if(responseHandler instanceof Function) {
							responseHandler(new Error("Server did not return valid JSON-RPC response: " + req.responseText));
						}
					}
					if(myResponse.error) {
						if(myResponse.error.message) { return responseHandler(new Error(myResponse.error.message)); }
						else  if(responseHandler instanceof Function) { return responseHandler(new Error(myResponse.error)); }
					}
					if(responseHandler instanceof Function) {
						responseHandler(myResponse.result);
					}
				// If anything else happened, provide a generic error message
				} else {
					if(responseHandler instanceof Function) {
						responseHandler(new Error("Status " + req.status +
							": Could not communicate with server."));
					}
				}
			}
		};
		// These request headers are required to properly communicate the type
		// of data being POSTed, as by default XMLHttpRequest will indicate the
		// data is an HTML FORM.
		req.setRequestHeader('Content-Length', contents.length);
		req.setRequestHeader('Content-Type', 'application/json');
		// Finally execute the request now that the *plan* is complete
		req.send(contents);
	};
	// ### The *requestBlock* function
	// is a *classic* blocking function that will not return until the server
	// has finished responding. Since this blocks all Javascript, and in some
	// instances the web browser itself, from executing, this is definitely a
	// **bad** idea to use most of the time. It can be a useful development tool
	// while working out an algorithm for those who are not used to
	// [Continuation-Passing Style](http://en.wikipedia.org/wiki/Continuation-passing_style)
	// functions, and is probably fine for calls where the JSON-RPC server is on
	// the *localhost* relative to the client (as a convenient, albeit bulky, IPC)
	this.requestBlock = function() {
		var method = arguments[0];
		var params = [];
		// Similarly to the *request* method, the arguments to be passed to the
		// JSON-RPC server must be copied into an Array because not every JSON
		// object can convert the Arguments object type
		for(var i = 1; i < arguments.length; i++) {
			params[i-1] = arguments[i];
		}
		var contents = JSON.stringify({
			method: method,
			params: params,
			id: Math.random()
		});
		// The XMLHttpRequest call is very similar to the *request* function's
		// call, but, as it is a blocking call this time, executes the handler
		// in-line below *req.send()*.
		var req = new XMLHttpRequest();
		req.open("POST", serverURL, false);
		req.setRequestHeader('Content-Length', contents.length);
		req.setRequestHeader('Content-Type', 'application/json');
		req.send(contents);
		if(req.status == 200 || req.status == 500) { //Executed successfully, or function failed
			try {
				var myResponse = JSON.parse(req.responseText);
			} catch (ex){
				throw new Error("Server did not return valid JSON-RPC response.");
			}
			// The one true advantage of the *requestBlock* over *request* is
			// that errors can be *throw*n, and only the JSON-RPC response data
			// (the *result*) needs to be *return*ed, so functions using this
			// code path will look much nicer.
			if(myResponse.error) {
				if(myResponse.error.message) {
					throw new Error(myResponse.error.message);
				} else {
					throw new Error(myResponse.error);
				}
			} else {
				return myResponse.result;
			}
		} else {
			console.log(serverURL);
			console.log(contents);
			console.log(JSON.stringify(req));
			throw new Error("Could not communicate with server.");
		}
	};
	// ### The *register* function
	// is a simple blocking function that takes a method name or array of
	// method names and directly modifies the 
	this.register = function(method) {
		var self = this;
		// The *singleReg* function is an internally private function to perform
		// a single registration of a remote JSON-RPC method with this object.
		// It does no validation to see if the specified method exists on the
		// server as the JSON-RPC 1.0 specification provides no mechanism to do
		// so. (*Note:* Neither does the JSON-RPC 2.0 specification, however,
		// but the newer spec allows for extensions, and some discussion has
		// begun to create such an extension, but this is a low priority.)
		var singleReg = function(method) {
			// Two anonymous functions are attached to the Object, one named the
			// same as the provided method name, and the other with *Block*
			// added to the end, to distinguish between the two.
			self[method] = function() {
				// These methods simply copy their given arguments and pass them
				// along to their respective server calling functions. Again,
				// because the Javascript Arguments object was designed for
				// performance and not convenience, all of the arguments must be
				// copied into an actual Array object because it has no *push*
				// or *pop*, or any other commonly-used Array functions.
				var theArgs = [];
				for(var i in arguments) {
					theArgs[i] = arguments[i];
				}
				// Finally, the remote method name and its arguments are called
				// by the *request* function (executed through Javascript's
				// [apply](https://developer.mozilla.org/en/JavaScript/Reference/Global_Objects/function/apply)
				// function, as Javascript's *C* lineage means a "standard" call
				// cannot properly represent an arbitrary number of arguments).
				self.request.apply(self, [].concat(method, theArgs));
			};
			self[method + "Block"] = function() {
				var theArgs = []; //Copy arguments into a normal array object
				for(var i in arguments) {
					theArgs[i] = arguments[i];
				}
				return self.requestBlock.apply(self, [].concat(method, theArgs));
			};
		};
		// Now that the private *singleReg* function has been defined, check to
		// see if the developer has passed in an array of methods to register,
		// or just a single method, and invoke *singleReg* appropriately
		if(typeof(method) == "object" && method instanceof Array) {
			for(var i in method) {
				singleReg(method[i]);
			}
		} else {
			singleReg(method);
		}
	};
	// *__noSuchMethod__* will intercept a call to a nonexistent method and
	// throw a legible error in this instance.
	this.__noSuchMethod__ = function(arg) {
		throw new Error(arg + " not registered with client");
	};
	// Parse any *options* provided to the client
	// If no *options* object provided, create an empty one
	if(typeof(options) != "object") {
		options = {};
	}
	// *autoRegister* methods from the server unless explicitly told otherwise
	if(!options.hasOwnProperty("autoRegister") || options.autoRegister) {
		this.register(this.requestBlock("rpc.methodList"));
	}
	// Once the JSONRPC object has been properly initialized, return the object
	// to the developer
	return this;
}
// Finally, if the client is running in *Node.js*, add the **JSONRPC** object to
// the *exports* object, and create the *createJSONRPCclient* helper function to
// build the **JSONRPC** client
if(typeof window === 'undefined') {
	exports.JSONRPC = JSONRPC;
	exports.createJSONRPCclient = function(scope) {
		return new JSONRPC(scope);
	};
}
