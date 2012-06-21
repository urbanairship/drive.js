// (c) 2012 Urban Airship and Contributors 

;(function(exports) {

  function make_error(message) {
    var err = new Error(message)
    err.assertion = true
    return err
  }

  exports.guard = function(onerror, fn) {
    var self = this

    return function() {
      var args = [].slice.call(arguments)
      try {
        return fn.apply(self, args)
      } catch(err) {
        onerror(err)
      }
    }
  }

  exports.ok = function(val, message) {
    if(!val) {
      throw make_error(message || ('not ok: ' + val))
    }
  }

  exports.equal = function(lhs, rhs, message) {
    if(lhs != rhs) {
      throw make_error(message || ('lhs ("'+lhs+'") should == rhs ("'+rhs+'")'))
    }
  } 

  exports.notEqual = function(lhs, rhs, message) {
    if(lhs == rhs) {
      throw make_error(message || ('lhs ("'+lhs+'") should != rhs ("'+rhs+'") '))
    }
  } 

  exports.deepEqual = function(lhs, rhs, message) {
    if(!is_deep_equal(lhs, rhs)) {
      throw make_error(message || ('lhs '+JSON.stringify(lhs)+' should deep equal rhs '+JSON.stringify(rhs)))
    }
  }

  exports.notDeepEqual = function(lhs, rhs, message) {
    if(is_deep_equal(lhs, rhs)) {
      throw make_error(message || ('lhs '+JSON.stringify(lhs)+' should not deep equal rhs '+JSON.stringify(rhs)))
    }
  }

  exports.strictEqual = function(lhs, rhs, message) {
    if(lhs !== rhs) {
      throw make_error(message || ('lhs ("'+lhs+'") should === rhs ("'+rhs+'")'))
    }
  }

  exports.notStrictEqual = function(lhs, rhs, message) {
    if(lhs === rhs) {
      throw make_error(message || ('lhs ("'+lhs+'") should !== rhs ("'+rhs+'")'))
    }
  }

  exports.throws = function(lhs, rhs, expected, message) {
    _throws.call(this, true, lhs, rhs, expected, message)
  }

  exports.doesNotThrow = function(lhs, rhs, expected, message) {
    _throws.call(this, false, lhs, rhs, expected, message)
  }

  exports.ifError = function(err) {
    if(err)
      throw err
  }

  function _throws (should_throw, block, expected, message) {
    var actual

    if(typeof expected === 'string') {
      message = expected
      expected = null
    }

    try {
      block()
    } catch(e) {
      actual = e
    }

    if(should_throw && !actual) {
      throw make_error('Missing expected exception ' + (message || ''))
    } else if(!should_throw && actual) {
      throw make_error('Got unwanted exception ' + actual + (message || ''))
    }
  }

  function is_deep_equal(lhs, rhs) {
    if(lhs === rhs)
      return true
    else if(lhs instanceof Date && rhs instanceof Date)
      return lhs.getTime() === rhs.getTime()
    else if(typeof lhs !== 'object' && typeof rhs !== 'object')
      return lhs == rhs
    else {
      return obj_equiv(lhs, rhs)
    }
  }

  function undefined_or_null(x) {
    return x === undefined || x === null
  }

  function is_arguments(x) {
    return {}.toString.call(x) === '[object Arguments]'
  }

  function obj_equiv(lhs, rhs) {
    if(undefined_or_null(lhs) || undefined_or_null(rhs))
      return false
    if(lhs.prototype !== rhs.prototype)
      return false
    if(is_arguments(lhs)) {
      if(!is_arguments(rhs)) {
        return false
      }
      return is_deep_equal([].slice.call(lhs), [].slice.call(rhs)) 
    }
    try {
      var lhs_keys = []
        , rhs_keys = []
        , key
        , i

      for(key in lhs) if(lhs.hasOwnProperty(key)) lhs_keys.push(key)
      for(key in rhs) if(rhs.hasOwnProperty(key)) rhs_keys.push(key)

    } catch(err) {
      return false
    }

    if(lhs_keys.length !== rhs_keys.length)
      return false

    lhs_keys.sort()
    rhs_keys.sort()

    for(i = lhs_keys.length-1; i >= 0; --i)
      if(lhs_keys[i] !== rhs_keys[i])
        return false

    for(i = lhs_keys.length-1; i >= 0; --i)
      if(!is_deep_equal(lhs[lhs_keys[i]], rhs[lhs_keys[i]]))
        return false

    return true
  }

})(window.assert = {})
