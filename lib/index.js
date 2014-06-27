module.exports = {
    server: require('./server'),
    client: require('./client'),
    transports: {
        client: {
            http: require('./transports/client/http'),
            tcp: require('./transports/client/tcp'),
            childProcess: require('./transports/client/childProcess')
        },
        server: {
            http: require('./transports/server/http'),
            tcp: require('./transports/server/tcp'),
            middleware: require('./transports/server/middleware'),
            childProcess: require('./transports/server/childProcess')
        },
        shared: {
            loopback: require('./transports/shared/loopback')
        }
    },
    errorcode: require('./errorcode')
};
