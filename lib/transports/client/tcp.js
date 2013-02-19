var net = require('net');

function onData(data) {
    this.buffer += data.toString();
    var nullSpot = this.buffer.search(/\0/);
    while(nullSpot !== -1) {
        var previous = this.buffer.substring(0, nullSpot);
        var next = this.buffer.substring(nullSpot+1);
        var json;
        try {
            json = JSON.parse(previous);
        } catch(e) {
        }
        if(this.requests[json.id]) this.requests[json.id].callback(json);
        delete this.requests[json.id];
        this.buffer = next;
        nullSpot = this.buffer.search(/\0/);
    }
}

function onEnd() {
    if(this.config.retries && this.config.retry < this.config.retries) {
        this.buffer = '';
        this.config.retry++;
        setTimeout(function() {
            this.con = net.connect({
                host: this.server,
                port: this.port
            }, function() {
                // Re-queue old requests once reconnected
                var oldReqs = this.requests;
                this.requests = {};
                process.nextTick(function() {
                    for(var key in oldReqs) {
                        this.request(oldReqs[key].body, oldReqs[key].callback);
                    }
                }.bind(this));
            }.bind(this));
            this.con.on('data', onData.bind(this));
            this.con.on('end', onEnd.bind(this));
        }.bind(this), this.config.retryInterval);
    } else {
        this.con = undefined;
    }
}

function TcpTransport(server, port, config) {
    this.config = config = config || {};
    this.server = server;
    this.port = port;
    this.requests = {};
    this.timeout = config.timeout || 2*60*1000;
    this.sweepInterval = setInterval(this.sweep.bind(this), this.timeout);
    this.buffer = '';

    if(config.retries) {
        config.retry = 0;
        config.retryInterval = config.retryInterval || 250;
    }

    this.con = net.connect({
        host: this.server,
        port: this.port
    });

    this.con.on('data', onData.bind(this));
    this.con.on('end', onEnd.bind(this));

    return this;
}

TcpTransport.prototype.request = function request(body, callback) {
    if(this.con) {
        this.con.write(JSON.stringify(body) + '\0');
        this.requests[body.id] = {
            callback: callback,
            body: body,
            timestamp: new Date().getTime()
        };
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
    this.config.retries = 0;
    if(this.con) this.con.end();
    if(done instanceof Function) done();
};

module.exports = TcpTransport;
