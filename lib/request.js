// (c) 2012 Urban Airship and Contributors 

module.exports = Request

var Run = require('./run')

function Request(ident, client, tests, wants, want_repl, want_coverage) {
  this.ident = ident
  this.client = client
  this.environment_targets = wants
  this.server = null
  this.tests = tests


  this.want_repl = want_repl
  this.want_coverage = want_coverage

  this.fulfilled = {}
  this.queued = {}

  this.cached_suites = {}
}

var cons = Request
  , proto = cons.prototype

proto.generate_uuid = require('./uuid')

proto.set_targets = function(targets) {
  var self = this

  self.environment_targets = targets
  self.queued = self.queued || {}

  self.environment_targets.forEach(function(target) {
    self.queued[target] = self.tests.slice()
  })  
}

proto.report = function(env, suite, data, run) {
  var self = this

  ;(self.fulfilled[env.type] = (self.fulfilled[env.type] || {}))[suite.name] = {result:data.data, coverage:data.coverage}

  if(self.is_done())
    self.client.report(env.type, suite.name, self.fulfilled, true)
}

proto.is_done = function(test) {
  var self = this
  return  Object.keys(self.queued).length === 0 &&
          Object.keys(self.fulfilled).length === this.environment_targets.length &&
          Object
          .keys(self.fulfilled)
          .reduce(function(lhs, rhs) {
            return lhs && self.tests.length === Object.keys(self.fulfilled[rhs]).length
          }, true)
}

proto.accepted_by = function(server) {
  this.server = server

  var unique = Function('i','x','all', 'return x === all.indexOf(i)')
  if(!this.environment_targets.length) {
    // we just want all the types supported by this server
    this.set_targets(server.types.filter(unique))
  } else {
    var targets = this.environment_targets.slice()
      , self = this
      , matched = []

    targets.forEach(function(target) {
      target = new RegExp(target.split(/\s*\/\s*/g).join(' \\/ '))
      matched = matched.concat(server.types.filter(function(type) {
        return target.test(type)
      })).filter(unique)
    })

    this.set_targets(matched)
    return matched.length
  }

  return JSON.stringify(this.environment_targets.sort()) === JSON.stringify(server.types.filter(unique).sort())
}

proto.wants = function(environment) {
  return environment.type in this.queued
}

proto.create_run = function(environment, num_envs) {
  var uuid = this.generate_uuid()
    , split_by = this.want_repl || this.queued[environment.type].length !== this.tests.length ? 1 : Math.min(4, num_envs)
    , splice_num = Math.ceil(this.queued[environment.type].length / split_by)
    , tests = this.queued[environment.type].splice(0, splice_num)

  if(this.queued[environment.type].length === 0)
    delete this.queued[environment.type]

  return new Run(uuid, this, tests, this.want_repl)
}

proto.is_fulfilled = function() {
  return Object.keys(this.queued).length === 0
}

proto.send = function(message) {
  this.client.receive(message)
}
