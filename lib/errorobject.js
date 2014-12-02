function createError(code, message) {
  return {
    code: code,
    message: message,
  };
}

module.exports = {
    paserError: createError(-32700, "Parse error"),
    invalidRequest: createError(-32600, "Invalid Request"),
    methodNotFound: createError(-32601, "Method not found"),
    invalidParams: createError(-32602, "Invalid params"),
    internalError: createError(-32603, "Internal error"),
    serverError: function(code) { return createError(code, "Server error"); }
};

