var util = require('util');
var EventEmitter = require('events').EventEmitter;

// The loopback transport allows you to mock a JSON-RPC interface where the client
// and server are on the same process.
function LoopbackTransport() {
    // Set up the event emitter and create the property the server's message handler will bind to
    EventEmitter.call(this);
    this.handler = function fakeHandler() {};
    return this;
}

// Inherit the event emitter methods
util.inherits(LoopbackTransport, EventEmitter);

// Create a fake shutdown method for the sake of API compatibility
LoopbackTransport.prototype.shutdown = function shutdown(done) {
    this.emit('shutdown');
    if(done instanceof Function) done();
};

// Pass the client requests to the server handler, and the response handling is taken care of
// by the client's response handler.
LoopbackTransport.prototype.request = function request(body, callback) {
    this.emit('message', body, JSON.stringify(body).length);
    this.handler(body, callback);
};

// Export the Loopback object
module.exports = LoopbackTransport;
