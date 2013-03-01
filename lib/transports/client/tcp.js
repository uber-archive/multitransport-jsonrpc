var net = require('net');
var util = require('util');
var EventEmitter = require('events').EventEmitter;

require('buffertools');

// Client Transport's data handling function, bound to the TcpTransport
// instance when attached to the data event handler
function onData(data) {
    // Since this transport is assumed to be used for JSON-RPC, all data
    // is assumed to be UTF8.
    this.buffer = this.buffer.concat(data);
    // The core of the algorithm is to find null terminals in the data stream
    // that demark different response messages. This is done with a while loop
    // because a single chunk of data could conceivably contain more than one
    // message, or it could contain only part of one message
    var nullSpot = this.buffer.indexOf('\0');
    while(nullSpot !== -1) {
        // The previous variable should house a complete message, while the
        // next is everything after that message
        var previous = this.buffer.toString('utf8', 0, nullSpot);
        //var next = this.buffer.toString('utf8', nullSpot+1);
        // Try to parse the message, but it doesn't matter if it fails
        var json = {};
        try {
            json = JSON.parse(previous);
        } catch(e) {
            // Invalid responses are simply ignored
        }
        this.emit('message', json);
        // If this message was expected, return the json object to the
        // callback, then delete it
        if(this.requests[json.id]) this.requests[json.id].callback(json);
        delete this.requests[json.id];
        // Make the buffer the remaining chunk of data and check for null
        // terminators again
        this.buffer = this.buffer.slice(nullSpot + 1);
        nullSpot = this.buffer.indexOf('\0');
    }
}

// The handler for a connection close. Will try to reconnect if configured
// to do so and it hasn't tried "too much," otherwise mark the connection
// dead.
function onEnd() {
    // Attempting to reconnect
    if(this.retries && this.retry < this.retries) {
        this.emit('retry');
        // When reconnecting, all previous buffered data is invalid, so wipe
        // it out, and then increment the retry flag
        this.buffer = new Buffer('');
        this.retry++;
        // At the interval specified by the user, attempt to reestablish the
        // connection
        function reconnect() {
            // Set the connection reference to the new connection
            this.con = net.connect({
                host: this.server,
                port: this.port
            }, function() {
                // Clear the reconnect interval if successfully reconnected
                if(this.reconnectInterval) clearInterval(this.reconnectInterval);
                this.retry = 0;
                // Get the list of all pending requests, place them in a private
                // variable, and reset the requests object
                var oldReqs = this.requests;
                this.requests = {};
                // Then requeue the old requests, but only after a run through the
                // implicit event loop. Why? Because ``this.con`` won't be the
                // correct connection object until *after* this callback function
                // is called.
                process.nextTick(function() {
                    for(var key in oldReqs) {
                        this.request(oldReqs[key].body, oldReqs[key].callback);
                    }
                }.bind(this));
            }.bind(this));
            // Reconnect the data and end event handlers to the new connection object
            this.con.on('data', onData.bind(this));
            this.con.on('end', onEnd.bind(this));
            this.con.on('error', function(e) {
                this.con.destroy();
            }.bind(this));
        }
        // If this is the first try, attempt to reconnect immediately
        if(this.retry === 1) reconnect.call(this);
        this.reconnectInterval = setInterval(reconnect.bind(this), this.retryInterval);
    } else {
        // Too many tries, or not allowed to retry, mark the connection as dead
        this.emit('end');
        this.con = undefined;
    }
}

// The Client TcpTransport constructor function
function TcpTransport(server, port, config) {
    // Initialize the Node EventEmitter on this
    EventEmitter.call(this);
    // Attach the config object (or an empty object if not defined, as well
    // as the server and port
    config = config || {};
    this.retries = config.retries || 0;
    this.retry = 0;
    this.retryInterval = config.retryInterval || 250;
    this.reconnectInterval = null;

    // Set up the server connection and request-handling properties
    this.server = server;
    this.port = port;
    this.requests = {};

    // Set up the garbage collector for requests that never receive a response
    // and build the buffer
    this.timeout = config.timeout || 2*60*1000;
    this.sweepInterval = setInterval(this.sweep.bind(this), this.timeout);
    this.buffer = new Buffer('');

    // Establish a connection to the server
    this.con = net.connect({
        host: this.server,
        port: this.port
    });

    // And handle incoming data and connection closing
    this.con.on('data', onData.bind(this));
    this.con.on('end', onEnd.bind(this));
    this.con.on('error', function(e) {
        this.con.destroy();
    }.bind(this));

    return this;
}

// Attach the EventEmitter prototype as the TcpTransport's prototype's prototype
util.inherits(TcpTransport, EventEmitter);

// The request logic is relatively straightforward, given the request
// body and callback function, register the request with the requests
// object, then if there is a valid connection at the moment, send the
// request to the server with a null terminator attached. This ordering
// guarantees that requests called during a connection issue won't be
// lost while a connection is re-established.
TcpTransport.prototype.request = function request(body, callback) {
    this.requests[body.id] = {
        callback: callback,
        body: body,
        timestamp: new Date().getTime()
    };
    if(this.con) this.con.write(JSON.stringify(body) + '\0');
};

// The sweep function looks at the timestamps for each request, and any
// request that is longer lived than the timeout (default 2 min) will be
// culled and assumed lost.
TcpTransport.prototype.sweep = function sweep() {
    var now = new Date().getTime();
    var cannedRequests = {};
    for(var key in this.requests) {
        if(this.requests[key].timestamp && this.requests[key].timestamp + this.timeout < now) {
            this.requests[key].callback(new Error('Request Timed Out'));
            cannedRequests[key] = this.requests[key];
            delete this.requests[key];
        }
    }
    this.emit('sweep', cannedRequests);
};

// When shutting down the client connection, the sweep is turned off, the
// requests are removed, the number of allowed retries is set to zero, the
// connection is ended, and a callback, if any, is called.
TcpTransport.prototype.shutdown = function shutdown(done) {
    clearInterval(this.sweepInterval);
    this.requests = {};
    this.retries = 0;
    if(this.con) this.con.destroy();
    this.emit('shutdown');
    if(done instanceof Function) done();
};

// Export the client TcpTransport
module.exports = TcpTransport;
