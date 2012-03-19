module.exports = Run

var EE = require('events').EventEmitter
  , Suite = require('./suite')

function Run(uuid, request, tests, want_repl) {
  this.uuid = uuid
  this.request = request
  this.want_repl = want_repl

  this.tests = (tests || []).map(function(x) {
    return request.cached_suites[x] || new Suite(x, request)
  })
}

var cons = Run
  , proto = cons.prototype = new EE

proto.constructor = cons

proto.send_update = function(env, type) {
  var msg = {
      pass:'.'
    , fail:'F'
    , error:'E'
  }[type] || '?'

  this.request.client.update(env.type, this.current().name, msg)
}

proto.current = function() {
  return this.tests[0]  
}

proto.wants_json = function() {
  return this.request && this.request.client && this.request.client.wants_json
}

proto.report = function(env, suite, data) {
  this.request.report(env, suite, data, this)
}

proto.load_next_test = function(ready) {
  this.tests.shift()

  if(!this.tests.length)
    return ready(new Error("out of tests"))

  var current = this.current()
    , request = this.request

  if(request.cached_suites[current.name])
    return ready()

  this.request.client.load(current.name, function(data) {
    current.load_from(data)
    request.cached_suites[current.name] = current
    ready()
  })
}
