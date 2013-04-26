#!/usr/bin/env bash

# Unenforced jshint files

#jshint --config scripts/jshint.json test/*.js

# Enforced jshint files

## Full hinting rules

jshint --config test/jshint.json lib/*.js lib/transports/client/*.js lib/transports/server/*.js lib/transports/shared/*.js test/*.js

HINT_RESULT=$?

# Determine exit code and quit

if [ $HINT_RESULT -eq 0 ]; then
    echo Success: No enforced files failed the style test.
else
    echo Failure: One or more enforced files failed the style test.
fi

exit $HINT_RESULT
