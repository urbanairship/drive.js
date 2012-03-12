module.exports = Request

var Run = require('./run')

function Request(client, tests, wants) {
  this.client = client
  this.environment_targets = wants
  this.server = null
  this.tests = tests

  this.pending = {}
  this.fulfilled = {}

  this.cached_suites = {}
}

var cons = Request
  , proto = cons.prototype

proto.generate_uuid = require('./uuid')

proto.report = function(env, suite, data, run) {
  var self = this

  ;(self.fulfilled[env.type] = (self.fulfilled[env.type] || {}))[suite.name] = data
  delete self.pending[env.type]

  if(Object.keys(self.pending).length === 0 && self.environment_targets.length === 0) {


    var is_done = Object.keys(self.fulfilled).reduce(function(lhs, rhs) {
      return lhs && self.tests.length === Object.keys(self.fulfilled[rhs]).length 
    }, true)


    if(is_done)
      self.client.report(env.type, suite.name, self.fulfilled, true)
  }
}

proto.accepted_by = function(server) {
  this.server = server

  var unique = Function('i','x','all', 'return x === all.indexOf(i)')
  if(!this.environment_targets.length) {
    // we just want all the types supported by this server
    this.environment_targets = server.types.filter(unique)
  }

  return JSON.stringify(this.environment_targets.sort()) === JSON.stringify(server.types.filter(unique).sort())
}

proto.wants = function(environment) {
  return !!~this.environment_targets.indexOf(environment.type)
}

proto.create_run = function(environment) {
  var uuid = this.generate_uuid()
  return new Run(uuid, this, this.tests.slice())
}

proto.fulfill = function(env, test_run) {
  this.pending[env.type] = test_run
  this.environment_targets.splice(this.environment_targets.indexOf(env.type), 1)
}

proto.is_fulfilled = function() {
  return this.environment_targets.length === 0
}

proto.send = function(message) {
  this.client.receive(message)
}
