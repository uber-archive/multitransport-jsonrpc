var net = require('net');

function TcpTransport(server, port, config) {
    config = config || {};
    this.server = server;
    this.port = port;
    this.requests = {};
    this.timeout = config.timeout || 2*60*1000;
    this.sweepInterval = setInterval(this.sweep.bind(this), this.timeout);

    if(config.retries) {
        config.retry = 0;
        config.retryInterval = config.retryInterval || 250;
    }

    this.con = net.connect({
        host: this.server,
        port: this.port
    });

    var buffer = '';
    this.con.on('data', function(data) {
        buffer += data.toString();
        var nullSpot = buffer.search(/\0/);
        while(nullSpot !== -1) {
            var previous = buffer.substring(0, nullSpot);
            var next = buffer.substring(nullSpot+1);
            var json;
            try {
                json = JSON.parse(previous);
            } catch(e) {
            }
            if(this.requests[json.id]) this.requests[json.id](json);
            delete this.requests[json.id];
            buffer = next;
            nullSpot = buffer.search(/\0/);
        }
    }.bind(this));

    this.con.on('end', function() {
        this.con = undefined;
    }.bind(this));

    this.con.on('error', function(error) {
        if(config.retries && config.retry < config.retries) {
            config.retry++;
            setTimeout(function() {
                this.con = net.connect({
                    host: this.server,
                    port: this.port
                });
            }.bind(this), config.retryInterval);
        }
    }.bind(this));

    return this;
}

TcpTransport.prototype.request = function request(body, callback) {
    if(this.con) {
        this.con.write(JSON.stringify(body) + '\0');
        this.requests[body.id] = callback;
        this.requests[body.id].body = body;
        this.requests[body.id].timestamp = new Date().getTime();
    }
};

TcpTransport.prototype.sweep = function sweep() {
    var now = new Date().getTime();
    for(var key in this.requests) {
        if(this.requests[key].timestamp && this.requests[key].timestamp + this.timeout < now) delete this.requests[key];
    }
};

TcpTransport.prototype.shutdown = function shutdown(done) {
    clearInterval(this.sweepInterval);
    this.requests = {};
    if(this.con) this.con.end();
    if(done instanceof Function) done();
};

module.exports = TcpTransport;
