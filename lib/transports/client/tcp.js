var net = require('net');

// Client Transport's data handling function, bound to the TcpTransport
// instance when attached to the data event handler
function onData(data) {
    // Since this transport is assumed to be used for JSON-RPC, all data
    // is assumed to be UTF8.
    this.buffer += data.toString();
    // The core of the algorithm is to find null terminals in the data stream
    // that demark different response messages. This is done with a while loop
    // because a single chunk of data could conceivably contain more than one
    // message, or it could contain only part of one message
    var nullSpot = this.buffer.search(/\0/);
    while(nullSpot !== -1) {
        // The previous variable should house a complete message, while the
        // next is everything after that message
        var previous = this.buffer.substring(0, nullSpot);
        var next = this.buffer.substring(nullSpot+1);
        // Try to parse the message, but it doesn't matter if it fails
        var json = {};
        try {
            json = JSON.parse(previous);
        } catch(e) {
            // Invalid responses are simply ignored
        }
        // If this message was expected, return the json object to the
        // callback, then delete it
        if(this.requests[json.id]) this.requests[json.id].callback(json);
        delete this.requests[json.id];
        // Make the buffer the remaining chunk of data and check for null
        // terminators again
        this.buffer = next;
        nullSpot = this.buffer.search(/\0/);
    }
}

// The handler for a connection close. Will try to reconnect if configured
// to do so and it hasn't tried "too much," otherwise mark the connection
// dead.
function onEnd() {
    // Attempting to reconnect
    if(this.config.retries && this.config.retry < this.config.retries) {
        // When reconnecting, all previous buffered data is invalid, so wipe
        // it out, and then increment the retry flag
        this.buffer = '';
        this.config.retry++;
        // At the interval specified by the user, attempt to reestablish the
        // connection
        setTimeout(function() {
            // Set the connection reference to the new connection
            this.con = net.connect({
                host: this.server,
                port: this.port
            }, function() {
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
        }.bind(this), this.config.retryInterval);
    } else {
        // Too many tries, or not allowed to retry, mark the connection as dead
        this.con = undefined;
    }
}

// The Client TcpTransport constructor function
function TcpTransport(server, port, config) {
    // Attach the config object (or an empty object if not defined, as well
    // as the server and port
    this.config = config = config || {};
    this.server = server;
    this.port = port;
    this.requests = {};
    // Set up the garbage collector for requests that never receive a response
    // and build the buffer
    this.timeout = config.timeout || 2*60*1000;
    this.sweepInterval = setInterval(this.sweep.bind(this), this.timeout);
    this.buffer = '';

    // If the user wants to retry the connection to the server, make sure the
    // related properties are set to reasonable values
    if(config.retries) {
        config.retry = 0;
        config.retryInterval = config.retryInterval || 250;
    }

    // Establish a connection to the server
    this.con = net.connect({
        host: this.server,
        port: this.port
    });

    // And handle incoming data and connection closing
    this.con.on('data', onData.bind(this));
    this.con.on('end', onEnd.bind(this));

    return this;
}

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
    for(var key in this.requests) {
        if(this.requests[key].timestamp && this.requests[key].timestamp + this.timeout < now) delete this.requests[key];
    }
};

// When shutting down the client connection, the sweep is turned off, the
// requests are removed, the number of allowed retries is set to zero, the
// connection is ended, and a callback, if any, is called.
TcpTransport.prototype.shutdown = function shutdown(done) {
    clearInterval(this.sweepInterval);
    this.requests = {};
    this.config.retries = 0;
    if(this.con) this.con.end();
    if(done instanceof Function) done();
};

// Export the client TcpTransport
module.exports = TcpTransport;
