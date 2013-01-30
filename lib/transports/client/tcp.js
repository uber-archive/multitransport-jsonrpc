var net = require('net');

function TcpTransport(server, port, config) {
    config = config || {};
    this.server = server;
    this.port = port;
    this.requests = {};

    this.con = net.connect({
        host: this.server,
        port: this.port
    }, function() {
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
                buffer = next;
                nullSpot = buffer.search(/\0/);
            }
        }.bind(this));
        this.con.on('end', function() {
            this.con = undefined;
        }.bind(this));
    }.bind(this));

    return this;
}

TcpTransport.prototype.request = function request(body, callback) {
    if(this.con) {
        this.con.write(JSON.stringify(body) + '\0');
        this.requests[body.id] = callback;
    }
};

module.exports = TcpTransport;
