// (c) 2012 Urban Airship and Contributors 

module.exports = NodeEnvironment

var request   = require('request')
  , jsdom     = require('jsdom')
  , mock_xhr  = require('./node_xhr')

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
  var url = this.host+path

  return request(url, this.got_url.bind(this, url))
}

proto.got_url = function(url, err, response, body) {
  var options = {
        features:{
          FetchExternalResources:['script']
        , ProcessExternalResources:['script']
        }
      , url:url
    }

  this.document = jsdom.jsdom(body, null, options)
  this.window = this.document.createWindow()
  this.window.console = console
  this.window.XMLHttpRequest = mock_xhr(this)

  var self = this
    , ival

  ival = setInterval(function() {
    if(self.window.location.toString() !== url) {
      clearInterval(ival)
      return self.get_url(self.window.location) 
    }
  }, 10)
}

proto.on_uncaught_exception = function(err) {
  if(this.window && this.window.onerror) {
    this.window.onerror(err)
  }
}
