module.exports = {
    server: require('./server'),
    client: require('./client'),
    transports: {
        client: {
            http: require('./transports/client/http'),
            tcp: require('./transports/client/tcp')
        },
        server: {
            http: require('./transports/server/http'),
            tcp: require('./transports/server/tcp')
        }
    }
};
