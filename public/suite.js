// (c) 2012 Urban Airship and Contributors 

(function(exports) {
  var console = window.console || {}

  function profile_start() {
    return

    profile_start.id = console.profile && console.profile('prof')
  }

  function profile_end() {
    return null

    console.profileEnd && console.profileEnd('prof')
    var profile = console.profiles && console.profiles[console.profiles.length-1]
    if(profile) try {
      return __JSON__.stringify(profile)
    } catch(err) {}
    return null
  }

  function log(original) {
    return function() {
      var args = [].slice.call(arguments)
        , xhr = new XMLHttpRequest

      try {
        ;(original || Function()).apply(console, args)
        xhr.open('POST', '_log/', false)
        xhr.send(__JSON__.stringify(args))
      } catch(err) {
      }
    }
  }

  if(!console.__node__) {
    console.log = log(console.log)
    console.error = log(console.error)
  }

  window.console = console

  function bind(fn, to) {
    var args = [].slice.call(arguments, 2)
    return function() {
      return fn.apply(to, args.concat([].slice.call(arguments)))
    } 
  }

  function EE() {
    this._listeners = {}
  }

  EE.prototype.on = function(name, fn) {
    (this._listeners[name] = this._listeners[name] || []).push(fn)
    return this
  }

  EE.prototype.emit = function(name) {
    var list = this._listeners[name] || []
      , args = [].slice.call(arguments, 1)

    for(var i = 0, len = list.length; i < len; ++i)
      list[i].apply(null, args)
  }

  function TestSuite(name) {
    this.name = name
    this.members = {}
    this.results = {}

    this.pending_pushes = 0

    EE.call(this)
  }

  var proto = TestSuite.prototype = new EE

  proto.urls = {
      pass:'pass/'
    , fail:'fail/'
    , error:'error/'
    , finish:'_respond/'
  }

  proto.push_update = function(url) {
    var self = this
      , xhr = new XMLHttpRequest()

    ++self.pending_pushes

    xhr.open('POST', url)
    xhr.onreadystatechange = function() {
      if(xhr.readyState == 4) {
        --self.pending_pushes
      }
    }
    xhr.send(null)
  }

  proto.add = function(test) {
    if(this.members[test.name])
      return this.fatal()

    this.members[test.name] = test

    for(var ev in {'pass':'', 'fail':'', 'error':''}) {
      test.on(ev, bind(this.push_update, this, this.urls[ev]))
      test.on(ev, bind(this.add_result, this, test, ev))
    }
  }

  proto.add_result = function(test, type, err) {
    var out = {}

    if(err) {
      out.stacktrace = ''+err.stack
      out.lineNumber = err.lineNumber || err.line
      out.sourceURL = err.sourceURL
      out.message = err.message
      out.assertion = err.assertion
    } else {
      out = {pass:true}
    }
    this.results[test.name] = out
  }

  proto.respond_error = function(test, err_name, script, line) {
    var is_assert = /assert.js$/.test(script)
    test.emit(is_assert ? 'fail' : 'error', {
        message: err_name
      , sourceURL: script
      , lineNumber: line
      , assertion: is_assert 
    })
    test.emit('end') 
  }

  proto.finish = function() {
    if(this.pending_pushes > 0) {
      return setTimeout(bind(this.finish, this), 10)
    }

    var results = __JSON__.stringify({
            suite:this.name
          , data:this.results
          , coverage:this.coverage
          , profile:profile_end()
        })
      , xhr = new XMLHttpRequest()

    xhr.onreadystatechange = bind(Function('next', 'xhr', 'if(xhr.readyState === 4) next()'), null, next, xhr)
    xhr.open('POST', this.urls.finish)
    xhr.send(results)

    function next() {
      // from driver.js
      xhr_continue(__JSON__.parse(xhr.responseText))
    }
  }

  proto.fatal = function() {
  }

  proto.go = function() {
    var now = +new Date
      , self = this
      , members = []

    for(var key in self.members) {
      members.push(key)
    }

    function iter(last) {
      if(last) {
        var tmp = +new Date
        self.results[last.name].elapsed = tmp - now
        now = tmp
      }

      self.timeout && clearTimeout(self.timeout)

      if(!members.length)
        return self.finish()

      var member = members.shift()
        , test = self.members[member]

      window.onerror = bind(self.respond_error, self, test)

      self.timeout = setTimeout(function() {
        test.emit('error', new Error('test timed out'))
        test.emit('end') 
      }, 30 * 1000) 

      // non-reentrant.
      var i = 0
      test.on('end', function() { if(++i < 2) setTimeout(function() { iter(test) }, 0) })
      test.go()
    } 

    iter()
  }

  function Test(name, fn) {
    this.name = name
    this.fn = fn
    EE.call(this)
  }

  proto = Test.prototype = new EE

  proto.go = function() {
    try {
      this.fn(bind(this.respond, this))
      return true
    } catch(err) {
      this.emit(err.assertion ? 'fail' : 'error', err)
      this.emit('end')
    }
  }

  proto.respond = function(err) {
    if(err)
      this.emit('error', err)
    else
      this.emit('pass')

    this.emit('end')
  }

  function SyncTest(name, fn) {
    Test.call(this, name, fn)
  }

  SyncTest.prototype = new Test
  SyncTest.prototype.respond = function() {
    // do nothing. 
  }

  SyncTest.prototype.go = function() {
    Test.prototype.go.call(this) && (this.emit('pass'), this.emit('end'))
  }

  function test(suite, name, fn) {
    suite.add(new (fn.length > 0 ? Test : SyncTest)(name, fn)) 
  }


  function suite(name, fn) {
    var test_suite = new TestSuite(name)
      , name = 'test-module-'+(+new Date())
      , timeout

    __c__.attach(test_suite)

    window.onerror = function(err_name, script, line) {
      // errors at this point are probably syntax errors.
      console.log(err_name, script, line)
      test_suite.push_update(test_suite.urls.error)
      test_suite.add_result({name:name}, 'error', {
        message: err_name
      , sourceURL: script
      , line: line
      })
      test_suite.finish()
    }

    exports.test = bind(test, null, test_suite)
    define(name, fn)

    require([name], function() {
      profile_start()
      test_suite.go()
    })
  }

  // COVERAGE
  // ----------------------------------------

  function Coverage() {
    this.covered = {}
    this.mask = {}
  }

  var coverage_proto = Coverage.prototype

  coverage_proto.attach = function(suite, asname) {
    suite.coverage = {cover:this.covered, mask:this.mask}
    window[asname] = this
  }

  coverage_proto.r = function(hash) {
    this.covered[hash] = (this.covered[hash] || 0) + 1
  }

  coverage_proto.m = function(mask) {
    for(var key in mask) if(mask.hasOwnProperty(key)) {
      this.mask[key] = mask[key]
    }
  }

  __c__ = new Coverage

  // REPL
  // ----------------------------------------

  function REPL() {
    this.breakpoint = false
  }

  REPL.prototype.take = function(ident) {
    this.callenter = false

    var xhr = new XMLHttpRequest()
    xhr.open('GET', '_repl/?ident='+encodeURIComponent(ident), false)
    xhr.onreadystatechange = Function()
    xhr.send(null)

    switch(xhr.responseText) {
      case 'c':
      case 'continue':
        this.breakpoint = false
        throw {step:true}
      case 'n':
        throw {step:true}
      case 's':
        this.callenter = true
        throw {step:true}
    }

    return xhr.responseText
  }

  REPL.prototype.send = function(what) {
    var xhr = new XMLHttpRequest()

    xhr.onreadystatechange = Function()
    xhr.open('POST', '_repl/', false)
    try {
      xhr.send(__JSON__.stringify(what))
    } catch(err) {
    }
  }

  var repl = new REPL

  exports.__repl = function(ident, fn, target, args) {
    args = [].slice.call(args)
    if(repl.breakpoint) {
      while(1) {
        try {
          var result = fn.apply(target, args.concat([function REPL() { return repl.take(ident) }]))
          repl.send(result)
        } catch(err) {
          if(err.step)
            return
          repl.send(err)
        }
      }
    }
  } 

  exports.__repl.set_trace = function() {
    repl.breakpoint = true
    repl._cached = repl._cached ? repl._cached.concat([repl.breakpoint]) : [repl.breakpoint]
  }

  exports.__repl.callenter = function() {
    repl._cached = repl._cached ? repl._cached.concat([repl.breakpoint]) : [repl.breakpoint] 
    repl.breakpoint = repl.callenter
  }

  exports.__repl.callexit = function() {
    repl.breakpoint = repl._cached.pop()
  }

  exports.suite = suite
})(window)


function endpoints(endpoints) {
  // do nothing
}

function html(path) {
  // do nothing
}
