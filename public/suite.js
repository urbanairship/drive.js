(function(exports) {
  var console = window.console || {}
  
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

  console.log = log(console.log)
  console.error = log(console.error)

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

    xhr.open('GET', url)
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
    if(err) err.stacktrace = ''+err.stack
    this.results[test.name] = err || {'pass':true}
  }

  proto.respond_error = function(test, err_name, script, line) {
    test.emit(/assert.js$/.test(script) ? 'fail' : 'error', {message: test.name + '\n' + err_name + '\n' + script + ':'+ line })
    test.emit('end') 
  }

  proto.finish = function() {
    if(this.pending_pushes > 0) {
      return setTimeout(bind(this.finish, this), 10)
    }

    var results = __JSON__.stringify({suite:this.name, data:this.results})
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


    window.onerror = function() {
      // errors at this point are probably syntax errors.

      test_suite.push_update(test_suite.urls.error)
      test_suite.finish()
    }

    exports.test = bind(test, null, test_suite)
    define(name, fn)

    require([name], function() {

      test_suite.go()
    })
  }

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

  exports.__repl = function(ident, fn) {
    if(repl.breakpoint) {
      while(1) {
        try {
          var result = fn(function() { return repl.take(ident) })
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
