var URL = require('url')

module.exports = create_location

function create_location(env) {
  var _location = URL.parse(env.window.location.toString())
    , window = env.window
    , location = {}

  window.__defineSetter__('location', function(url) {
    console.log(url)
  })

  location.__defineGetter__('protocol', function() {
    return _location.protocol
  })

  location.__defineGetter__('host', function() {
    return _location.host
  })

  location.__defineGetter__('auth', function() {
    return _location.auth
  })

  location.__defineGetter__('hostname', function() {
    return _location.hostname
  })

  location.__defineGetter__('port', function() {
    return _location.port
  })

  location.__defineGetter__('pathname', function() {
    return _location.pathname
  })

  location.__defineGetter__('href', function() {
    return _location.href
  })

  location.__defineSetter__('href', function(val) {
    var oldProtocol = _location.protocol
      , oldPathname = _location.pathname
      , oldHash = _location.hash || ''
      , oldHost = _location.host
      , oldUrl = _location.href

    _location = URL.parse(URL.resolve(oldUrl, val))

    var newProtocol = _location.protocol
      , newPathname = _location.pathname
      , newHash = _location.hash || ''
      , newHost = _location.host
      , newUrl = _location.href

    if(oldHash !== newHash && window && window.document) {
      var ev = window.document.createEvent('HTMLEvents')

      ev.initEvent('hashchange', false, false)
      ev.oldUrl = oldUrl
      ev.newUrl = newUrl

      process.nextTick(function() {
        window.dispatchEvent(ev)
      })
    }

    if(window.on_location_change) {
      window.on_location_change(location)
    }
  })

  location.__defineGetter__('hash', function() {
    return _location.hash || ''
  })

  location.__defineSetter__('hash', function(val) {
    var oldHash = _location.hash || ''
      , oldUrl = _location.href

    if(val.lastIndexOf('#', 0) !== 0) {
      val = '#' + val
    }

    _location = URL.parse(URL.resolve(oldUrl, val))

    var newHash = _location.hash || ''
      , newUrl = _location.href

    if(oldHash !== newHash && window && window.document) {
      var ev = window.document.createEvent('HTMLEvents')

      ev.initEvent('hashchange', false, false)
      ev.oldUrl = oldUrl
      ev.newUrl = newUrl

      process.nextTick(function() {
        window.dispatchEvent(ev)
      })
    }
  })

  location.__defineGetter__('search', function() {
    return _location.search || ''
  })

  location.__defineSetter__('search', function(val) {
    var oldHash = _location.hash || ''
      , oldUrl = _location.href

    if(val.length) {
      if(val.lastIndexOf('?', 0) !== 0) {
        val = '?' + val
      }

      _location = URL.parse(URL.resolve(oldUrl, val + oldHash))
    } else {
      _location = URL.parse(oldUrl.replace(/\?([^#]+)/, ''))
    }
  })

  location.replace = function(val) {
    location.href = val
  }

  location.toString = function() {
    return _location.href
  }

  location.test = 'adads'

  return location
}
