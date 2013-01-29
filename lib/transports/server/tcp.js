var net = require('net');

function TcpTransport(port, config) {
    config = config || {};
    this.handler = function fakeHandler(json, next) { next({}); };
    this.port = port;

    this.server = net.createServer(function(con) {
        var buffer = '';
        con.on('data', function(data) {
            var dataString = data.toString();
            var nullSpot = dataString.search(/\0/);
            if(nullSpot !== -1) {
                var endOfPrevious = dataString.substring(0, nullSpot);
                var startOfNext = dataString.substring(nullSpot+1);
                buffer += endOfPrevious;
                var jsonObj;
                try {
                    jsonObj = JSON.parse(buffer);
                } catch(e) {
                    // If the object is bad, we just pass in an undefined value and let the JSON-RPC handler deal with it
                }
                this.handler(jsonObj, this.handlerCallback.bind(this, con));
                buffer = startOfNext;
            } else {
                buffer += dataString;
            }
        }.bind(this));
        con.on('end', function() {
            con = null;
        });
    }.bind(this));
    this.server.listen(port);

    return this;
};

TcpTransport.prototype.handlerCallback = function handlerCallback(con, retObj) {
    if(con) con.write(JSON.stringify(retObj) + '\0');
};

module.exports = TcpTransport;
