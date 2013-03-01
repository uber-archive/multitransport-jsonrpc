var net = require('net');
var util = require('util');
var EventEmitter = require('events').EventEmitter;

require('buffertools');

// The Server TCP Transport constructor function
function TcpTransport(port, config) {
    // Initialize the EventEmitter for this object
    EventEmitter.call(this);

    // Fix config property references if no config provided
    config = config || {};

    // If the server retries count is a number, establish the number of times it has currently retried to zero
    // and make sure there is a retry interval
    if(config.retries/1 === config.retries) {
        config.retry = 0;
        config.retryInterval = config.retryInterval || 250;
    }

    // The fake handler guarantees that V8 doesn't subclass the transport when the user's handler is attached
    this.handler = function fakeHandler(json, next) { next({}); };
    this.port = port;

    this.server = net.createServer(function(con) {
        this.emit('connection', con);
        // For each connection establish a buffer to put UTF8 text into
        var buffer = new Buffer('');
        con.on('data', function(data) {
            buffer = buffer.concat(data);
            // Each time the buffer is added to, check for message delimiters (zero byte vals)
            var nullSpot = buffer.indexOf('\0');
            while(nullSpot !== -1) {
                // While there are still message delimiters, parse each message and pass it to the handler, along with the handler callback
                var previous = buffer.toString('utf8', 0, nullSpot);
                var jsonObj;
                try {
                    jsonObj = JSON.parse(previous);
                } catch(e) {
                    // If the object is bad, we just pass in an undefined value and let the JSON-RPC handler deal with it
                }
                this.emit('message', jsonObj);
                this.handler(jsonObj, this.handlerCallback.bind(this, con));
                buffer = buffer.slice(nullSpot+1);
                nullSpot = buffer.indexOf('\0');
            }
        }.bind(this));
        con.on('end', function() {
            this.emit('closedConnection', con);
            // When the connection for a client dies, make sure the handlerCallbacks don't try to use it
            con = null;
        });
    }.bind(this));

    // Shorthand for registering a listening callback handler
    this.server.on('listening', function() {
        // Reset the retry counter on a successful connection
        config.retry = 0;
        this.emit('listening');
    }.bind(this));
    this.server.listen(port);

    // Any time the server encounters an error, check it here.
    // Right now it only handles errors when trying to start the server
    this.server.on('error', function(e) {
        if(e.code === 'EADDRINUSE') {
            // If something else has the desired port
            if(config.retries && config.retry < config.retries) {
                this.emit('retry');
                // And we're allowed to retry
                config.retry++;
                // Wait a bit and retry
                setTimeout(function() {
                    this.server.listen(port);
                }.bind(this), config.retryInterval);
            } else {
                // Or bitch about it
                this.emit('error', e);
            }
        } else {
           // Some unhandled error
           this.emit('error', e);
        }
    }.bind(this));

    // A simple flag to make sure calling ``shutdown`` after the server has already been shutdown doesn't crash Node
    this.server.on('close', function() {
        this.emit('shutdown');
        this.notClosed = false;
    }.bind(this));
    this.notClosed = true;

    return this;
};

// Attach the EventEmitter prototype into the prototype chain
util.inherits(TcpTransport, EventEmitter);

// An almost ridiculously simple callback handler, whenever the return object comes in, stringify it and send it down the line (along with a message delimiter
TcpTransport.prototype.handlerCallback = function handlerCallback(con, retObj) {
    if(con) con.write(JSON.stringify(retObj) + '\0');
};

// When asked to shutdown the server, shut it down
TcpTransport.prototype.shutdown = function shutdown(done) {
    if(this.server && this.notClosed) this.server.close(done);
};

// Export the Server TCP Transport
module.exports = TcpTransport;
