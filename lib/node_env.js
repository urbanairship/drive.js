// (c) 2012 Urban Airship and Contributors

module.exports = NodeEnvironment

var mock_location = require('./node_location')
  , mock_xhr  = require('./node_xhr')
  , request   = require('request')
  , jsdom     = require('jsdom')

function NodeEnvironment(host, coverage_path) {
  this.host = host
  this.coverage_path = coverage_path || null

  this.window =
  this.document = null
}

var cons = NodeEnvironment
  , proto = cons.prototype

proto.connect = function() {
  process.on('uncaughtException', this.on_uncaught_exception.bind(this))
  this.get_url('/')
}


proto.get_url = function(path) {
  var url = this.host + path

  return request(url, this.got_url.bind(this, url))
}

proto.got_url = function(url, err, response, body) {
  var options = {
      features: {
          FetchExternalResources: ['script']
        , ProcessExternalResources: ['script']
      }
    , url: url
  }

  this.document = jsdom.jsdom(body, null, options)
  this.window = this.document.parentWindow
  this.window.console = console
  this.window.console.__node__ = true
  this.window.XMLHttpRequest = mock_xhr(this)
  this.window.location = mock_location(this)

  var self = this

  this.window.onLocationChange = function(location) {
    return self.get_url(location.pathname)
  }
}

proto.on_uncaught_exception = function(err) {
  if(this.window && this.window.onerror) {
    this.window.onerror(err)
  }
}
