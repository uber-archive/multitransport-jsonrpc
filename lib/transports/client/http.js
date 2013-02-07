var http = require('http');
var q = require('queue-flow');
var l = require('lambda-js');

function HttpTransport(server, port, config) {
    config = config || {};
    this.path = config.path || '/';
    this.server = server;
    this.port = port;

    return this;
}

HttpTransport.prototype.request = function request(body, callback) {
    var req = http.request({
        hostname: this.server,
        port: this.port,
        path: this.path,
        method: 'POST'
    }, function(res) {
        var r = q.ns()().reduce(l('cum, cur', 'cum + cur'), function(result) {
            var json;
            try {
                json = JSON.parse(result);
            } catch(e) {
            }
            callback(json);
        }, '');
        res.on('data', r.push.bind(r));
        res.on('end', r.close.bind(r));
    }.bind(this));
    req.setHeader('Content-Type', 'application/json');
    req.write(JSON.stringify(body));
    req.end();
};

HttpTransport.prototype.shutdown = function shutdown(done) {
    // Literally nothing needed for HTTP client
    // Just call callback for API consistency
    done();
};

module.exports = HttpTransport;
