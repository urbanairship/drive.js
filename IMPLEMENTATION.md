# What is this file:

I didn't write drive.js, but I need to use it, and occasionally fix it. It's
handling a complicated enough case that jumping in cold is difficult-- it is
hard to the source in the order in which it is executed. 

## Terminology

There is some drive specific terminology:

- environment: where the test is run, e.g. jsdom, firefox, IE, etc.
- driver: a server which communicates with the code running in the environment
- suite: a collection of unit tests
- client:
- run:

... and some that is useful to have when considering it:

- tester: the test author
- target: the code whose behavior the test is designed to verify

# Flow Control

When you call `drive my/dir/of/tests/` execution does the following:

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
4. call `(new require('lib/node_env')(localhost:$PORT)).connect()`
5. set up a listener listen for lib/driver to emit an 'environment event'

  When called, the listener instantiates a new
  `require(lib/client).LocalClient` instance, immediately passes it to `new
  require('lib/Request')`, along with the results of
  ``CLI.prototype.get_tests()``. The resulting Request instance is then
  passed to ``driver.request_test_run``
6. Finally, drive appears to have an "adaptor" system which operates by
`require` node files at a specified path, and called the exported function with
the `driver` instance instantiated in 2.

Steps 3., 4., and 5. schedule tasks for future execution.

### 3. `driver = new require(lib/driver); driver.server()`
 
Creates an http server and binds a request handler. The request handler
parses incoming urls, and routes them against driver.prototype.routes. 

The request handler matches URL pathnames  against javascript regular expressions.
Each regex is associated with a key on the driver prototype, which is then
called with the following arguments:

- req: a node [incomingMessage](http://nodejs.org/api/http.html#http_http_incomingmessage)
- resp: a node [serverResponse](http://nodejs.org/api/http.html#http_class_http_serverresponse)
- the parenthesized substring matches against the RegExp, as described [here](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/RegExp/exec)

The routes are matched in order, stopping at the first match. The regexen in
question are defined [here](https://github.com/urbanairship/drive.js/blob/master/lib/driver.js#L215-L230)

### 4. `new require(lib/node_env)(hostname).connect()`

1. This sets up a subprocess via `child_process.fork('lib/node_subprocess')`
2. Sets up message passing via `process.send` and `process.on('message', handler)`
3. When this process gets a `message`, it:
  1. makes an http GET against message.url
  2. When the response comes back, set body of the DOM to the request body.
     (although because of the way jsdom's api works, this could also be a url
     of a website anywhere on the internet. It's up to the server to supply
     it.)
  3. This html contains script tags which cause the bundle to be loaded and
     the test to be run.

The html includes the following script tags:

```html
<script type="text/javascript" src="/media/3p/json3.min.js"></script>
<script type="text/javascript" src="/media/driver.js"></script>
<script type="text/javascript">
  driver('/register/')
</script>
```

They ultimately an endpoint which passes requests on to a static file server.
The drive endpoint also includes without comment 

```javacript
req.url = 'http://derp.com/' + endpoint
```

where `req` is the node's native `incomingRequest` object. 

#### /media/driver.js

This module is fairly simple, -- given a url, it constructs an xhr a




### 5. `driver.on('environment', got_env)`

The 'environemnt' even tis emitted when a client hits a url matching: 

```javascript
[/^\/register\/$/,                                    'xhr_register']
```

It is emitted with the originating environemnt, but this information is ignored
for the local case.
  
1. `cli.prototype.get_tests()`: if non-option command line arguments remain,
  it constructs a list of files from them (by resolving dirs to their
  contents), checks each file for syntax errors (a little poorly), and returns
  the constructed list. If no arguments remain, it does the same as if you had
  specified the current working directory.

  It does not use a recursive traversal algorithm, which means it can only run
  tests a finite depth from the specified entry points. In this case, two
  directories deep.

2. `(new Driver).request_test_run(new Request({}, new Client(new CLI, ...)),...)`

  This function checks the return value of
  `Request.prototype.accepted_by(driver_instance)`.  If this method returns true,
  then the request instance is added to an internal queue, represented by an
  array.

  When the request is instantiates, it accepts a possible empty array of
  environments in which to run the test. Request.prototype.accepted_by ensures
  that Request and the Driver that the current environment is an appropriate
  one.

## Routes

#### `driver.env_suite_endpoint`
  
The route is:

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




# DRIVER

To do.

# SPAWN

To do.


# REPL

I don't think we've ever used this, so I'm not going to follow this through

