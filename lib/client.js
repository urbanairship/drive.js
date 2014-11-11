// (c) 2012 Urban Airship and Contributors
//
// Logic to handle reporting for the client from which the tests were run.
// Also supports full-filing RPC calls for html, suites, bundles, console
// output, etc.

module.exports = Client

var browserify = require('browserify/bin/args.js')
  , tracejs = require('tracejs').trace
  , path = require('path')
  , util = require('util')
  , fs = require('fs')

var DIR = path.resolve(path.join(__dirname, '..'))
  , test_tr = require('./test_transform')
  , hash = require('./hash')

function Client(dnode, conn, for_browserify, browserify_options, failfast) {
  this.browserify = !!for_browserify
  this.browserify_options = browserify_options
  this.failfast = failfast
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

proto.update = function(file, msg, suite, test_number) {
  this.dnode.update(file, msg, suite, test_number)
}

proto.report = function(env, name, result_data, is_done, total_tests) {
  this.dnode.report(env, name, result_data, is_done, total_tests)
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
  this.browserify = !!cli.options.browserify
  this.browserify_options = cli.browserify_options || []
  this.current_suite = null
  this.failfast = cli.options.failfast
  this.files = files

}

proto = Local.prototype

proto.output = function(data) {
  this.cli.write(data)
}

proto.update = function(name, type, suite_info, test_number) {
  var msg

  if(this.cli.options.tap) {
    if(suite_info.suite.name !== this.current_suite) {
      var suite_test_count = Object.keys(suite_info.suite.members).length

      this.current_suite = suite_info.suite.name
      this.cli.write(
          '### ' + this.current_suite + ' (' +
          suite_test_count + ' tests)\n'
      )
    }

    msg = type === 'pass' ? 'ok ' : 'not ok '
    msg += test_number + ' - ' + suite_info.test + '\n'
  } else {
    msg = {
        pass: '.'
      , fail: 'F'
      , error: 'E'
    }[type] || '?'
  }

  this.cli.write(msg)

  type !== 'pass' && ++this.num_errors
}

proto.load = function(name, ready) {
  fs.readFile(path.join(this.cwd, name), 'utf8', ready)
}

proto.bundle_browserify = function(tests, ready) {
  var self = this
    , browserify_options = {}
    , bundler_options = {}
    , CWD = process.cwd()
    , test_bundles = {}
    , bundler
    , argv

  argv = self.browserify_options.slice()

  // inject a transform, insert globals by
  // default, debug by default
  argv = argv.concat([
      '-t'
    , path.join(__dirname, 'test_transform.js')
    , '-ig'
    , '-d'
  ])

  bundler = browserify(argv)
  tests.forEach(bundle_tests)
  bundler.bundle(bundler_options, onbundled)

  function bundle_tests(file) {
    var name = hash.hash(file)

    bundler.require(resolve_file(file), { expose: name })
    test_bundles[file] = name
  }

  function onbundled(err, data) {
    if(err) {
      return ready(err)
    }

    ready(null, data, test_bundles)
  }

  function resolve_file(file) {
    return path.resolve(CWD, file)
  }
}


proto.report = function(env, suite_name, result_data, is_done, total_tests) {
  var self = this
    , exceptions = []
    , coverage = {}
    , browsers = []
    , summary = {}

  process.removeAllListeners('uncaughtException')

  if(self.cli.options.tap) {
    self.cli.write('1..' + total_tests + '\n')

    self.cli.exit(self.num_errors)
  }

  Object.keys(result_data).forEach(function(browser) {
    browsers.push(browser)

    var passes = 0
      , errors = 0
      , fails = 0
      , ms = 0

    Object.keys(result_data[browser]).forEach(function(file) {

      var file_data = result_data[browser][file]

      if(file_data.coverage && Object.keys(file_data.coverage).length) {
        coverage[file] = coverage[file] || {}
        coverage[file].mask = file_data.coverage.mask
        coverage[file].browsers = coverage[file].browsers || {}
        coverage[file].browsers[browser] = file_data.coverage.cover
      }

      Object.keys(file_data.result).forEach(function(test_name) {
        var test_result = file_data.result[test_name]

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
          augmented.stack = test_result.stacktrace

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

  if(!self.num_errors && Object.keys(coverage).length)
    self.report_coverage(coverage, browsers)

  if(is_done && self.cli.should_exit())
    self.cli.exit(self.num_errors)
}

function firefox_to_webkit(exc) {
  var bits = exc.stack.split('\n')

  return 'Error: '+exc.message+'\n'+bits.map(function(bit) {
    bit = bit.split(')@/')
    var fn = bit[0]
      , loc = bit[1]

    fn = fn.split('(')[0].replace(/\s+/g, '')
    loc = '/'+loc+':0'

    return '    '+'at '+(fn.length ? loc : fn +' ('+loc+')')
  }).join('\n')
}

proto.format_exc = function(browser, trace, is_fail) {
  var original_trace = trace

  function replace_http(cwd, str) {
    return str
      .replace(/http(s)?:\/\/([^\/]+)(:\d+)?\/media\//g, path.join(__dirname, '..', 'public')+'/')
      .replace(/http(s)?:\/\/([^\/]+)(:\d+)?\/([\w\d\-]+)\/([\w\d\-]+)\/_media\//g, cwd+'/')
  }

  trace = replace_http(
      this.cwd
    , trace.stack || ('Error: '+trace.message+'\n    at <unknown> ('+trace.sourceURL +':'+trace.lineNumber+':0)')
  )

  if(/firefox/i.test(browser) && original_trace.stack) {
    original_trace.stack = replace_http(this.cwd, original_trace.stack)

    trace = firefox_to_webkit(original_trace)
  }

  try {
    var traced = tracejs({stack:trace})

    traced.frames = traced.frames.filter(function(frame, idx) {
      return frame && frame.filename.indexOf(DIR) !== 0
    })

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

  out.browserify = this.browserify
  out.browserify_options = this.browserify_options || []
  out.failfast = this.failfast
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

proto.report_coverage = function(coverage, browsers) {
  // coverage: {<filename>:{browsers:BROWSERS, mask:MASK}, ...}
  // BROWSERS: {browser_name:{HASH:NUM}, ...}
  // MASK:     {HASH:{file:filename, start:"line:col", end:"line:col"}}
  var self = this
    , complete_mask = Object.create(null)
    , browser_results = {}
    , mask_by_file = []
    , common = {}
    , Empty = new Object
    , cached_files = {}

  // create an empty "results" object
  // for each available env.
  browsers.forEach(function(browser) {
    browser_results[browser] = {}
  })

  // iterate over the coverage object's different test suites,
  // accumulating a "complete mask" representing all hashes available
  // to all test suites.
  //
  // automatically assume every environment is missing every hash.
  iterobject(coverage, function(test, test_filename) {
    var mask = test.mask

    complete_mask = Object.create(complete_mask)
    iterobject(mask, function(item, hash) {
      complete_mask[hash] = item

      ;(mask_by_file[item.file] = mask_by_file[item.file] || []).push(hash)

      browsers.forEach(function(browser) {
        browser_results[browser][hash] = Empty
      })
    })
  })

  // iterate over the coverage object again, now that the mask is complete.
  // delete hashes from browsers who have results for that line.
  iterobject(coverage, function(test, test_file) {
    var browsers = test.browsers
    iterobject(browsers, function(hash_mask, browser_name) {
      iterobject(hash_mask, function(num, hash) {
        delete browser_results[browser_name][hash]
      })
    })
  })

  // roll-up the results into a "common" environment -- any hash
  // that is missing from **all** envs is placed here (in an effort
  // to make the output more readable).
  iterobject(browser_results, function(missing_hashes, browser_name) {
    iterobject(missing_hashes, function(xxx, hash) {
      if(hash in common) {
        // this hash is already common.
        return
      } else {
        var missing_in_all = browsers.every(function(other_browser_name) {
          if(other_browser_name === browser_name) return true
          return hash in browser_results[other_browser_name]
        })

        if(missing_in_all) {
          common[hash] = Empty
          // remove this missing hash from all other browsers.
          iterobject(browser_results, function(missing_hashes) {
            delete missing_hashes[hash]
          })
        }
      }
    })
  })

  // if there's any commonality, output it first.
  if(Object.keys(common).length) {
    output_results('ALL ENVS', common)
  }

  // and go through the browsers one last time,
  // displaying any "browser specific" missing lines.
  iterobject(browser_results, function(browser, title) {
    if(Object.keys(browser).length) {
      output_results(title, common)
    }
  })

  self.cli.write('\x1b[0m\n')

  function output_results(title, result_object) {
    var by_file = {}
    iterobject(result_object, function(loc, hash) {
      loc = complete_mask[hash]
      by_file[loc.file] = by_file[loc.file] || []
      by_file[loc.file].push(loc)
    })

    self.cli.write('\x1b[0m'+title+':\n')
    iterobject(by_file, function(locations, filename) {
      var lines = cached_files[filename] = cached_files[filename] || fs.readFileSync(filename, 'utf8').split('\n')
        , total = mask_by_file[filename].length
        , hit = total - by_file[filename].length
        , percent = ~~(hit / total * 100.0)
        , out = {}

      iterobject(locations, function(offsets) {
        var start = offsets.start.split(':')
          , start_line = start[0]
          , start_character = start[1]
          , end = offsets.end.split(':')
          , end_line = end[0]
          , end_character = 1 + ~~end[1]

        out[start_line] = out[start_line] || {offs:{}, no:start[0]}

        out[start_line].line = lines[start_line]
        out[start_line].offs[start_character] = 1
        out[start_line].offs[end_character] = -1
      })

      var color = percent > 80 ? 32 :
                  percent > 60 ? 33 :
                  percent > 40 ? 35 :
                  31

      self.cli.write('\x1b[0m'+filename+' ('+hit+'/'+total+', \x1b['+color+'m'+percent+'%\x1b[0m):\n')
      iterobject(out, function(output) {
        process.stderr.write('\x1b[33m'+pad(output.no)+':\x1b[0m')
        var color = 0
        for(var i = 0; i < output.line.length; ++i) {
          if(output.offs[i]) {
            color += output.offs[i]
            if(color > 0)
              process.stderr.write('\x1b[31m')
            else
              process.stderr.write('\x1b[0m')
          }
          process.stderr.write(output.line.charAt(i))
        }
        process.stderr.write('\n')
      })
    })
  }
}

    function pad(num) {
      num = ''+num
      while(num.length < 4)
        num = ' '+num
      return num
    }

function iterobject(obj, fn) {
  Object.keys(obj).forEach(function(key, idx) {
    return fn(obj[key], key, idx)
  })
}


Client.LocalClient = Local
