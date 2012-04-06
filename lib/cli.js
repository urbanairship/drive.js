module.exports = CLI

var nopt = require('nopt')
  , fs = require('fs')
  , path = require('path')
  , REPL = require('./repl')

var Env = require('./node_env')
  , Driver = require('./driver')
  , Client = require('./client').LocalClient
  , Request = require('./request')
  , url = require('url')
  , http = require('http')
  , dnode = require('dnode')

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
  , 'want':Array
  , 'repl':Boolean
  , 'cover':Boolean
  , 'bundle':Array
  , 'adaptor':Array
}

proto.exit = function(num) {
  var self = this

  if(self.cached_writes)
    self.cached_writes.map(function(line) {
        process.stderr.write(line)
    })

  if(process.stderr.write('\n') !== -1)
    done()
  else
    process.stderr.on('drain', done)

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

proto.get_identity = function() {
  var p = path.join(process.env.HOME, '.gitconfig')
    , info

  try {
    info = fs.readFileSync(p, 'utf8')
    info = info.split('[user]')[1].split('[')[0]
    info = info.split('\n').filter(function(line) { return !!~line.indexOf('=') })
    info = info.reduce(function(lhs, rhs) {
      rhs = rhs.split('=')
      lhs[rhs[0].trim()] = rhs[1].trim()
      return lhs
    }, {}) 

    return info
  } catch(err) {
    return {}
  }
}

proto.discover_autobundle = function(dir) {
  dir = dir || process.cwd()

  var check = path.join(dir, '.drive_bundle')
    , next = path.resolve(dir, '..')

  try {
    if(next === dir)
      return []

    return fs.readFileSync(check, 'utf8')
      .split('\n')
      .filter(function(p) { return p.trim().length > 0 })
      .map(function(p) {
        return p.length ? path.resolve(path.join(dir, p)) : p
      })
  } catch(err) {
  }

  return this.discover_autobundle(next)
}

proto.exec = function() {
  this.ident = this.get_identity()

  if(this.options.bundle) {
    this.options.bundle = this.validate_files(this.options.bundle, /\.js$/)
  } else {
    this.options.bundle = this.validate_files(this.discover_autobundle(), /\.js$/)
  }

  if('repl' in this.options) {
    this.repl = new REPL
    this.cached_writes = []
    this.stderr = {write:this.cached_writes.push.bind(this.cached_writes)}
    this.stdout = {write:this.cached_writes.push.bind(this.cached_writes)}
  }

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

proto.validate_files = function(files, m) {
  var ret = []
    , self = this

  files.forEach(function(file) {
    try { 
      if(fs.statSync(file).isDirectory()) {
        ret = ret.concat(self.search_files(file, null, m))
      } else if(self.is_valid_file(file)) {
        ret.push(file)
      }
    } catch(err) { console.log(err) }
  })

  return ret
}

proto.search_files = function(dir, ret, match) {
  ret = ret || []

  match = match || /\.test\.js$/

  var self = this

  fs.readdirSync(dir)
    .forEach(function(item) {
      item = path.join(dir, item)
      if(fs.statSync(item).isDirectory()) {
        self.search_files(item, ret)      
      } else if(match.test(item) && self.is_valid_file(item)) {
        ret.push(item)
      }
    })

  return ret
}

proto.spawn = function(port) {
  this.write('spawning driver server at \x1b[33m'+port+'\x1b[0m with dnode listening on \x1b[33m'+(port+1)+'\x1b[0m\n')

  var driver = new Driver(null, this.options.bundle)
  driver.server().listen(port)
  driver.dnode().listen(port+1)

  if(this.options.adaptor) {
    var cwd = process.cwd()
    this.options.adaptor.forEach(function(adaptor_path) {
      try {
        process.stdout.write('attaching `'+adaptor_path+'`... ')
        require(path.resolve(cwd, adaptor_path))(driver)
        process.stdout.write('attached!\n') 
      } catch(err) {
        process.stdout.write('failed!\n') 
      }
    })
  }
}

proto.client = function(driver_url) {
  if(!this.options.argv.remain.length)
    return console.log('must provide a list of files to test')

  var parsed = url.parse(!isNaN(driver_url) ? 'http://localhost:'+driver_url+'/' : driver_url)
    , rest = this.get_tests()
    , client = new Client(this, rest)
    , want = this.options.want ? this.options.want : [] 
    , repl = this.options.repl
    , cover = this.options.cover
    , ident = this.ident

  parsed.port = (~~parsed.port) + 1

  dnode(client.dnodify()).connect({host:parsed.hostname, port:parsed.port}, on_connect)

  function on_connect(remote, server) {
    remote.request_tests(rest || [], want, repl, cover, ident)
  }
}

proto.local = function() {
  if(!this.options.argv.remain.length)
    return console.log('must provide a list of files to test')

  var self = this
    , port = 9000
    , driver = new Driver(null, this.options.bundle)

  driver.server().listen(port)
  driver.on('environment', got_env)

  var env = new Env('http://localhost:'+port)

  env.connect()

  function got_env() {
    var client = new Client(self, self.options.argv.remain)
      , rest = self.get_tests()
      , want = self.options.want ? self.options.want : [] 
      , trr  = new Request({}, client, rest, want)

    driver.request_test_run(trr)
  }

}
