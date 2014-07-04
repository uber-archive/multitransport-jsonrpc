# Multitransport JSON-RPC Client and Server

[![NPM version](https://badge.fury.io/js/multitransport-jsonrpc.png)](http://badge.fury.io/js/multitransport-jsonrpc) [![Dependency Status](https://gemnasium.com/uber/multitransport-jsonrpc.png)](https://gemnasium.com/uber/multitransport-jsonrpc) [![Build Status](https://travis-ci.org/uber/multitransport-jsonrpc.png?branch=master)](https://travis-ci.org/uber/multitransport-jsonrpc) [![Coverage Status](https://coveralls.io/repos/uber/multitransport-jsonrpc/badge.png?branch=master)](https://coveralls.io/r/uber/multitransport-jsonrpc?branch=master)

*multitransport-jsonrpc* provides a JSON-RPC solution for both the traditional HTTP scenario as well as for persistent, raw TCP connections. It's designed as a collection of constructor functions where both the client and server are split into two components: a single outer object in charge of the JSON-RPC protocol and providing the API for your code to interact with, and multiple sets of inner transport objects that deal with the particular data transport layer you want to use and how precisely to configure it.

This pluggable architecture means you can continue to use an RPC-type pattern even in use-cases where JSON-RPC has not traditionally been a great fit. The HTTP transport provides compatibility with traditional JSON-RPC clients and servers, while the TCP transport trims the fat of the HTTP header and amortizes the TCP handshake overhead, improving transport performance for large numbers of small messages. A theoretical ZeroMQ or SMTP transport could allow totally asynchronous clients and servers, where neither the client nor server need to be running all the time for communication to still successfully take place.

## Why nonstandard transports (such as TCP)?

It's not an official JSON-RPC standard, so why not just use HTTP for everything? The answer is simple: ridiculous performance gains when you don't need to do a TCP handshake or account for the HTTP header overhead on each request and response. Here's the results of a perf test on Travis CI:

```
Loopback took 7ms, 142857.14285714287 reqs/sec
ChildProc IPC took 30ms, 33333.333333333336 reqs/sec
TCP took 74ms, 13513.513513513513 reqs/sec
HTTP took 758ms, 1319.2612137203166 reqs/sec
```

The Loopback transport (all in-process, useful for testing and gauging the fundamental limit of JSON-RPC) comes in at over 100x faster than HTTP, over Node's IPC mechanism to child processes it's over 25x faster, and the TCP transport is over 10x faster.

## Install

    npm install multitransport-jsonrpc

If you want to use the ``jsonrpc-repl`` binary, also

    npm install -g multitransport-jsonrpc

## Library Usage

```js
var jsonrpc = require('multitransport-jsonrpc'); // Get the multitransport JSON-RPC suite

var Server = jsonrpc.server; // The server constructor function
var Client = jsonrpc.client; // The client constructor function

var ServerHttp = jsonrpc.transports.server.http; // The server HTTP transport constructor function
var ServerTcp = jsonrpc.transports.server.tcp; // The server TCP transport constructor function
var ServerMiddleware = jsonrpc.transports.server.middleware; // The server Middleware transport constructor function (for Express/Connect)
var Loopback = jsonrpc.transports.shared.loopback; // The Loopback transport for mocking clients/servers in tests

var ClientHttp = jsonrpc.transports.client.http;
var ClientTcp = jsonrpc.transports.client.tcp;

// Setting up servers
var jsonRpcHttpServer = new Server(new ServerHttp(8000), {
    loopback: function(obj, callback) { callback(undefined, obj); }
});

var jsonRpcTcpServer = new Server(new ServerTcp(8001), {
    loopback: function(obj, callback) { callback(undefined, obj); }
});

var express = require('express');
var app = express();
app.use(express.bodyParser());
var jsonRpcMiddlewareServer = new Server(new ServerMiddleware(), {
    loopback: function(obj, callback) { callback(undefined, obj); }
});
app.use('/rpc', jsonRpcMiddlewareServer.transport.middleware);
app.listen(8002);

var loopback = new Loopback();
var jsonRpcLoopbackServer = new Server(loopback, {
    loopback: function(obj, callback) { callback(undefined, obj); }
});

// Setting up and using the clients

// Either explicitly register the remote methods
var jsonRpcHttpClient = new Client(new ClientHttp('localhost', 8000));
jsonRpcHttpClient.register('loopback');
jsonRpcHttpClient.loopback('foo', function(err, val) {
    console.log(val); // Prints 'foo'
});

// Or wait for the "auto-register" functionality do that for you
new Client(new ClientTcp('localhost', 8001), {}, function(jsonRpcTcpClient) {
    jsonRpcTcpClient.loopback('foo', function(err, val) {
        console.log(val); // Prints 'foo'
    });
});

var jsonRpcExpressClient = new Client(new ClientHttp('localhost', 8002, { path: '/rpc' }));
jsonRpcExpressClient.register('loopback');
jsonRpcExpressClient.loopback('foo', function(err, val) {
    console.log(val); // Prints 'foo'
});

new Client(loopback, {}, function(jsonRpcLoopbackClient) {
    jsonRpcLoopbackClient.loopback('foo', function(err, val) {
        console.log(val); // Prints 'foo'
    });
});

// The server can run multiple transports simultaneously, too
var jsonRpcMultitransportServer = new Server([new ServerTcp(8000), new ServerHttp(8080)], {
    loopback: function(obj, callback) { callback(undefined, obj); }
});
var client1 = new Client(new ClientTcp('localhost', 8000));
var client2 = new Client(new ClientHttp('localhost', 8080));
```

### Constructor Function Parameters

#### jsonrpc.client

``new jsonrpc.client(transport, options, done)``

``transport`` - A client transport object (pre-constructed, so you don't need to write a Javascript constructor function if you don't want to).

``options`` - An object containing configuration options. The only configuration option for the client is ``autoRegister`` at the moment, a flag (default: true) that tells the client to attempt to get the listing of valid remote methods from the server.

``done`` - An optional callback function that is passed a reference to the client object after the ``autoRegister`` remote call has completed.

#### jsonrpc.server

``new jsonrpc.server(transport, scope)``

``transport`` - A server transport object (pre-constructed).

``scope`` - An object containing a set of functions that will be accessible by the connecting clients.

#### jsonrpc.transports.client.http

``new jsonrpc.transports.client.http(server, port, config)``

``server`` - The address of the server you're connecting to.

``port`` - The port of the server you're connecting to.

``config`` - The configuration settings for the client HTTP transport, which at the moment is only the ``path``, which defaults to ``/``.

The various transports also provide events you can listen on, using the [Node.js EventEmitter](http://nodejs.org/api/events.html) so the semantics should be familiar. The Client HTTP Transport provides:

``message`` - This event is fired any time a message (response) is returned, and provides the registered callback with the JSON-RPC object received.

``shutdown`` - This event is fired when the transport is shut down, and provides no arguments to the callback handlers.

#### jsonrpc.transports.client.tcp

``new jsonrpc.transports.client.tcp(server, port, config)``

``server`` - The address of the server.

``port`` - The port of the server.

``config`` - The configuration settings. For the client TCP transport, these are:

``timeout`` - The time, in ms, that the transport will wait for a response (default: 30 seconds)

``retries`` - The number of times the client will attempt to reconnect to the server when a connection is dropped (default: Infinity)

``retryInterval`` - The time, in ms, that the client will wait before reconnect attempts (default: 250ms)

``reconnects`` - The number of times the client will reconnect after a connection is closed (default: Infinity)

``reconnectClearInterval`` - The time, in ms, after which the reconnect counter is reset. Set to 0 to disable (default: 1 hour)

``stopBufferingAfter`` - The time, in ms, that the client will return errors immediately to the caller *while still attempting to reconnect to the server*. If 0, it will never immediately return errors (default: 0)

The Client TCP Transport events are:

``message`` - This event is fired whenever a complete message is received, and the registered callbacks receive the JSON-RPC object as their only argument.

``retry`` - This event is fired whenever the transport attempts to reconnect to the server. There are no arguments provided to the callback.

``end`` - This event is fired when the TCP connection is ended. If reconnection retries are enabled, it is only fired when the transport fails to reconnect.

``sweep`` - This event is fired when the transport clears out old requests that went past the expiration time. The callbacks receive an array of failed requests (if any) as the only argument.

``shutdown`` - This event is fired when the transport is shutdown.

#### jsonrpc.transports.client.childProcess

``new jsonrpc.transports.client.childProcess(child, config)``

``child`` - The Node.js child process object created by ``child_process.fork(sourceFile)``

``config`` - The configuration settings. For the client Child Process transport, these are:

``timeout`` - The time, in ms, that the transport will wait for a response (default: 30 seconds)

``sweepTime`` - The time, in ms, that the transport will run a sweep mechanism to throw away old requests that never returned (default: 1 second)

``killChildOnShutdown`` - A flag that specifies whether or not shutting down the client kills the child process (true) or merely disconnects the IPC from it (false). (default: true)

The Client Child Process Transport events are:

``exit`` - This event is fired whenever the child process exits. The client object is automatically shut down at this time.

``error`` - This event is fired whenever the child process returns an error. The client object is automatically shut down at this time.

``sweep`` - This event is fired when the transport clears out old requests that went past the expiration time. The callbacks receive an array of failed requests (if any) as the only argument.

``shutdown`` - This event is fired when the transport is shutdown.

#### jsonrpc.transports.server.http

``new jsonrpc.transports.server.http(port, config)``

``port`` - The port the server should use.

``config`` - The configuration settings. For the server HTTP transport, only ``acao`` exists. It is the value that should be returned to clients in the ``Access-Control-Allow-Origin`` header, and defaults to ``*``.

The Server HTTP Transport events are:

``message`` - This event is fired whenever a complete message is received, and the registered callbacks receive the JSON-RPC object as their only argument.

``listening`` - This event is fired whenever the HTTP server is open and listening for connections.

``shutdown`` - This event is fired when the transport is shutdown.

#### jsonrpc.transports.server.tcp

``new jsonrpc.transports.server.tcp(port, config)``

``port`` - The port the server should use.

``config`` - The configuration settings. For the server TCP transport, these are:

``retries`` - The number of times the server will attempt to listen to the TCP port specified. (Useful during fast restarts where the new node app is starting while the old node app is being shut down.)

``retryInterval`` - The time, in ms, that the server will wait between attempts to grab the TCP port.

The Server TCP Transport events are:

``connection`` - This event is fired whenever a new connection is made to the TCP server. The callbacks receive a reference to the connection object as their only argument.

``message`` - This event is fired whenever a JSON-RPC message is received. The callbacks receive the JSON-RPC object as their only argument.

``closedConnection`` - This event is fired whenever an open connection to a client is closed. The callbacks receive a reference to the connection object as their only argument.

``listening`` - This event is fired whenever the TCP server is open and listening for connections.

``retry`` - This event is fired whenever the TCP server cannot open the port to listen for connections and is retrying to connect.

``error`` - This event is fired whenever an unhandled error in the TCP server occurs. If configured, the server will attempt to solve listen errors. The callbacks receive the error object as their only argument.

``shutdown`` - This event is fired when the server is shutdown.

#### jsonrpc.transports.server.middleware

``new jsonrpc.transports.server.middleware(config)``

``config`` - The configuration settings. For the Connect/Express middleware transport, these are:

``acao`` - The ``Access-Control-Allow-Origin`` header value, which defaults to ``*``.

``server`` - A reference to the underlying server the middleware relies on. Used only for ``shutdown`` compatibility, if desired.

The Server Middleware Transport events are:

``message`` - This event is fired whenever a complete message is received, and the registered callbacks receive the JSON-RPC object as their only argument.

``shutdown`` - This event is fired when the transport is shutdown.

#### jsonrpc.transports.server.childProcess

``new jsonrpc.transports.server.childProcess(config)``

``config`` - The configuration settings. For the Child Process transport, there are no configuration options at this time!

The Child Process Transport events are:

``message`` - This event is fired whenever a complete message is received, and the registered callbacks receive the JSON-RPC object as their only argument.

``shutdown`` - This event is fired when the transport is shutdown.

#### jsonrpc.transports.shared.loopback

``new jsonrpc.transports.shared.loopback()``

No configuration used by the loopback object. It's still a constructor solely so you can have mutliple loopbacks in a single test suite, if needed.

The Loopback Transport events are:

``message`` - This event is fired whenever a message is passed into the client on its way to the server.

``shutdown`` - This event is fired when the transport is "shutdown." (The method doesn't actually do anything, this just helps if your tests depend on this event.)

## Defining JSON-RPC Server Methods

By default, JSON-RPC server methods are asynchronous, taking a callback function as the last argument. The callback function assumes the first argument it receives is an error and the second argument is a result, in the Node.js style.

```js
function foo(bar, baz, callback) {
    if(!baz) {
        callback(new Error('no baz!'));
    } else {
        callback(null, bar + baz);
    }
}
```

Alternately, the JSON-RPC server provides a ``blocking`` method that can be used to mark a function as a blocking function that takes no callback. Then the result is returned and errors are thrown.

```js
var blocking = jsonrpc.server.blocking;
var blockingFoo = blocking(function(bar, baz) {
    if(!baz) {
        throw new Error('no baz!');
    } else {
        return bar + baz;
    }
});
```

## Using JSON-RPC Client Methods

On the client side, you can only use the methods in an asynchronous way. All assume the last argument is a callback method where the first argument is an error and the second is a result. The JSON-RPC client highly recommends your server doesn't provide methods named ``transport``, ``request``, ``register``, or ``shutdown``, since the remote methods are in the same namespace as these helper methods of the JSON-RPC client, but the ``request`` method can still be used in this way to manually call any of these "blacklisted" methods:

```js
jsonRpcClient.request("shutdown", ["arg1", "arg2"], callbackFunc);
```

# Using the jsonrpc-repl binary

    Usage: jsonrpc-repl [options]

    Options:

        -h, --help               output usage information
        -s, --server <hostname>  The hostname the server is located on. (Default: "localhost")
        -p, --port <portnumber>  The port the server is bound to. (Default: 80)
        -t, --tcp                Connects to the server via TCP instead of HTTP (Default: false)

The ``jsonrpc-repl`` dumps you into a [Node.js repl](http://nodejs.org/api/repl.html) with some bootstrapping done on connecting you to the RPC server and getting a list of valid server methods. You can access them with the ``rpc`` object in the exact same way as described above in the "Using JSON-RPC Client Methods" section.


## Creating A New Transport

If you want to write your own transport constructor functions for multitransport-jsonrpc, here's what the client and server objects expect from their transport:

### Client

The transport is expected to have two methods: ``request`` and ``shutdown``.

``request`` is expected to be given a JSON-RPC object (not a string) as its first argument and a callback function as its second argument. The callback function expects its one and only argument to be a JSON-RPC object (not a string) that the error or result can be pulled from.

``shutdown`` is expected to take one argument, an **optional** callback function to let it know when the shutdown has completed.

### Server

The transport is expected to have a ``shutdown`` method that behaves exactly the same as the method described above.

It is also expected to make use of a ``handler`` method that the server attaches to it. This method expects two arguments, the first is a JSON-RPC object (not a string), but if the input is not valid JSON will handle the unparsed data just fine. The second argument is a callback that it provides with the response JSON-RPC object (not a string).

## License (MIT)

Portions Copyright (C) 2013 by Uber Technologies, Inc, David Ellis

Portions Copyright (C) 2011 by Agrosica, Inc, David Ellis, Alain Rodriguez, Hector Lugo

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
