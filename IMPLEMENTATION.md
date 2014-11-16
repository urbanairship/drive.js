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
- run: The unit of work into which tests are divided.
- Request: an object used to track a test run

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

They `/media/*` routes to an endpoint which passes requests on to a static file
server.

On load, the client requests instructions from the server. Of these there are
two: 

1. change the current window.location 
2. request instructions from a different URL.

It accomplishes this via functions that `/media/driver.js` (found in
`/public/driver.js` module) attaches to the window objection: `driver` and
`xhr_continue`. The last script tag calls `driver`  to start execution

These functions do the following:

1. `driver`: given a URL, it constructs an XHR to which it posts an empty body.
  The URL is assumed to have no query parameters. On response, it attempts to
  JSON parse the response. On success it calls `xhr_continue` with the parsed
  response. On failure, it calls itself with the url `'/regiseter/'`.

2. `xhr_continue`: a function that expects an object, called `info`. It checks
   if `info.adverb === 'GET'` it changes the window location to `info.action`

   Otherwise, it calls `driver` with  `info.action`

#### `[/^\/register\/$/, 'xhr_register']`

This view is the first one hit when a new client finishes loading, or when it
runs out of tasks. It determines the requesting environment from the User Agent
header, adds it to the set of allowed environments, and assigns the client a
unique identifier. It creates a new `require('lib/environemtn')` object to
represent the newly created environment, and adds it to a list.

It sends back instructions telling the client to change its
location to '/$UUID/', and now we are off to th races. 

It also emits the 'environment' event after it responds to the request. 

### 5. `driver.on('environment', got_env)`

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

#### `[/^\/([\d\w\-]+)\/$/, 'env']`

This endpoint returns html: which calls `driver('./_idle')`, on the client.
Note that the relative URL preserves the environment identifier.

#### `[/^\/([\d\w\-]+)\/_idle\/$/, 'xhr_idle']`


Does the following:


1. Match the environment UUID (the matched group) to an environment the driver
   knows about. 

2. If there are requests for tests pending (there is a list of
   `require(lib/request)` objects which represent pending test requests), it
   calls `Request.prototype.create_run` with the next pending request, and the
   current environemnt, and the number of environments it needs to match.

3. `Request.prototype.create_run`: This method updates queues which Request
   maintains for each environment, and creates a new require('lib/run') object.
   The run is assigned a unique identifier.

4. The test request stays in the drivers `test_request` queue until it has been
   fulfilled, meaning it no longer has test requests queued for any
   environment.

5. Finally it creates a browserify bundle (if necessary), and instructs the
   client to go to `/$ENV_UUID/$RUN_UUID`.

It has two error conditions, if the environment or its specifier are bad,  then
it redirects the client `/register/`. Otherwise failures result in asking the
client to hit the current route again.

#### `[/^\/([\d\w\-]+)\/([\d\w\-]+)\/$/, 'env_suite']`

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

