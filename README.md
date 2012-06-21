# Drive.js

Cross-browser unit testing for humans.

For a quick run-through, see [this codestre.am recording](http://codestre.am/e09a137e84a11adcc3401535b).

## Installation

* Download [node.js](http://nodejs.org/#download)
* Open up a terminal.
* Run the following command:

````sh
$ npm install -g drive.js
````

You should be good to go!

## What is it?

Drive is a unit testing framework and test driver. It can be used locally -- without any browsers involved --
or set up as a test driver server for other clients to connect to.

The goal of Drive is to reduce context-switching from your terminal -- ideally, you should be able to test all
of your target environments without ever leaving your terminal. This means that it attempts to provide (at minimum)
a decent set of debugging tools across all environments:

* **Humane stack traces**: reformats stack traces (as much as possible) to give context around the exceptions, using
tracejs. Some environments support a bit less debugging info than V8, and in those cases Drive will do its level
best to at least show you where the error originated from.

* **console.log piping**: Drive will pipe the output from `console.error` and `console.log` directly to your terminal,
annotated with the environment from which they originated. This means that if you need (for whatever reason) to inspect 
variables in a given environment, it's totally possible without too much hand-wringing.

* **Experimental `repl` support**: You can set a breakpoint using `__repl.set_trace()` in your code, and drive will enable
a `gdb`-style REPL in that environment from that point forward.

The secondary goal of drive is that it should make testing DOM-heavy applications easy.

This means that you may specify your own HTML to be served with a given test suite. The drive server will take care of serving it
for you. If you have an AJAX-heavy application, you can additionally supply stubbed endpoints that the Drive server will serve.

## What does a test suite look like?

Drive is modeled after [visionmedia's mocha](http://github.com/visionmedia/mocha).

It provides the [assert module](http://nodejs.org/api/assert.html) automatically.

There should be only one `suite` per file.

````javascript

// example.test.js
suite("Test suite name", function(require) {
  // require other modules!
  var MyApp = require('../myapp')

  test("A synchronous test", function() {
    assert.equal(0, 1)
  })

  // tests can be made async by simply defining
  // your test function as taking a "done" callback.
  //
  // if your suite does not call the done callback within
  // 30 seconds, it will automatically trigger a "timeout" error.
  test("An async test", function(done) {
    var xhr = new XMLHttpRequest

    xhr.open('GET', 'myendpoint')
    xhr.onreadystatechange = function() {
      if(xhr.readyState == 4) {
        assert.equal(xhr.responseText, 'hello world')
        done()
      }
    }
    xhr.send(null)

  })
})

// html may be included relative to the current test file.
html('../path/to/my/document.html')

// provide endpoints to the drive server
endpoints({
  'myendpoint':function(req, resp) {
    resp.writeHead(200, {'Content-Type':'text/plain'})
    resp.end('hello world')
  }
})

````

# CLI

## drive file_or_directory [file_or_directory, ...]

Run the tests located at `file_or_directory` locally, in a JSDOM environment.

If a directory is given, `drive` will search for any files matching `*.test.js` under
that directory and its sub-directories.

**No drive server is required in this mode.**

## drive file_or_directory [...] --driver=(host | port)

Runs the tests listed in all environments available to the Drive server located at `host` or `port`.

## drive file_or_directory [...] --driver 8124 --want env [--want env, ...]

Runs the tests listed in all environments matching `env`, where env is transformed into a
regex that matches against `browser / version / os`

Examples:

* `drive . --driver 8124 --want ie --want firefox`
* `drive . --driver 8124 --want ie/8`
* `drive . --driver 8124 --want osx`

## drive file_or_directory [...] --driver 8124 --repl

Will run the tests at `file_or_directory` in a single environment (whichever matches first, so it's
advisable to use `--want` to filter down environments) with `repl` mode enabled.

This passes all test files (and all `require`'d media) through `node-burrito`, transforming it to
provide breakpoints to the repl (for step-debugging).

Commands in the repl:

* `n`: step one statement forward. do not enter function calls.
* `s`: step one statement forward, enter function calls if any.
* `c`: continue execution.

Any statements not matched by the above commands will be evaluated in the same context. 

The last item of `arguments` will be the `REPL` function -- **don't be alarmed**!

## drive --spawn (host | port)

Spawns a drive test server.

Clients may be registered by navigating to `http://host:port/` in your desired environments.

A DNode server will attempt to listen one port above the given port for incoming test requests.

* `drive --spawn 8124 [--bundle <file or dir>, ...]`: Automatically bundle these files in every
test, regardless of default or custom HTML for that test. Useful for pinning to a version of jQuery,
or ensuring that all tests run with `es5-shim`. These files may be cached by the browser.

If a directory is provided, all files ending in `.js` in that directory and its subdirectories will
be included in the bundle.

**NB**: If there is a `.drive_bundle` file in the current directory or any parent directory,
those files will be automatically bundled, relative to the location of the `.drive_bundle`:

Example `.drive_bundle`, which will include all `.js` files in `js/thirdparty`, as well as `jquery.js`:

````
./js/thirdparty/
./js/jquery.js
````

**NB**: Bundled files will be excluded from any processing done by the drive server -- that is to
say, you cannot use the `repl` inside these files (and in the future, no coverage or perf data
will be available within them).

* `drive --spawn 8124 [--adaptor file.js, ...]`: If given, after the Driver server is spawned, passes
the server to the function exported from `file.js`. Listeners may be attached to the driver server
to extend functionality. Multiple adaptors may attach to the same server.

````javascript
module.exports = function(driver) {
  driver.on('join', function(env) {
    // emitted when an environment joins the drive server
    // env -> {uuid, type} (uuid = 16hex-16hex, type = 'browser / version / os'
  })

  driver.on('drop', function(env) {
    // emitted when an environment is dropped from the server (ping timeout)
  })

  driver.on('request', function(request) {
    // emitted when the server receives a request to run tests.
    // request -> {ident:{name, email}, client:{client:DNode}, tests:[list of filenames]}
  })

  driver.on('run', function(run, env) {
    // emitted when an environment starts a test run
    // run -> {uuid, request, tests:[<test suite objects>]}
  })

  driver.on('suite', function(run, env, suite) {
    // emitted when an environment starts running a test suite
    // suite -> {name, request}
  })

  driver.on('result', function(run, env, suite, result) {
    // emitted when an environment provides a result for a test suite.
    // result -> {<test names>:test_result}
    //   test_result    -> {pass:true, elapsed:<integer ms>} if pass
    //                  -> {assertion:true, message, [error data]} if fail
    //                  -> {[error data]} if error
  })

  driver.on('finish', function(run, env) {
    // emitted when a test run is complete and the env is returning to idle
  })
}
````

# Some specifics

* Driver will attempt to divide-and-conquer your test files in up to four environments at once --
that is to say, if you have four instances of a single browser connected to a Drive server, and you
send them 32 files to test, each browser will test 8 different files, in an effort to keep things speedy.

* Tests (and `require`'d media) are hosted under `/<env_uuid>/<run_uuid>/_media/`, so they should never
be cached.

* User endpoints are similarly hosted under `/<env_uuid>/<run_uuid>/`.

* Registered environments will attempt to reconnect to the server if they detect that it is down. That
means, in practice, that you can restart the driver server itself without having to refresh 4-5 different
browsers.

* Works on IOS.

