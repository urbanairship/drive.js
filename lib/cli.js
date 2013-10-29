// (c) 2012 Urban Airship and Contributors

module.exports = CLI

var tracejs = require('tracejs').trace
  , getport = require('getport')
  , burrito = require('burrito')
  , dnode = require('dnode')
  , nopt = require('nopt')
  , path = require('path')
  , http = require('http')
  , url = require('url')
  , fs = require('fs')

var Client = require('./client').LocalClient
  , Request = require('./request')
  , Driver = require('./driver')
  , Env = require('./node_env')
  , REPL = require('./repl')

function CLI(argv, streams) {
  streams = streams || {}
  this.options = nopt(this.noptions, this.nopt_shorthands, argv)
  this.browserify_options = nopt(
      this.browserify_noptions
    , this.browserify_shorthands
    , this.options.argv.remain
    , 0
  )
  this.stderr = streams.stderr || process.stderr
  this.stdout = streams.stdout || process.stdout
}

var cons = CLI
  , proto = cons.prototype

proto.noptions = {
    'driver': String
  , 'spawn': Number
  , 'want': String
  , 'want': Array
  , 'repl': Boolean
  , 'cover': Boolean
  , 'bundle': Array
  , 'adaptor': Array
  , 'browserify': Boolean
  , 'tap': Boolean
  , 'failfast': Boolean
}

proto.nopt_shorthands = {
    'x': ['--failfast']
}

proto.browserify_noptions = {
    'transform': Array
  , 'noparse': Array
  , 'external': Array
  , 'entry': Array
  , 'require': Array
}

proto.browserify_shorthands = {
    't': ['--transform']
  , 'e': ['--entry']
  , 'r': ['--require']
  , 'x': ['--external']
}

proto.exit = function(num) {
  var self = this

  if(self.cached_writes)
    self.cached_writes.map(function(line) {
        process.stdout.write(line)
    })

  if(process.stdout.write('\n'))
    done()
  else
    process.stdout.on('drain', done)

  function done() {
    process.exit(num)
  }
}

proto.write = function(what) {
  this.stdout.write(what)
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
    this.stderr = {write: this.cached_writes.push.bind(this.cached_writes)}
    this.stdout = {write: this.cached_writes.push.bind(this.cached_writes)}
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
  var remain = this.browserify_options.argv.remain

  if(remain.length) {
    return this.validate_files(remain)
  }

  return this.search_files(process.cwd())
}

proto.is_valid_file = function(filename) {
  try {
    var filedata = fs.readFileSync(filename, 'utf8')
    Function('endpoints', 'html', 'suite', 'return '+filedata)(Function(), Function(), Function())
    return true
  } catch(err) {
    console.log('Omitting ' + filename + ' due to error: ')
    try {
      burrito(filedata, function() {})
      console.log(err.message)
    } catch(err) {
      console.log(err.message)
    }

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
  if(!this.browserify_options.argv.remain.length) {
    return console.log('must provide a list of files to test')
  }

  var parsed = url.parse(!isNaN(driver_url) ? 'http://localhost:'+driver_url+'/' : driver_url)
    , want = this.options.want ? this.options.want : []
    , cover = this.options.cover
    , repl = this.options.repl
    , rest = this.get_tests()
    , ident = this.ident
    , client

  client = new Client(
      this
    , rest
    , this.options.browserify
    , this.browserify_options || {}
    , this.options.failfast
  )

  parsed.port = (~~parsed.port) + 1

  if(!rest || !rest.length) {
    return console.log('no tests to request.')
  }

  dnode(client.dnodify()).connect({host:parsed.hostname, port:parsed.port}, on_connect)

  function on_connect(remote, server) {
    remote.request_tests(rest || [], want, repl, cover, ident)
  }
}

proto.local = function() {
  if(!this.browserify_options.argv.remain.length) {
    return console.log('must provide a list of files to test')
  }

  var self = this
    , driver = new Driver(null, self.options.bundle)

  getport(9000, 60000, onport)

  function onport(err, port) {
    if(err) {
      console.log('no port available')
      process.exit(1)
    }

    driver.server().listen(port)
    driver.on('environment', got_env)

    var env = new Env('http://localhost:' + port)

    env.connect()

    function got_env() {
      var want = self.options.want ? self.options.want : []
        , rest = self.get_tests()
        , client
        , trr

      client = new Client(
          self
        , self.browserify_options.argv.remain
        , self.options.browserify
        , self.browserify_options || {}
        , self.options.failfast
      )

      trr = new Request({}, client, rest, want)

      if(!rest || !rest.length) {
        console.log('no valid tests, exiting...')

        return process.exit(1)
      }

      driver.request_test_run(trr)
    }

    if(self.options.adaptor) {
      var cwd = process.cwd()

      self.options.adaptor.forEach(function(adaptor_path) {
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
}
