var util = require('util');
var EventEmitter = require('events').EventEmitter;

// The Server ChildProcessTransport constructor function
function ChildProcessTransport(config) {
    // Initialize the EventEmitter for this object
    EventEmitter.call(this);

    // Make sure the config is addressable and add config settings
    // and a dummy handler function to the object
    config = config || {};
    this.handler = function fakeHandler(json, next) { next({}); };

    // Connect the child process to the handler
    this.messageHandler = function(json) {
        this.emit('message', json, -1); // Message len unsupported by the child process message event
        this.handler(json, process.send.bind(process));
    }.bind(this);
    process.on('message', this.messageHandler);

    return this;
}

// Attach the EventEmitter prototype to the prototype chain
util.inherits(ChildProcessTransport, EventEmitter);

// A simple wrapper for closing the HTTP server (so the TCP
// and HTTP transports have a more uniform API)
ChildProcessTransport.prototype.shutdown = function shutdown(done) {
    this.emit('shutdown');
    process.removeListener('message', this.messageHandler);
    if(done instanceof Function) done();
};

// Export the Server ChildProcess transport
module.exports = ChildProcessTransport;
