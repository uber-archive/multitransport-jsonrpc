var net = require('net');

function TcpTransport(port, config) {
    config = config || {};
    this.handler = function fakeHandler(json, next) { next({}); };
    this.port = port;

    this.server = net.createServer(function(con) {
        var buffer = '';
        con.on('data', function(data) {
            buffer += data.toString();
            var nullSpot = buffer.search(/\0/);
            while(nullSpot !== -1) {
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
            con = null;
        });
    }.bind(this));
    if(config.listen && config.listen instanceof Function) this.server.on('listening', config.listen);
    this.server.listen(port);

    return this;
};

TcpTransport.prototype.handlerCallback = function handlerCallback(con, retObj) {
    if(con) con.write(JSON.stringify(retObj) + '\0');
};

TcpTransport.prototype.shutdown = function shutdown(done) {
    this.server.close(done);
};

module.exports = TcpTransport;
