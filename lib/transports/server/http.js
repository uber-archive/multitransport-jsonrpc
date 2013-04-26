var http = require('http');
var q = require('queue-flow');
var l = require('lambda-js');
var util = require('util');
var EventEmitter = require('events').EventEmitter;

// The Server HttpTransport constructor function
function HttpTransport(port, config) {
    // Initialize the EventEmitter for this object
    EventEmitter.call(this);

    // Make sure the config is addressable and add config settings
    // and a dummy handler function to the object
    config = config || {};
    this.handler = function fakeHandler(json, next) { next({}); };
    this.acao = config.acao ? config.acao : "*";
    this.port = port;

    // Construct the http server and listen on the desired port
    this.server = http.createServer(function(req, res) {
        // All requests are assumed to be POST-like and have a body
        // This first line creates an anonymous queue, and appends
        // all inputs together until the queue is closed, then returns the
        // result to the callback function
        var r = q.ns()().reduce(l('cum, cur', 'cum + cur'), function(result) {
            // The result is assumed to be JSON and is parsed and
            // passed along to the request handler, whose results are passed
            // to the responseHandler
            var json;
            try {
                json = JSON.parse(result);
            } catch(e) {
                // Literally don't need to do anything at the moment here.
            }
            this.emit('message', json, result.length);
            this.handler(json, this.responseHandler.bind(this, res));
        }.bind(this), '');
        // The queue defined above has its push and close methods bound to the
        // `data` and `end` events
        req.on('data', r.push.bind(r));
        req.on('end', r.close.bind(r));
    }.bind(this));
    this.server.on('listening', function() {
        this.emit('listening');
    }.bind(this));
    this.server.listen(this.port);

    return this;
}

// Attach the EventEmitter prototype to the prototype chain
util.inherits(HttpTransport, EventEmitter);

// The responseHandler gets a response object and the return object, stringifies
// the return object and sends it down to the client with the appropriate HTTP
// headers
HttpTransport.prototype.responseHandler = function responseHandler(res, retObj) {
    var outString = JSON.stringify(retObj);
    res.writeHead(retObj.error?500:200, {
        "Access-Control-Allow-Origin": this.acao,
        "Content-Length": Buffer.byteLength(outString, 'utf8'),
        "Content-Type": "application/json;charset=utf-8"
    });
    res.end(outString);
};

// A simple wrapper for closing the HTTP server (so the TCP
// and HTTP transports have a more uniform API)
HttpTransport.prototype.shutdown = function shutdown(done) {
    this.emit('shutdown');
    this.server.close(done);
};

// Export the Server HTTP transport
module.exports = HttpTransport;
