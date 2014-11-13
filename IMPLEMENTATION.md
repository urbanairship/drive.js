# Terminology

### From drive
- environment: where the test is run, e.g. jsdom, firefox, IE, etc.
- driver: a server which communicates with the code running in the environment
- suite: a collection of unit tests
- client:
- run:

### Document Specific

- tester: the test author
- target: the code whose behavior the test is designed to verify

# drive's flow control

1. bin/drive
2. (new require('lib/cli')).exec()
3. Forks on options, go to one of REPL, SPAWN, DRIVER or LOCAL

# LOCAL

We'll still have a client server interaction, but they're running in two node
processes, one which uses jsdom to run the tests, the other reporting on the
results.

1. call CLI.prototype.local()
2. Instantiate a new driver with the command line args
3. Get a port, and set a `(new require(lib/driver)).server()` to listen on it.
5. call `(new require('lib/node_env')(localhost:$PORT)).connect()`
6. listen for lib/driver to emit an 'environment event'
7. on environment, CLI instantiates a new `require(lib/client).LocalClient`
   instance, immediately passes it to `new require('lib/Request')`, along with
   the results of ``CLI.prototype.get_tests()``. The resulting Request instance
   is then passed to ``driver.request_test_run``

# `driver = new require(lib/driver); driver.server()`
 
1. Creates an http server and binds a request handler. The request handler
   parses incoming urls, and routes them against an driver.prototype.routes. 
2. Matching: URL pathnames are matched against javascript regular expressions.
   Each regex is associated with a key on the driver prototype, which is then
   called with the following arguments:

   - req: a node [incomingMessage](http://nodejs.org/api/http.html#http_http_incomingmessage)
   - resp: a node [serverResponse](http://nodejs.org/api/http.html#http_class_http_serverresponse)
   - the parenthesized substring matches against the RegExp, as described [here](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/RegExp/exec)

  The routes are matched in order, stopping at the first match. The regexen in
  question are defined [here](https://github.com/urbanairship/drive.js/blob/master/lib/driver.js#L215-L230)

# `driver.env_suite_endpoint`
  
Due to time constraints, and the general well functioning state of most of
drive's http communication, this discussion elides all routes but the last
one, which is responsible for routing to tester-defined endpoints. The route
is:

```javascript
[/^\/([\d\w\-]+)\/([\d\w\-]+)\/(.*)/, 'env_suite_endpoint']
```

Note that in order to match, the url must have at least three entries in the
path. This means that only relative path urls can be tested, or absolute urls
with at least three entries in the path can be tested. 

The response handler itself places additional constraints on target code
behavior. There are three matched groups in the regex above, each of which is
passed to the `driver.env_suite_endpoint` handler. The matched groups are
expected to have the following values:

1. env: a universal unique identifier (or uuid) which identifies the
   environment of the current run.
2. run: another uuid, which apparently identifies a batch of tests.

To respond to this request, drive finds the run identified by the uuid, calls a
method on it to determine the currently running test suite. The request does
need to identify the suite that issued it, so it can find the matching
endpoints. However relying on the url to do so means that drive cannot support
absolute url paths at all, even when it can match them. 

# `new require(lib/node_env)(hostname).connect()`
  1. this sets up a subprocess via `child_process.fork('lib/node_subprocess')`
  2. sets up message passing via `process.send` and `process.on('message', handler)`
  3. when this process gets a `message`, it:
    1. makes an http GET against message.url
    2. When the response comes back, set body of the DOM to the request body.
       (although because of the way jsdom's api works, this could also be a url
       of a website anywhere on the internet. It's up to the server to supply
       it.)
    3. This html contains script tags which cause the bundle to be loaded and
       the test to be run.


# DRIVER

To do.

# SPAWN

To do.


# REPL

I don't think we've ever used this, so I'm not going to follow this through

