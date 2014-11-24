var net = require('net');
var util = require('util');
var EventEmitter = require('events').EventEmitter;
var shared = require('../shared/tcp');

// Client Transport's data handling function, bound to the TcpTransport
// instance when attached to the data event handler
function onDataCallback(message) {
    if(message && this.requests[message.id]) {
        var request = this.requests[message.id];
        delete this.requests[message.id];
        request.callback(message);
    }
}

var onClose;

// At the interval specified by the user, attempt to reestablish the
// connection
var connect = function connect(toReconnect) {
    this.logger('onClose.reconnect - old con is: ' + (this.con && this.con.random));
    var oldPort = this.con && this.con.random;
    // Set the connection reference to the new connection
    if (this.con) {
        this.logger('ERRORRORO connection should not be set');
        this.con.destroy();
        this.con = null;
    }
    this.con = net.connect(this.tcpConfig, function() {
        this.logger('net.connect.callback - new con: ' + (this.con && this.con.random) + '. old con: ' + oldPort);
        // Clear the reconnect interval if successfully reconnected
        if(this.reconnectInterval) {
            clearInterval(this.reconnectInterval);
            delete this.reconnectInterval;
        }
        if(this.stopBufferingAfter) {
            clearTimeout(this.stopBufferingTimeout);
            delete this.stopBufferingTimeout;
        }
        if (this._request) {
            this.request = this._request;
            delete this._request;
        }
        this.retry = 0;
        this.reconnect++;
        if(toReconnect) {
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
        }
    }.bind(this));
    this.con.random = Math.random();
    this.logger('new.con.created - con: ' + (this.con && this.con.random));
    // Reconnect the data and end event handlers to the new connection object
    this.con.on('data', shared.createDataHandler(this, onDataCallback.bind(this)));
    this.con.on('end', function() {
        this.logger('con.end - ' + (this.con && this.con.random));
        this.con.destroy();
    }.bind(this));
    this.con.on('error', function() {
        this.logger('con.error - ' + (this.con && this.con.random));
        this.con.destroy();
    }.bind(this));
    this.con.on('close', function () {
        this.logger('con.close - ' + (this.con && this.con.random));
        if(this.con) {
            this.con.destroy();
            this.con = null;
            onClose.call(this);
        }
    }.bind(this));
};

// The handler for a connection close. Will try to reconnect if configured
// to do so and it hasn't tried "too much," otherwise mark the connection
// dead.
onClose = function onClose() {
    this.logger('onClose ' + (this.con && this.con.random));
    // Attempting to reconnect
    if(this.retries && this.retry < this.retries && this.reconnect < this.reconnects) {
        this.logger('onClose if (retries) - old con is: ' + (this.con && this.con.random));
        this.emit('retry');
        // When reconnecting, all previous buffered data is invalid, so wipe
        // it out, and then increment the retry flag
        this.retry++;
        // If this is the first try, attempt to reconnect immediately
        if(this.retry === 1) {
            this.logger('call onClose.reconnect for retry === 1 - old con: ' + (this.con && this.con.random));
            connect.call(this, true);
        }
        if(typeof(this.stopBufferingAfter) === 'number' && this.stopBufferingAfter !== 0 && !this.stopBufferingTimeout) {
            this.stopBufferingTimeout = setTimeout(this.stopBuffering.bind(this), this.stopBufferingAfter);
        }
        if(!this.reconnectInterval) {
            this.reconnectInterval = setInterval(function() {
                this.logger('call onClose.reconnect from reconnectInterval - old con: ' + (this.con && this.con.random));
                connect.call(this, true);
            }.bind(this), this.retryInterval);
        }
    } else {
        // Too many tries, or not allowed to retry, mark the connection as dead
        this.emit('end');
        this.con = undefined;
    }
};

// The Client TcpTransport constructor function
function TcpTransport(tcpConfig, config) {
    // Shim to support old-style call
    if (typeof tcpConfig === 'string') {
        tcpConfig = {
            host: arguments[0],
            port: arguments[1]
        };
        config = arguments[2];
    }
    // Initialize the Node EventEmitter on this
    EventEmitter.call(this);
    // Attach the config object (or an empty object if not defined, as well
    // as the server and port
    config = config || {};
    this.retries = config.retries || Infinity;
    this.reconnects = config.reconnects || Infinity;
    this.reconnectClearInterval = config.reconnectClearInterval || 0;
    this.retry = 0;
    this.reconnect = -1;
    this.retryInterval = config.retryInterval || 250;
    this.stopBufferingAfter = config.stopBufferingAfter || 0;
    this.stopBufferingTimeout = null;
    this.reconnectInterval = null;
    this.logger = config.logger || function() {};

    // Set up the server connection and request-handling properties
    this.tcpConfig = tcpConfig;
    this.requests = {};

    // Set up the garbage collector for requests that never receive a response
    // and build the buffer
    this.timeout = config.timeout || 30*1000;
    this.sweepIntervalMs = config.sweepIntervalMs || 1*1000;
    this.sweepInterval = setInterval(this.sweep.bind(this), this.sweepIntervalMs);

    if (this.reconnectClearInterval > 0 && this.reconnectClearInterval !== Infinity) {
        this.reconnectClearTimer = setInterval(this.clearReconnects.bind(this),
                                               this.reconnectClearInterval);
    }

    connect.call(this, false);

    return this;
}

// Attach the EventEmitter prototype as the TcpTransport's prototype's prototype
util.inherits(TcpTransport, EventEmitter);

TcpTransport.prototype.stopBuffering = function stopBuffering() {
    this.logger('Stopping the buffering of requests on ' + (this.con && this.con.random));
    this._request = this.request;
    this.request = function fakeRequest(body, callback) {
        callback({ error: 'Connection Unavailable' });
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
        timestamp: Date.now()
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
            this.requests[key].callback({ error: 'Request Timed Out' });
            cannedRequests[key] = this.requests[key];
            delete this.requests[key];
        }
    }
    this.emit('sweep', cannedRequests);
};

// The clearReconnects function periodically resets the internal counter
// of how many times we have re-established a connection to the server.
// If the connection is currently dead (undefined), it attempts a reconnect.
TcpTransport.prototype.clearReconnects = function clearReconnects() {
    this.reconnect = -1;
    if (this.con === undefined) {
        connect.call(this, true);
    }
};

// When shutting down the client connection, the sweep is turned off, the
// requests are removed, the number of allowed retries is set to zero, the
// connection is ended, and a callback, if any, is called.
TcpTransport.prototype.shutdown = function shutdown(done) {
    clearInterval(this.sweepInterval);
    if(this.reconnectInterval) clearInterval(this.reconnectInterval);
    if(this.reconnectClearTimer) clearInterval(this.reconnectClearTimer);
    this.requests = {};
    this.retries = 0;
    if(this.con) this.con.destroy();
    this.emit('shutdown');
    if(done instanceof Function) done();
};

// Export the client TcpTransport
module.exports = TcpTransport;
