var net = require('net');
var util = require('util');
var EventEmitter = require('events').EventEmitter;
var shared = require('../shared/tcp');

// Client Transport's data handling function, bound to the TcpTransport
// instance when attached to the data event handler
function onDataCallback(message) {
    if(message && this.requests[message.id]) {
        this.requests[message.id].callback(message);
        delete this.requests[message.id];
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
        this.retry++;
        // At the interval specified by the user, attempt to reestablish the
        // connection
        var reconnect = function reconnect() {
            // Set the connection reference to the new connection
            this.con = net.connect({
                host: this.server,
                port: this.port
            }, function() {
                // Clear the reconnect interval if successfully reconnected
                if(this.reconnectInterval) clearInterval(this.reconnectInterval);
                if(this.stopBufferingAfter) {
                    clearTimeout(this.stopBufferingTimeout);
                    this.request = this._request || this.request;
                }
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
                    Object.keys(oldReqs).forEach(function(key) {
                        this.request(oldReqs[key].body, oldReqs[key].callback);
                    }.bind(this));
                }.bind(this));
            }.bind(this));
            // Reconnect the data and end event handlers to the new connection object
            this.con.on('data', shared.createDataHandler(this, onDataCallback.bind(this)));
            this.con.on('end', onEnd.bind(this));
            this.con.on('error', function() {
                this.con.destroy();
            }.bind(this));
        };
        // If this is the first try, attempt to reconnect immediately
        if(this.retry === 1) reconnect.call(this);
        if(this.stopBufferingAfter) this.stopBufferingTimeout = setTimeout(this.stopBuffering.bind(this), this.stopBufferingAfter);
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
    this.retries = config.retries || Infinity;
    this.retry = 0;
    this.retryInterval = config.retryInterval || 250;
    this.stopBufferingAfter = config.stopBufferingAfter || 0;
    this.stopBufferingTimeout = null;
    this.reconnectInterval = null;

    // Set up the server connection and request-handling properties
    this.server = server;
    this.port = port;
    this.requests = {};

    // Set up the garbage collector for requests that never receive a response
    // and build the buffer
    this.timeout = config.timeout || 30*1000;
    this.sweepInterval = setInterval(this.sweep.bind(this), this.timeout);

    // Establish a connection to the server
    this.con = net.connect({
        host: this.server,
        port: this.port
    });

    // And handle incoming data and connection closing
    this.con.on('data', shared.createDataHandler(this, onDataCallback.bind(this)));
    this.con.on('end', onEnd.bind(this));
    this.con.on('error', function() {
        this.con.destroy();
        onEnd.call(this);
    }.bind(this));
    this.on('error', function() {
        // Shared TCP code failed to parse a message, which means corrupt data from the server
        // Emit the 'babel' event and how many requests are being retried
        this.emit('babel', this.requests.length);
        this.con.destroy();
    }.bind(this));

    return this;
}

// Attach the EventEmitter prototype as the TcpTransport's prototype's prototype
util.inherits(TcpTransport, EventEmitter);

TcpTransport.prototype.stopBuffering = function stopBuffering() {
    this._request = this.request;
    this.request = function fakeRequest(body, callback) {
        callback(new Error('Connection Unavailable'));
    };
};

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
    if(this.con) this.con.write(shared.formatMessage(body, this));
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
