module.exports = CLI

var nopt = require('nopt')

function CLI(argv, streams) {
  streams = streams || {}
  this.options = nopt(this.noptions, {}, argv)
  this.stderr = streams.stderr || process.stderr
  this.stdout = streams.stdout || process.stdout
}

var cons = CLI
  , proto = cons.prototype

proto.noptions = {
    'driver':String
  , 'spawn':Number
  , 'want':String
  , 'local':null
  , 'want':Array
}

proto.write = function(what) {
  this.stderr.write(what)
}

proto.should_exit = function() {
  return !this.options.local
}

proto.exec = function() {
  if('spawn' in this.options) {
    return this.spawn(this.options.spawn)    
  }

  if('driver' in this.options) {
    return this.client(this.options.driver)
  }
  
  if('local' in this.options) {
    return this.local()
  }
  return this.local()
}

proto.spawn = function(port) {
  var Driver = require('./driver')

  this.write('spawning driver server at \x1b[33m'+port+'\x1b[0m with dnode listening on \x1b[33m'+(port+1)+'\x1b[0m\n')

  var driver = new Driver()
  driver.server().listen(port)
  driver.dnode().listen(port+1)
}

proto.client = function(driver_url) {
  if(!this.options.argv.remain.length)
    return console.log('must provide a list of files to test')

  var Client = require('./client').LocalClient
    , url = require('url')
    , http = require('http')
    , dnode = require('dnode')
    , parsed = url.parse(!isNaN(driver_url) ? 'http://localhost:'+driver_url+'/' : driver_url)
    , rest = this.options.argv.remain
    , client = new Client(this, rest)
    , want = this.options.want ? [this.options.want] : [] 
  parsed.port = (~~parsed.port) + 1

  dnode(client.dnodify()).connect({host:parsed.hostname, port:parsed.port}, on_connect)

  function on_connect(remote, server) {
    remote.request_tests(rest || [], want)
  }
}

proto.local = function() {
  if(!this.options.argv.remain.length)
    return console.log('must provide a list of files to test')

  var dnode = require('dnode')
    , self = this

  var Env = require('./node_env')
    , Driver = require('./driver')
    , Client = require('./client').LocalClient
    , port = 9000

  var driver = new Driver()
    , Request = require('./request')

  driver.server().listen(port)
  driver.on('environment', got_env)

  var env = new Env('http://localhost:'+port)

  env.connect()


  function got_env() {
    var client = new Client(self, self.options.argv.remain)
      , rest = self.options.argv.remain
      , want = self.options.want ? [self.options.want] : [] 
      , trr  = new Request(client, rest, want)

    driver.request_test_run(trr)
  }

}
