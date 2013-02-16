var net = require('net');

function TcpTransport(port, config) {
    // Fix config property references if no config provided
    config = config || {};

    // If the server retry count is a number, establish the number of times it has currently retried to zero
    // and make sure there is a retry interval
    if(config.retry/1 === config.retry) {
        config.retries = 0;
        config.retryInterval = config.retryInterval || 250;
    }

    // The fake handler guarantees that V8 doesn't subclass the transport when the user's handler is attached
    this.handler = function fakeHandler(json, next) { next({}); };
    this.port = port;

    this.server = net.createServer(function(con) {
        // For each connection establish a buffer to put UTF8 text into
        var buffer = '';
        con.on('data', function(data) {
            buffer += data.toString();
            // Each time the buffer is added to, check for message delimiters (zero byte vals)
            var nullSpot = buffer.search(/\0/);
            while(nullSpot !== -1) {
                // While there are still message delimiters, parse each message and pass it to the handler, along with the handler callback
                var previous = buffer.substring(0, nullSpot);
                var next = buffer.substring(nullSpot+1);
                var jsonObj;
                try {
                    jsonObj = JSON.parse(previous);
                } catch(e) {
                    // If the object is bad, we just pass in an undefined value and let the JSON-RPC handler deal with it
                }
                this.handler(jsonObj, this.handlerCallback.bind(this, con));
                buffer = next;
                nullSpot = buffer.search(/\0/);
            }
        }.bind(this));
        con.on('end', function() {
            // When the connection for a client dies, make sure the handlerCallbacks don't try to use it
            con = null;
        });
    }.bind(this));

    // Shorthand for registering a listening callback handler
    if(config.onListen && config.onListen instanceof Function) this.server.on('listening', config.onListen);
    this.server.listen(port);

    // Any time the server encounters an error, check it here.
    // Right now it only handles errors when trying to start the server
    this.server.on('error', function(e) {
        if(e.code === 'EADDRINUSE') {
            // If something else has the desired port
            if(config.retry && config.retries < config.retry) {
                // And we're allowed to retry
                config.retries++;
                // Wait a bit and retry
                setTimeout(function() {
                    this.server.listen(port);
                }.bind(this), config.retryInterval);
            } else {
                // Or bitch about it
                console.err('Could not start server, address in use!');
            }
        } else {
           // Some unhandled error
           console.log("Ahh! What's happening!?");
           console.log(e);
        }
    }.bind(this));

    // A simple flag to make sure calling ``shutdown`` after the server has already been shutdown doesn't crash Node
    this.server.on('close', function() {
        this.notClosed = false;
    }.bind(this));
    this.notClosed = true;

    return this;
};

// An almost ridiculously simple callback handler, whenever the return object comes in, stringify it and send it down the line (along with a message delimiter
TcpTransport.prototype.handlerCallback = function handlerCallback(con, retObj) {
    if(con) con.write(JSON.stringify(retObj) + '\0');
};

// When asked to shutdown the server, shut it down
TcpTransport.prototype.shutdown = function shutdown(done) {
    if(this.server && this.notClosed) this.server.close(done);
};

module.exports = TcpTransport;
