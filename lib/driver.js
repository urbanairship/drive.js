var http = require('http')
  , url = require('url')
  , dnode = require('dnode')
  , fs = require('fs')
  , readfile = fs.readFileSync.bind(fs)
  , paperboy = require('paperboy')
  , path = require('path')
  , EE = require('events').EventEmitter

var Environment = require('./environment')        // <-- a browser (or node) providing an environment
  , Client = require('./client')
  , Request = require('./request')

module.exports = Driver

function Driver(port) {
  this.port = port
  this.test_run_requests = []
  this.test_runs = []
  this.environments = []
  this.types = [] 
  EE.call(this)
}

var cons = Driver
  , proto = cons.prototype = new EE

proto.constructor = cons

proto.request_test_run = function(test_run_request) {
  if(test_run_request.accepted_by(this)) {
    this.test_run_requests.push(test_run_request)
    return true
  }

  return false
}

proto.dnode = function() {
  var self = this

  return dnode(function(client) {
    var drive_client = new Client(client)
    this.request_tests = function(tests, wants) {
      var request = new Request(drive_client, tests, wants || [])
        , missing

      if(!self.request_test_run(request)) {
        missing = wants.filter(function(want) {
          return self.types.indexOf(want) > -1
        })

        client.output('could not fulfill '+missing+', exiting...')
        client.exit()
      } else {
        client.output('testing against:\n\t'+request.environment_targets.join('\n\t')+'\n')
      }
    }
  })
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
}

proto.on_request = function handler(req, resp) {
  debugger
  var urlinfo = url.parse(req.url, true)
    , route
    , match

  this.routes.some(function(test_route) {
    return (match = test_route[0].exec(urlinfo.pathname)) && (route = test_route)
  })

  if(!match) {
    resp.writeHead(404, {'Content-Type':'text/plain'})
    return resp.end('wat')
  }

  req.META = urlinfo

  try { 
    return this[route[1]].apply(this, [req, resp].concat(match.slice(1)))
  } catch(err) {
    resp.writeHead(500, {'Content-Type':'text/html'})
    resp.end('<pre>'+err.stack+'</pre>')
  }
}

proto.generate_uuid = require('./uuid')

proto.routes = [
    [/^\/$/,                                              'index']
  , [/^\/register\/$/,                                    'xhr_register']
  , [/^\/media\/(.*)/,                                    'media']
  , [/^\/([\d\w\-]+)\/$/,                                 'env'] 
  , [/^\/([\d\w\-]+)\/_idle\/$/,                          'xhr_idle']
  , [/^\/([\d\w\-]+)\/([\d\w\-]+)\/$/,                    'env_suite']
  , [/^\/([\d\w\-]+)\/([\d\w\-]+)\/(pass|fail|error)\/$/, 'env_suite_update']
  , [/^\/([\d\w\-]+)\/([\d\w\-]+)\/_respond\/$/,          'env_suite_finish']
  , [/^\/([\d\w\-]+)\/([\d\w\-]+)\/_media\/(.*)/,         'env_suite_media']
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

proto.media = function(req, resp, endpoint) {
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
}

proto.xhr_idle = function(req, resp, uuid) {
  var self = this

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
    test_run = test_req.create_run(env)

    // fulfill the environment for the test request.
    test_req.fulfill(env)

    // and if we're cool, then remove that test run request.
    if(test_req.is_fulfilled())
      self.test_run_requests.shift()

    self.test_runs.push(test_run)

    resp.writeHead(200, {'Content-Type':'application/json'})
    resp.end(JSON.stringify({
        'status':'newtest'
      , 'action':'/'+env.uuid+'/'+test_run.uuid+'/'
      , 'adverb':'GET'
    }))
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

  // what are we sending down?
  // well. we need to send an entire new page with the proper dom 
  // (or if the enviroment wants json, the html as part of a bigger JSON blob.)

  run.request.client.load(run.current().name, function(err, data) {
    suite.load_from(data)

    suite.get_html(function got_suite_html(err, html) {
      if(err || !html)
        html = self.templates.base_suite+''

      var main_url = '/'+env_uuid+'/'+run_uuid+'/_media/'+suite.name
        , start = html.indexOf('<head')
        , end = html.indexOf('>', start)
        , lhs = html.slice(0, start)
        , rhs = html.slice(end+1)
        , mid = html.slice(start, end+1)

      

      html = lhs + mid + [ 
      , '<script type="text/javascript" src="/media/3p/json2.min.js"></script>'
      , '<script type="text/javascript" src="/media/3p/es5-shim.min.js"></script>'
      , '<script type="text/javascript" src="/media/driver.js"></script>'
      , '<script type="text/javascript" src="/media/assert.js"></script>'
      , '<script type="text/javascript" src="/media/suite.js"></script>'
      , '<script type="text/javascript" src="/media/3p/require.min.js" data-main="'+main_url+'"></script>'
      ].join('')+rhs

      if(wants_json) {
        resp.writeHead(200, {'Content-Type':'application/json'})
        resp.end(JSON.stringify({'body':html}))
      } else {
        resp.writeHead(200, {'Content-Type':'text/html'})
        resp.end(html)
      }
    })
  })
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

    run.load_next_test(function(err) {
      !err ? send_to_next_test() : return_to_idle()
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

  function return_to_idle() {

    // dump that test run.
    self.test_runs.splice(self.test_runs.indexOf(run), 1)

    resp.writeHead(200, {'Content-Type':'application/json'})
    resp.end(JSON.stringify({
        'status':'idle'
      , 'action':'/'+env_uuid+'/'
      , 'adverb':'GET'
    }))
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

  suite.respond_media(req, resp, endpoint)
}

function bail(message) {
  throw new Error(message)
}

proto.templates = {}
proto.templates.index = readfile(__dirname+'/templates/index.html')
proto.templates.base_suite = readfile(__dirname+'/templates/suite.html')
proto.templates.env = readfile(__dirname+'/templates/env.html')
