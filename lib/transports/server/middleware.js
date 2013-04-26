var util = require('util');
var EventEmitter = require('events').EventEmitter;

// Connect/Express middleware style JSON-RPC server transport
// Let's you have a hybrid Connect/Express server that also performs JSON-RPC
// on a particular path. Still done as an instance so you can conceivably have
// multiple JSON-RPC servers on a single Connect/Express server.
function MiddlewareTransport(config) {
    // Initialize the EventEmitter for this object
    EventEmitter.call(this);

    // Make sure the config object exists, the handler function exists,
    // and the Access-Control-Allow-Origin header is properly set. Also
    // allow the user to provide a reference to the underlying HTTP server
    // so the ``shutdown`` method can work as expected, if desired.
    config = config || {};
    this.handler = function fakeHandler(json, next) { next({}); };
    this.acao = config.acao ? config.acao : "*";
    this.server = config.server || null;
    this.middleware = this.requestHandler.bind(this);

    return this;
}

// Attach the EventEmitter prototype to the prototype chain
util.inherits(MiddlewareTransport, EventEmitter);

// The ``requestHandler`` method gets the request and response objects, and passes
// the request body and the bound responseHandler to the JSON-RPC hander function
MiddlewareTransport.prototype.requestHandler = function requestHandler(req, res) {
    // All requests are assumed to be "Express-like" and have the bodyParser run
    // before it. Express doesn't have a good way (that I'm aware of) to specify
    // "run this middleware if it hasn't already been run".
    this.emit('message', req.body);
    this.handler(req.body, this.responseHandler.bind(this, res));
};

// The ``responseHandler`` method takes the output object and sends it to the client
MiddlewareTransport.prototype.responseHandler = function responseHandler(res, retObj) {
    var outString = JSON.stringify(retObj);
    res.writeHead(retObj.error? 500:200, {
        "Access-Control-Allow-Origin": this.acao,
        "Content-Length": Buffer.byteLength(outString, 'utf8'),
        "Content-Type": "application/json;charset=utf-8"
    });
    res.end(outString);
};

// If the user defined the server in the config, the ``shutdown`` method will
// tell the server to shut down. Likely, when a JSON-RPC server is used as a
// middleware, this will not be done, but for API consistency's sake, it could.
MiddlewareTransport.prototype.shutdown = function shutdown(done) {
    if(this.server) {
        this.emit('shutdown');
        this.server.close(done);
    } else {
        if(done instanceof Function) done();
    }
};

// Export the Server Middleware Transport
module.exports = MiddlewareTransport;
