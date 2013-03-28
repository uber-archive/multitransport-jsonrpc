var jsonrpc = require('../lib/index');
var HttpTransport = jsonrpc.transports.server.http;
var http = require('http');

exports.loopback = function(test) {
    test.expect(2);
    var httpTransport = new HttpTransport(11235);
    httpTransport.handler = function(jsonObj, callback) {
        callback(jsonObj);
    };
    var testJSON = JSON.stringify({ hello: 'world' });
    var req = http.request({
        hostname: 'localhost',
        port: 11235,
        path: '/',
        method: 'POST'
    }, function(res) {
        res.setEncoding('utf8');
        var resultString = '';
        res.on('data', function(data) {
            resultString += data;
        });
        res.on('end', function() {
            test.equal(res.statusCode, 200, 'The http transport provided an OK status code');
            test.equal(resultString, testJSON, 'The http transport successfully sent the same JSON data back to the client.');
            httpTransport.server.close();
            test.done();
        });
    });
    req.write(testJSON);
    req.end();
};

exports.failure = function(test) {
    test.expect(1);
    var httpTransport = new HttpTransport(12345);
    httpTransport.handler = function(jsonObj, callback) {
        callback({ error: "I have no idea what I'm doing." });
    };
    var testJSON = JSON.stringify({ hello: 'world' });
    var req = http.request({
        hostname: 'localhost',
        port: 12345,
        path: '/',
        method: 'POST'
    }, function(res) {
        res.setEncoding('utf8');
        var resultString = '';
        res.on('data', function(data) {
            resultString += data;
        });
        res.on('end', function() {
            test.equal(res.statusCode, 500, 'The http transport provided a server error status code');
            httpTransport.server.close();
            test.done();
        });
    });
    req.write(testJSON);
    req.end();
};
