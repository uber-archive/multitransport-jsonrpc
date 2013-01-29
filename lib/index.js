module.exports = {
    server: require('./server'),
    client: require('./client'),
    transports: {
        http: require('./transports/http'),
        tcp: require('./transports/tcp')
    }
};
