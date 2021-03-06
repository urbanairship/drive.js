// (c) 2012 Urban Airship and Contributors

module.exports = Suite

var mime = require('simple-mime')('application/octet-stream')
  , querystring = require('querystring')
  , burrito = require('burrito')
  , crypto = require('crypto')
  , path = require('path')

var create_hashmap = require('./hash')
  , to_hash = create_hashmap.hash

function Suite(name, request) {
  this.name = name
  this.request = request

  this.filedata = null
  this.human_name = null
  this.endpoints = null
  this.html_path = null
  this.html = null

  this.rewrite_with_repl = create_hashmap(this.rewrite_with_repl)
  this.rewrite_with_coverage = create_hashmap(this.rewrite_with_coverage)
}

var cons = Suite
  , proto = cons.prototype

proto.load_from = function(filedata) {
  var fn = Function('return function(suite, endpoints, html) { '+filedata+' }')()
    , suite = Function()
    , path
    , html = function(loc) { path = loc }
    , self = this
    , endpoints = function(obj) { self.endpoints = obj }

  // this will set our suite's endpoints.
  fn(suite, endpoints, html)

  this.html_path = path
}

proto.respond_endpoint = function(req, resp, endpoint) {
  var self = this
    , data = []

  if(req.method !== 'post')
    return continue_request()

  req.on('data', data.push.bind(data))
  req.on('end', function() {
    data = data.join('')
    try {
      data = querystring.parse(data)
    } catch(err) {}

    continue_request()
  })

  function continue_request() {
    var fn = (self.endpoints || {})[endpoint]

    ;(fn || not_found)(req, resp, data)
  }

  function not_found() {
    resp.writeHead(404, {'Content-Type':'text/plain'})
    resp.end('wat')
  }
}

proto.respond_media = function(req, resp, endpoint, env, run) {
  var self = this
    , mimetype = mime(endpoint)
    , is_test
    , client
    , is_js

  client = self.request.client.dnode || self.request.client
  is_js = mimetype.indexOf('javascript') > -1
  is_test = /\.test\.js$/.test(endpoint)

  if(client.browserify && is_js && is_test) {
    return media_loaded(
        null
      , 'require(\'' + run.test_bundles[endpoint] + '\')()'
    )
  }

  self.request.client.load_media(endpoint, media_loaded)

  function media_loaded(err, data) {
    if(err) {
      resp.writeHead(404, {'Content-Type':'text/plain'})
      return resp.end('wat')
    }

    if(is_js) {

      if(self.request.want_repl) {
        data = self.rewrite_with_repl(data, endpoint)
      } else if(self.request.want_coverage && !/safari/i.test(env.type)) {
        data = self.rewrite_with_coverage(data, endpoint)
      }

    }

    resp.writeHead(200, {'Content-Type': mimetype})
    resp.end(data)
  }
}

proto.get_html = function(ready) {
  var self = this

  if(self.html)
    return ready(null, self.html)

  if(self.html_path)
    self.request.client.load_html(self.name, self.html_path, done)
  else
    done()

  function done(err, html) {
    self.html = html
    ready(err, html)
  }
}

proto.rewrite_with_repl = function(data, endpoint) {
  return burrito(data, function visit(node) {
    if(node.name === 'stat') {
      node.wrap('{ __repl('+JSON.stringify(endpoint+':'+node.start.line)+', function() { return eval(arguments[arguments.length-1]()) }, this, typeof arguments !== "undefined" ? arguments : []); %s; }')
    } else if(node.name === 'call') {
      node.wrap('(function() { try { __repl.callenter(); return %s } finally { __repl.callexit() } }).apply(this, typeof arguments !== "undefined" ? arguments : [])')
    }
  })
}


proto.rewrite_with_coverage = function(data, endpoint) {
  var epstr = JSON.stringify(endpoint)
    , mask = {}
    , collected = {}
    , str
    , src

  if(/\.test\.js$/.test(endpoint))
    return data

  src = burrito(data, function visit(node) {
    var uuid = to_hash(endpoint+':'+node.start.line+':'+node.start.col+':'+node.source())
      , contains_require = /require\s*\(/.test(node.source())

    if(contains_require) {
      return
    }

    if(!!~['stat', 'call'].indexOf(node.name))
      mask[uuid] = {
          file:endpoint
        , start:node.start.line+':'+node.start.col
        , end:node.end.line+':'+node.end.col
      }

    str = '__c__.r("'+uuid+'")'
    if(node.name === 'stat') {
      node.wrap('{ '+str+'; %s }')
    } else if(node.name === 'call') {
      node.wrap('['+str+', %s][1]')
    } else if(node.name === 'binary') {
      node.wrap('[[%a][0] '+node.node[1]+'[%b][0]][0]')
    }
  })

  src = '__c__.m('+JSON.stringify(mask)+');' + src

  return src
}
