var http = require('http');
var q = require('queue-flow');
var l = require('lambda-js');

module.exports = function HttpTransport(port, config) {
    config = config || {};
    this.handler = function fakeHandler(json, next) { next({}); };
    this.acao = config.acao ? config.acao : "*";
    this.port = port;

    this.responseHandler = function responseHandler(res, retObj) {
        var outString = JSON.stringify(retObj);
        res.writeHead(retObj.error?500:200, {
            "Access-Control-Allow-Origin": this.acao,
            "Content-Length": Buffer.byteLength(outString, 'utf8'),
            "Content-Type": "application/json;charset=utf-8"
        });
        res.end(outString);
    };

    this.server = http.createServer(function(req, res) {
        var r = q.ns()().reduce(l('cum, cur', 'cum + cur'), function(result) {
            var json = undefined;
            try {
                json = JSON.parse(result);
            } catch(e) {
                // Literally don't need to do anything at the moment here.
            }
            this.handler(json, this.responseHandler.bind(this, res));
        }.bind(this), '');
        req.on('data', r.push.bind(r));
        req.on('end', r.close.bind(r));
    }.bind(this));
    this.server.listen(this.port);

    return this;
};
