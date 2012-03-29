module.exports = Client

var fs = require('fs')
  , path = require('path')
  , util = require('util')
  , tracejs = require('tracejs').trace

function Client(dnode, conn) {
  this.dnode = dnode
  conn.on('end', this.disconnect_all.bind(this))
}

var cons = Client
  , proto = cons.prototype

// server side

proto.send = function(message) {

}

proto.disconnect_all = function() {
  for(var key in this) if(typeof this[key] == 'function')
    this[key] = Function()

  this.okay = Function('return false')
}

proto.okay = function() {
  return true
}

proto.repl_get = function(ident, ready) {
  this.dnode.repl_get(ident, ready)
}

proto.repl_put = function(json_str) {
  this.dnode.repl_put(json_str)
}

proto.update = function(env_type, suite_name, msg) {
  this.dnode.update(env_type, suite_name, msg) 
}

proto.report = function(env, name, result_data, is_done) {
  this.dnode.report(env, name, result_data, is_done)
}

proto.load = function(suite_name, ready) {
  this.dnode.load(suite_name, ready)
}

proto.load_media = function(endpoint, ready) {
  this.dnode.load_media(endpoint, ready)
}

proto.load_html = function(from_suite, endpoint, ready) {
  this.dnode.load_html(from_suite, endpoint, ready)
}

proto.console = function(env_type, json_str) {
  this.dnode.console(env_type, json_str)
}

function Local(cli, files) {
  this.cwd = process.cwd()
  this.num_errors = 0
  this.cli = cli
  this.files = files

}

proto = Local.prototype

proto.output = function(data) {
  this.cli.write(data)
}

proto.update = function(type, name, msg) {
  this.cli.write(msg)

  msg !== '.' && ++this.num_errors
}

proto.load = function(name, ready) {
  fs.readFile(path.join(this.cwd, name), 'utf8', ready)
}

proto.report = function(env, suite_name, result_data, is_done) {
  var self = this
    , exceptions = []
    , summary = {}

  process.removeAllListeners('uncaughtException')

  Object.keys(result_data).forEach(function(browser) {
    var passes = 0
      , fails = 0
      , errors = 0
      , ms = 0

    Object.keys(result_data[browser]).forEach(function(file) {
      Object.keys(result_data[browser][file].data).forEach(function(test_name) {
        var test_result = result_data[browser][file].data[test_name]

        ms += test_result.elapsed

        if(test_result.pass) {
          ++passes
        } else {
          if(test_result.assertion)
            ++fails
          else
            ++errors

          var augmented = Object.create(test_result)

          augmented.test_file = file
          augmented.browser = browser
          augmented.fail = test_result.assertion

          exceptions.push(augmented)
        }
      })
    })

    summary[browser] = {passes:passes, fails:fails, errors:errors, total:passes+fails+errors, ms:ms}
  })

  self.cli.write('\n\n')

  exceptions.forEach(function(exception) {
    self.cli.write(
      '\n'+exception.test_file + 
      ': ' +
      exception.browser +
      ': ' +
      (exception.fail ? 'FAIL' : 'ERROR') + 
      '\n' + 
      self.format_exc(exception.browser, exception, exception.fail)
    )
  })

  self.cli.write('\n\n')

  Object.keys(summary).forEach(function(browser) {
    var data = summary[browser]

    self.cli.write(browser+': '+(data.fails || data.errors ? 'FAIL' : 'PASS')+' in '+data.ms+'ms, (passed '+data.passes+'/'+data.total+' tests with '+data.errors+' errors, '+data.fails+' failures)\n')
  })

  if(is_done && self.cli.should_exit())
    self.cli.exit(self.num_errors)
}

function firefox_to_webkit(trace) {
  var bits = trace.split('\n')
  
  return 'Error: Firefox\n'+bits.map(function(bit) {
    bit = bit.split(')@/')
    var fn = bit[0]
      , loc = bit[1]

    fn = fn.split('(')[0].replace(/\s+/g, '')
    loc = '/'+loc+':0'

    return '    '+'at '+(fn.length ? loc : fn +' ('+loc+')')
  }).slice(0, -1).join('\n')

  return trace  
}

proto.format_exc = function(browser, trace, is_fail) {
  trace = (trace.stack || ('Error: '+trace.message+'\n    at <unknown> ('+trace.sourceURL +':'+trace.lineNumber+':0)'))
      .replace(/http(s)?:\/\/([^\/]+)(:\d+)?\/media\//g, path.join(__dirname, '..', 'public')+'/')
      .replace(/http(s)?:\/\/([^\/]+)(:\d+)?\/([\w\d\-]+)\/([\w\d\-]+)\/_media\//g, this.cwd+'/')

  var original_trace = trace

  if(/firefox/i.test(browser)) {
    trace = firefox_to_webkit(trace)
  }

  try {
    var traced = tracejs({stack:trace})
    return traced.toString()
  } catch(err) {
    return original_trace
  }

  return trace
}

proto.load_media = function(name, ready) {
  fs.readFile(path.join(this.cwd, name), 'utf8', ready)
}

proto.load_html = function(from_suite, template_path, ready) {
  template_path = path.join(path.dirname(path.join(this.cwd, from_suite)), template_path)

  fs.readFile(template_path, 'utf8', ready)
}

proto.exit = function() {
  process.exit(1)
}

proto.dnodify = function() {
  var out = {}
  for(var key in this.constructor.prototype) if(this.constructor.prototype.hasOwnProperty(key))
    out[key] = this[key].bind(this)
  return out
}

proto.repl_put = function(json_str) {
  try {
    console.log(JSON.parse(json_str))
  } catch(err) {
    console.log(json_str)
  }
}

proto.okay = function() {
  return true
}

proto.repl_get = function(ident, ready) {
  this.cli.repl.take(ident, ready)
}

proto.console = function(env_type, json_str) {
  var json = JSON.parse(json_str)
  this.cli.write('\n===== '+env_type+' =====\n'+json.map(function(item) {
    return util.inspect(item, true, 5, true) + ' ' 
  })+'\n')
}

proto.environments = function(targets) {
  var self = this
  targets.forEach(function(target) {
    self.cli.write(target+'\n')
  })
}

Client.LocalClient = Local
