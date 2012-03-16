module.exports = CLI

var nopt = require('nopt')
  , fs = require('fs')
  , path = require('path')

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

proto.exit = function(num) {
  var self = this
  if(self.stderr.write('\n') !== -1)
    done()
  else
    self.stderr.on('drain', done)

  function done() {
    process.exit(num)
  }
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

proto.get_tests = function() {
  return this.options.argv.remain.length ? this.validate_files(this.options.argv.remain) : this.search_files(process.cwd())
}

proto.is_valid_file = function(filename) {
  try {
    Function('endpoints', 'html', 'suite', 'return '+fs.readFileSync(filename, 'utf8'))(Function(), Function(), Function())
    return true
  } catch(err) {
    return false
  }
}

proto.validate_files = function(files) {
  var ret = []
    , self = this

  files.forEach(function(file) {
    try { 
      if(fs.statSync(file).isDirectory()) {
        ret = ret.concat(self.search_files(file))
      } else if(self.is_valid_file(file)) {
        ret.push(file)
      }
    } catch(err) { console.log(err) }
  })

  return ret
}

proto.search_files = function(dir, ret) {
  ret = ret || []

  var self = this

  fs.readdirSync(dir)
    .forEach(function(item) {
      item = path.join(dir, item)
      if(fs.statSync(item).isDirectory()) {
        self.search_files(item, ret)      
      } else if(/\.test\.js$/.test(item) && self.is_valid_file(item)) {
        ret.push(item)
      }
    })

  return ret
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
    , rest = this.get_tests()
    , client = new Client(this, rest)
    , want = this.options.want ? this.options.want : [] 

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
      , rest = self.get_tests()
      , want = self.options.want ? self.options.want : [] 
      , trr  = new Request(client, rest, want)

    driver.request_test_run(trr)
  }

}
