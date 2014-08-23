var http = require('http');
var q = require('queue-flow');
var l = require('lambda-js');
var util = require('util');
var EventEmitter = require('events').EventEmitter;

// The Client HTTP Transport constructor function
function HttpTransport(server, port, config) {
    // Initialize the EventEmitter
    EventEmitter.call(this);
    // Make sure the config is a valid object
    // and set the necessary elements 
    config = config || {};
    this.path = config.path || '/';
    this.headers = config.headers || {};
    this.server = server;
    this.port = port;

    return this;
}

// Attach the EventEmitter prototype into the prototype chain
util.inherits(HttpTransport, EventEmitter);

// For the HTTP client, the meat of the transport lives in its request
// method, since HTTP requests are separate connections
HttpTransport.prototype.request = function request(body, callback) {
    // Create a request object for the server, using the POST method
    var req = http.request({
        hostname: this.server,
        port: this.port,
        path: this.path,
        headers: this.headers,
        method: 'POST'
    }, function(res) {
        // This one liner creates an anonymous queue assigned to `r`
        // that concatenates all input together until the queue is
        // closed and then returns the result to the callback
        var r = q.ns()().reduce(l('cum, cur', 'cum + cur'), function(result) {
            // The callback assumes the input is JSON and parses it
            // and sends it to the request's callback function. If
            // its not valid JSON, it'll simply send it `undefined`.
            var json;
            try {
                json = JSON.parse(result);
            } catch(e) {
            }
            this.emit('message', json, result.length);
            callback(json);
        }.bind(this), '');
        // The queue's push and close methods are attached to the
        // `data` and `end` events of the request
        res.on('data', r.push.bind(r));
        res.on('end', r.close.bind(r));
    }.bind(this));

    // The request body is sent to the server as JSON
    req.setHeader('Content-Type', 'application/json');
    req.write(JSON.stringify(body));
    req.end();
};

// Literally nothing needed for the HTTP client. Just call
// the callback for API consistency
HttpTransport.prototype.shutdown = function shutdown(done) {
    this.emit('shutdown');
    if(done instanceof Function) done();
};

// Export the Client HTTP Transport
module.exports = HttpTransport;
