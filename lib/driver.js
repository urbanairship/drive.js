// (c) 2012 Urban Airship and Contributors 

var http = require('http')
  , url = require('url')
  , dnode = require('dnode')
  , browserify = require('browserify')
  , fs = require('fs')
  , readfile = fs.readFileSync.bind(fs)
  , find_requirements = require('./find_requirements')
  , paperboy = require('paperboy')
  , path = require('path')
  , EE = require('events').EventEmitter
  , crypto = require('crypto')

var Environment = require('./environment')        // <-- a browser (or node) providing an environment
  , Client = require('./client')
  , Request = require('./request')

module.exports = Driver

function Driver(port, bundle, configuration) {
  this.port = port
  this.test_run_requests = []
  this.test_runs = []
  this.environments = []
  this.configuration = configuration
  this.types = []
  this.browserify_bundles = {}

  this.bundle = bundle || []
  this.bundle_cache = null 
  this.bundle_hash = {}

  EE.call(this)
}

var cons = Driver
  , proto = cons.prototype = new EE

proto.constructor = cons

proto.get_bundled_js = function(for_browserify, ready) {
  var self = this
    , suite_js = '<script type="text/javascript" src="/media/' + (for_browserify ? 'browserify-' : '') + 'suite.js"></script>'

  if(self.bundle_cache)
    return ready(null, self.bundle_cache + suite_js)

  var base_bundle = [ 
      '<script type="text/javascript" src="/media/3p/json3.min.js"></script>'
    , '<script type="text/javascript" src="/media/driver.js"></script>'
    , '<script type="text/javascript" src="/media/assert.js"></script>'
    ].join('')
  , countdown = self.bundle.length
  , output = []

  self.bundle.forEach(nab_bundle)

  if(!countdown)
    return done()

  function nab_bundle(filename, idx) {
    fs.readFile(filename, 'utf8', parse_file)
    function parse_file(err, data) {
      if(!err) {
        var hash = crypto.createHash('sha1').update(data).digest('hex')
        self.bundle_hash[hash] = data

        output[idx] = '<script type="text/javascript" src="/media/bundle/'+hash+'.js"></script>'
      } else {
        output[idx] = ''
      }
      !--countdown && done()
    }
  }

  function done() {
    self.bundle_cache = '<script type="text/javascript" src="/media/redirect.js"></script>' + output.join('') + base_bundle

    ready(null, self.bundle_cache + suite_js) 
  }
}
proto.build_browserify = function (deps, transforms, no_parse, test_files, uuid, ready) {
  var self = this
    , run = self.get_run_by_uuid(uuid)
  
  if (self.configuration.browserify) {
    if (self.configuration.browserify.deps) {
      deps = self.configuration.browserify.deps.concat(deps)
    }
    if (self.configuration.browserify.transforms) {
      transforms = self.configuration.browserify.transforms.concat(transforms)
    }
    if (self.configuration.browserify.noparse) {
      no_parse = self.configuration.browserify.noparse.concat(no_parse)
    }
  }

  var CWD = process.cwd()
    , browserify_options = {
          insertGlobals: true
        , debug: true
      }
  
  if (deps.length) {
    browserify_options.entries = deps.map(resolve_files)
  }
  if (no_parse.length) {
    browserify_options.noParse = no_parse.map(resolve_files)
  }

  var b = browserify(browserify_options)

  find_requirements(test_files, onprocessed)

  function resolve_files(file) {
    return path.resolve(CWD, file)
  }
  function onprocessed(err, reqs) {
    run.requirements = reqs
    
    if (err) {
      return ready(err)
    }
    Object.keys(reqs).forEach(process_requirements)
    transforms.forEach(add_transforms)

    b.bundle(write_bundle)
    function process_requirements(el) {
      b.require(reqs[el].full, { expose: reqs[el].named })
    }
    function add_transforms(file) {
      var transform = require(path.resolve(CWD, file))
      b.transform(transform)
    }
    function write_bundle(err, data) {
      if (err) {
        return ready(err)
      }
      self.browserify_bundles[uuid] = data
      ready(null)
    }
  }
}

proto.request_test_run = function(test_run_request) {
  if(test_run_request.accepted_by(this)) {
    this.test_run_requests.push(test_run_request)
    return true
  }

  return false
}

proto.dnode = function() {
  var self = this

  return dnode(function(client, conn) {
    var drive_client = new Client(client, conn)
    this.request_tests = self.request_tests.bind(self, drive_client, client)
  })
}

proto.request_tests = function(drive_client, client, tests, wants, want_repl, want_coverage, ident) {
  var self = this
    , request = new Request(ident, drive_client, tests, wants || [], want_repl, want_coverage)
    , missing

  if(!self.request_test_run(request) || self.types.length === 0) {
    missing = wants.filter(function(want) {
      return self.types.indexOf(want) === -1
    })

    client.output('could not fulfill '+missing+', exiting...')
    return client.exit()
  }

  if(want_repl) {
    request.environment_targets = [request.environment_targets[0]]
  }
  client.environments(request.environment_targets)

  self.emit('request', request)
}

proto.server = function() {
  var server = http.createServer(this.on_request.bind(this))
  this.port && server.listen(this.port)
  return server
}

proto.listen = function() {
  return this.server().listen(this.port)
}

proto.get_environment_by_uuid = function(uuid) {
  return this.environments.filter(function(env) { return env.uuid === uuid })[0] || null
}

proto.get_run_by_uuid = function(uuid) {
  return this.test_runs.filter(function(run) { return run.uuid === uuid })[0] || null
}

proto.timeout_client = function(env) {
  env.timeout = null

  var idx = this.types.indexOf(env.type)
  !!~idx && this.types.splice(idx, 1)

  idx = this.environments.indexOf(env)
  !!~idx && this.environments.splice(idx, 1) 

  this.emit('drop', env)
}

proto.on_request = function handler(req, resp) {

  var oldwritehead = resp.writeHead
    , self = this

  var urlinfo = url.parse(req.url, true)
    , route
    , match

  resp.writeHead = function(code, headers) {
    self.emit('http', code, urlinfo.pathname)
    return oldwritehead.call(resp, code, headers)
  }

  self.routes.some(function(test_route) {
    return (match = test_route[0].exec(urlinfo.pathname)) && (route = test_route)
  })

  if(!match) {
    resp.writeHead(404, {'Content-Type':'text/plain'})
    return resp.end('wat')
  }

  req.META = urlinfo

  try { 
    return self[route[1]].apply(self, [req, resp].concat(match.slice(1)))
  } catch(err) {
    resp.writeHead(500, {'Content-Type':'text/html'})
    resp.end('<pre>'+err.stack+'</pre>')
  }
}

proto.generate_uuid = require('./uuid')

proto.routes = [
    [/^\/$/,                                              'index']
  , [/^\/register\/$/,                                    'xhr_register']
  , [/^\/media\/browserify\/(.*)\.js/,                    'browserify_bundle']
  , [/^\/media\/bundle\/(.*)\.js/,                        'media_bundle']
  , [/^\/media\/(.*)/,                                    'media']
  , [/^\/([\d\w\-]+)\/$/,                                 'env'] 
  , [/^\/([\d\w\-]+)\/_idle\/$/,                          'xhr_idle']
  , [/^\/([\d\w\-]+)\/([\d\w\-]+)\/$/,                    'env_suite']
  , [/^\/([\d\w\-]+)\/([\d\w\-]+)\/(pass|fail|error)\/$/, 'env_suite_update']
  , [/^\/([\d\w\-]+)\/([\d\w\-]+)\/_respond\/$/,          'env_suite_finish']
  , [/^\/([\d\w\-]+)\/([\d\w\-]+)\/_media\/(.*)/,         'env_suite_media']
  , [/^\/([\d\w\-]+)\/([\d\w\-]+)\/_repl\/$/,             'env_suite_repl']
  , [/^\/([\d\w\-]+)\/([\d\w\-]+)\/_log\/$/,              'env_suite_log']
  , [/^\/([\d\w\-]+)\/([\d\w\-]+)\/(.*)/,                 'env_suite_endpoint']
]

proto.index = function(req, resp) {
  resp.writeHead(200, {'Content-Type':'text/html'})
  resp.end(this.templates.index) 
}

proto.env = function(req, resp) {
  resp.writeHead(200, {'Content-Type':'text/html'})
  resp.end(this.templates.env)
}

var MEDIA_DIR = path.join(__dirname, '../public/')

proto.browserify_bundle = function (req, resp, uuid) {
  if (this.browserify_bundles[uuid]) {
    resp.writeHead(200, {'Content-Type':'text/javascript'})
    resp.end(this.browserify_bundles[uuid])
  } else {
    resp.writeHead(404, {'Content-Type':'text/plain'})
    resp.end('No browserify bundle for this run')
  }
}

proto.media_bundle = function(req, resp, hash) {
  var data = this.bundle_hash[hash]

  this.emit('bundle', hash)
  if(data) {
    resp.writeHead(200, {'Content-Type':'text/javascript'})
    resp.end(data)
  } else {
    resp.writeHead(404, {'Content-Type':'text/plain'})
    resp.end('missing '+hash)
  }
}

proto.media = function(req, resp, endpoint) {
  this.emit('media', req.url)
  req.url = 'http://derp.com/'+endpoint
  paperboy.deliver(MEDIA_DIR, req, resp)
}

proto.xhr_register = function(req, resp) {
  var ua = req.headers['user-agent']
    , uuid = this.generate_uuid()
    , type = Environment.parse_type(ua)
    , env = new Environment(uuid, type)
    , timeout

  this.types.push(type)
  this.environments.push(env)
  this.emit('environment', env)

  timeout = setTimeout(this.timeout_client.bind(this, env), 1000)

  env.timeout = timeout

  resp.writeHead(200, {'Content-Type':'application/json'})
  resp.end(JSON.stringify({
    'uuid':uuid
  , 'status':'registered'
  , 'action':'/'+uuid+'/'
  , 'adverb':'GET'
  }))

  this.emit('join', env)
}

proto.xhr_idle = function(req, resp, uuid) {
  var self = this
    , env

  // tell the server we'd like a test. if there's no
  // test run requests, we just say "hi"
  env = self.get_environment_by_uuid(uuid)
  if(!env || !env.timeout)
    return respond_timed_out()

  clearTimeout(env.timeout)

  if(self.test_run_requests.length)
    return respond_new_test()

  return respond_idle()

  function respond_timed_out() {
    resp.writeHead(200, {'Content-Type':'application/json'})
    resp.end(JSON.stringify({
        'status':'timeout'
      , 'action':'/register/'
      , 'adverb':'xhr'
    }))
  }

  function respond_new_test() {
    var test_req = self.test_run_requests[0]
      , test_run

    // if the request doesn't want this env, skip it and tell the env to idle.
    if(!test_req.wants(env)) {
      return respond_idle()
    }

    // otherwise create the test run.
    test_run = test_req.create_run(env, self.types.filter(function(t) { return t === env.type }).length)

    // and if we're cool, then remove that test run request.
    if(test_req.is_fulfilled())
      self.test_run_requests.shift()

    self.test_runs.push(test_run)
    // if the tests are for browserify, build the bundle accordingly
    if (test_req.client.browserify || (test_req.client.dnode && test_req.client.dnode.browserify)) {
      if (test_req.client.dnode) {
        var transforms = test_req.client.dnode.browserify_transforms
          , no_parse = test_req.client.dnode.browserify_noparse
      } else {
        var transforms = test_req.client.browserify_transforms
          , no_parse = test_req.client.browserify_noparse
      }
      // until dep is implemented as a cli option, just pass an empty array
      self.build_browserify([], transforms, no_parse, test_req.tests.slice(), test_run.uuid, continue_request.bind(self))
    } else {
      continue_request(null)
    }

    function continue_request(err) {
      resp.writeHead(200, {'Content-Type':'application/json'})
      resp.end(JSON.stringify({
          'status':'newtest'
        , 'action':'/'+env.uuid+'/'+test_run.uuid+'/'
        , 'adverb':'GET'
      }))

      self.emit('run', test_run, env)
    }
  }

  function respond_idle() {
    // reset the timeout.
    env.timeout = setTimeout(self.timeout_client.bind(self, env), 1000)

    resp.writeHead(200, {'Content-Type':'application/json'})
    resp.end(JSON.stringify({
        'status':'idle'
      , 'action':'/'+env.uuid+'/_idle/'
      , 'adverb':'xhr'
    }))
  }
}

proto.env_suite = function(req, resp, env_uuid, run_uuid) {
  var self = this
    , env = self.get_environment_by_uuid(env_uuid) || bail('no such env')
    , run = self.get_run_by_uuid(run_uuid) || bail('no such run')
    , suite = run.current() || bail('no such suite')
    , wants_json = run.wants_json()
    , is_browserify = (run.request.client.browserify || (run.request.client.dnode && run.request.client.dnode.browserify))

  // what are we sending down?
  // well. we need to send an entire new page with the proper dom 
  // (or if the enviroment wants json, the html as part of a bigger JSON blob.)

  self.get_bundled_js(is_browserify, then_load)

  function then_load(err, bundled_js) {
    bundled_js = err ? '' : bundled_js
    run.request.client.load(run.current().name, function(err, data) {
      suite.load_from(data)

      suite.get_html(function got_suite_html(err, html) {
        if(err || !html)
          html = self.templates.base_suite+''

        var main_url = '/'+env_uuid+'/'+run_uuid+'/_media/'+suite.name
          , start = html.indexOf('</head')
          , lhs = html.slice(0, start)
          , rhs = html.slice(start)

        if (!is_browserify) {
          bundled_js += '<script type="text/javascript" src="/media/3p/require.min.js" data-main="'+main_url+'"></script>'
        } else {
          bundled_js += '<script type="text/javascript" src="/media/browserify/' + run_uuid + '.js"></script>'
          bundled_js += '<script type="text/javascript" src="' + main_url + '"></script>'
        }
        html = lhs + bundled_js + rhs

        if(wants_json) {
          resp.writeHead(200, {'Content-Type':'application/json'})
          resp.end(JSON.stringify({'body':html}))
        } else {
          resp.writeHead(200, {'Content-Type':'text/html'})
          resp.end(html)
        }

        self.emit('suite', run, env, suite)
      })
    })
  }
}

proto.env_suite_finish = function(req, resp, env_uuid, run_uuid) {
  // this receives the results from the browser, and emits them as "data"
  // against  
  var self = this
    , env = this.get_environment_by_uuid(env_uuid) || bail('no such env')
    , run = this.get_run_by_uuid(run_uuid) || bail('no such run')
    , suite = run.current()
    , data = []
    
  req.on('data', data.push.bind(data))
  req.on('end',  resp_finished)

  function resp_finished() {
    if(!suite)
      return return_to_idle()

    try { 
      data = data.join('')
      data = JSON.parse(data)
    } catch(err) {
      return bad_request()
    }

    // report the final results of this suite.
    run.report(env, suite, data)
    self.emit('result', run, env, suite, data)

    run.load_next_test(function(err) {
      !err ? send_to_next_test() : return_to_idle(err)
    })

  }

  function send_to_next_test() {
    resp.writeHead(200, {'Content-Type':'application/json'})
    resp.end(JSON.stringify({
        'status':'testing'
      , 'action':'/'+env_uuid+'/'+run_uuid+'/'
      , 'adverb':'GET'
    }))
  }

  function return_to_idle(err) {
    // dump that test run.
    self.test_runs.splice(self.test_runs.indexOf(run), 1)
    self.browserify_bundles[run_uuid] && delete self.browserify_bundles[run_uuid]

    resp.writeHead(200, {'Content-Type':'application/json'})
    resp.end(JSON.stringify({
        'status':'idle'
      , 'action':'/'+env_uuid+'/'
      , 'adverb':'GET'
    }))

    self.emit('finish', run, env, err)
  }

  function bad_request() {
    suite.fatal()

    return return_to_idle()  
  }

}

proto.env_suite_update = function(req, resp, env_uuid, run_uuid, status) {
  var self = this
    , env = this.get_environment_by_uuid(env_uuid) || bail('no such env')
    , run = this.get_run_by_uuid(run_uuid) || bail('no such run')

  run.send_update(env, status) 
  resp.writeHead(200, {'Content-Type':'application/json'})
  resp.end(JSON.stringify({'status':'okay'}))

  self.emit('update', run, env, status)
}

proto.env_suite_endpoint = function(req, resp, env_uuid, run_uuid, endpoint) {
  // this calls into the client's stubbed XHR code.
  var self = this
    , env = this.get_environment_by_uuid(env_uuid) || bail('no such env')
    , run = this.get_run_by_uuid(run_uuid) || bail('no such run')
    , suite = run.current()

  suite.respond_endpoint(req, resp, endpoint)
}

proto.env_suite_media = function(req, resp, env_uuid, run_uuid, endpoint) {
  // this calls the client server and requests specific media.
  var self = this
    , env = this.get_environment_by_uuid(env_uuid) || bail('no such env')
    , run = this.get_run_by_uuid(run_uuid) || bail('no such run')
    , suite = run.current()

  suite.respond_media(req, resp, endpoint, env, run)
}

function bail(message) {
  throw new Error(message)
}

proto.env_suite_repl = function(req, resp, env_uuid, run_uuid) {
  var self = this
    , env = this.get_environment_by_uuid(env_uuid) || bail('no such env')
    , run = this.get_run_by_uuid(run_uuid) || bail('no such run')
    , suite = run.current()
    , client = run.request.client

  if(req.method === 'POST') {
    repl_put()
  } else {
    repl_get()
  }

  function repl_get() {
    client.repl_get(req.META.query.ident, function(data) {
      resp.writeHead(200, {'Content-Type':'text/plain'})
      resp.end(data)
    })
  }

  function repl_put() {
    var data = []

    req.on('data', data.push.bind(data))
    req.on('end', function() {
      try { 
        client.repl_put(data.join(''))
      } finally {
        resp.writeHead(200, {'Content-Type':'text/plain'})
        resp.end('ok')
      }
    })
  }
}

proto.env_suite_log = function(req, resp, env_uuid, run_uuid) {
  var self = this
    , env = this.get_environment_by_uuid(env_uuid) || bail('no such env')
    , run = this.get_run_by_uuid(run_uuid) || bail('no such run')
    , suite = run.current()
    , client = run.request.client
    , data = []

  req.on('data', data.push.bind(data))
  req.on('end', function() {
    try { 
      client.console(env.type, data.join(''))
    } finally {
      resp.writeHead(200, {'Content-Type':'text/plain'})
      resp.end('ok')
    }
  })
}

proto.templates = {}
proto.templates.index = readfile(__dirname+'/templates/index.html')
proto.templates.base_suite = readfile(__dirname+'/templates/suite.html')
proto.templates.env = readfile(__dirname+'/templates/env.html')
