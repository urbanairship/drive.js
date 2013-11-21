// (c) 2012 Urban Airship and Contributors

var EE = require('events').EventEmitter
  , paperboy = require('paperboy')
  , crypto = require('crypto')
  , dnode = require('dnode')
  , path = require('path')
  , http = require('http')
  , url = require('url')
  , fs = require('fs')
  , readfile = fs.readFileSync.bind(fs)

var Environment = require('./environment')        // <-- a browser (or node) providing an environment
  , Request = require('./request')
  , Client = require('./client')

module.exports = Driver

function Driver(port, bundle) {
  this.port = port
  this.test_run_requests = []
  this.test_runs = []
  this.environments = []
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

proto.get_bundled_js = function(ready) {
  var self = this

  if(self.bundle_cache)
    return ready(null, self.bundle_cache)

  var base_bundle = [
      '<script type="text/javascript" src="/media/3p/json3.min.js"></script>'
    , '<script type="text/javascript" src="/media/driver.js"></script>'
    , '<script type="text/javascript" src="/media/assert.js"></script>'
    , '<script type="text/javascript" src="/media/suite.js"></script>'
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
    self.bundle_cache = '<script type="text/javascript" ' +
        'src="/media/redirect.js"></script>' + output.join('') + base_bundle

    ready(null, self.bundle_cache)
  }
}

proto.browserify = function(client, tests, run_uuid, ready) {
  var self = this
    , run

  run = self.get_run_by_uuid(run_uuid)
  client.bundle_browserify(tests, process_bundle)

  function process_bundle(err, bundle, test_bundles) {
    if(err) {
      return ready(err)
    }

    run.test_bundles = test_bundles
    self.browserify_bundles[run_uuid] = bundle
    ready(null)
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
    var drive_client = new Client(client, conn, false, {})

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

    client.output('could not fulfill ' + missing + ', exiting...')

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
    resp.writeHead(404, {'Content-Type': 'text/plain'})

    return resp.end('wat')
  }

  req.META = urlinfo

  try { 
    return self[route[1]].apply(self, [req, resp].concat(match.slice(1)))
  } catch(err) {
    resp.writeHead(500, {'Content-Type': 'text/html'})
    resp.end('<pre>' + err.stack + '</pre>')
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
  resp.writeHead(200, {'Content-Type': 'text/html'})
  resp.end(this.templates.index)
}

proto.env = function(req, resp) {
  resp.writeHead(200, {'Content-Type': 'text/html'})
  resp.end(this.templates.env)
}

var MEDIA_DIR = path.join(__dirname, '../public/')

proto.browserify_bundle = function(req, resp, uuid) {
  if(this.browserify_bundles[uuid]) {
    resp.writeHead(200, {'Content-Type': 'text/javascript'})

    return resp.end(this.browserify_bundles[uuid])
  }

  resp.writeHead(404, {'Content-Type': 'text/plain'})
  resp.end('No browserify bundle for this run')
}

proto.media_bundle = function(req, resp, hash) {
  var data = this.bundle_hash[hash]

  this.emit('bundle', hash)

  if(data) {
    resp.writeHead(200, {'Content-Type': 'text/javascript'})
    resp.end(data)
  } else {
    resp.writeHead(404, {'Content-Type': 'text/plain'})
    resp.end('missing ' + hash)
  }
}

proto.media = function(req, resp, endpoint) {
  this.emit('media', req.url)
  req.url = 'http://derp.com/' + endpoint
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

  resp.writeHead(200, {'Content-Type': 'application/json'})
  resp.end(JSON.stringify({
    'uuid': uuid
  , 'status': 'registered'
  , 'action': '/'+uuid+'/'
  , 'adverb': 'GET'
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
    resp.writeHead(200, {'Content-Type': 'application/json'})
    resp.end(JSON.stringify({
        'status': 'timeout'
      , 'action': '/register/'
      , 'adverb': 'xhr'
    }))
  }

  function respond_new_test() {
    var test_req = self.test_run_requests[0]
      , client = test_req.client.dnode || test_req.client
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

    if(client.browserify) {

      self.browserify(
          client
        , test_req.tests.slice()
        , test_run.uuid
        , continue_request
      )
    } else {
      continue_request(null)
    }

    function continue_request(err) {
      if(err) {
        console.log(err)
      }

      resp.writeHead(200, {'Content-Type': 'application/json'})
      resp.end(JSON.stringify({
          'status': 'newtest'
        , 'action': '/' + env.uuid + '/' + test_run.uuid + '/'
        , 'adverb': 'GET'
      }))

      self.emit('run', test_run, env)
    }
  }

  function respond_idle() {
    // reset the timeout.
    env.timeout = setTimeout(self.timeout_client.bind(self, env), 1000)

    resp.writeHead(200, {'Content-Type': 'application/json'})
    resp.end(JSON.stringify({
        'status': 'idle'
      , 'action': '/'+env.uuid+'/_idle/'
      , 'adverb': 'xhr'
    }))
  }
}

proto.env_suite = function(req, resp, env_uuid, run_uuid) {
  var self = this
    , env = self.get_environment_by_uuid(env_uuid) || bail('no such env')
    , run = self.get_run_by_uuid(run_uuid) || bail('no such run')
    , client = run.request.client.dnode || run.request.client
    , suite = run.current() || bail('no such suite')
    , is_browserify = client.browserify
    , is_failfast = client.failfast
    , wants_json = run.wants_json()
    , config

  config = '\nwindow.__config__ = {}\n' +
      'window.__config__.failfast = ' + is_failfast + '\n' +
      'window.__config__.browserify = ' + is_browserify + '\n'
  // what are we sending down?
  // well. we need to send an entire new page with the proper dom
  // (or if the enviroment wants json, the html as part of a bigger JSON blob.)

  self.get_bundled_js(then_load)

  function then_load(err, bundled_js) {
    bundled_js = err ? '' : bundled_js
    bundled_js += config

    run.request.client.load(run.current().name, function(err, data) {
      suite.load_from(data)

      suite.get_html(function got_suite_html(err, html) {
        if(err || !html)
          html = self.templates.base_suite+''

        var start = html.indexOf('</head')
          , lhs = html.slice(0, start)
          , rhs = html.slice(start)
          , main_url

        main_url = '/' + env_uuid + '/' + run_uuid + '/_media/' + suite.name

        if(is_browserify) {
          bundled_js += '<script type="text/javascript" charset="utf-8" ' +
              'src="/media/browserify/' + run_uuid + '.js"></script>' +
              '<script type="text/javascript" src="' + main_url + '"></script>'
        } else {
          bundled_js += '<script type="text/javascript" ' +
              'src="/media/3p/require.min.js" data-main="' +
              main_url + '"></script>'
        }

        html = lhs + bundled_js + rhs

        if(wants_json) {
          resp.writeHead(200, {'Content-Type': 'application/json'})
          resp.end(JSON.stringify({'body': html}))
        } else {
          resp.writeHead(200, {'Content-Type': 'text/html'})
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

    if(run.request.failing) {
      return return_to_idle()
    }

    run.load_next_test(function(err) {
      !err ? send_to_next_test() : return_to_idle(err)
    })

  }

  function send_to_next_test() {
    resp.writeHead(200, {'Content-Type': 'application/json'})
    resp.end(JSON.stringify({
        'status': 'testing'
      , 'action': '/' + env_uuid + '/' + run_uuid + '/'
      , 'adverb': 'GET'
    }))
  }

  function return_to_idle(err) {
    // dump that test run.
    self.test_runs.splice(self.test_runs.indexOf(run), 1)

    if(self.browserify_bundles[run_uuid]) {
      delete self.browserify_bundles[run_uuid]
    }

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
    , data = []

  req.on('data', data.push.bind(data))
  req.on('end', function() {
    var client = run.request.client.dnode || run.request.client

    if(client.failfast && status !== 'pass') {
      run.request.failing = true
    }

    run.send_update(env, status, JSON.parse(data.join('')))
    resp.writeHead(200, {'Content-Type': 'application/json'})
    resp.end(JSON.stringify({'status': 'okay'}))

    self.emit('update', run, env, status)
  })

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
