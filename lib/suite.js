module.exports = Suite

var mime = require('simple-mime')('application/octet-stream')
  , burrito = require('burrito')

function Suite(name, request) {
  this.name = name
  this.request = request

  this.filedata = null
  this.human_name = null 
  this.endpoints = null
  this.html_path = null
  this.html = null
}

var cons = Suite
  , proto = cons.prototype

proto.load_from = function(filedata) {
  try {
    var fn = Function('return function(suite, endpoints, html) { '+filedata+' }')()
      , suite = Function()
      , path
      , html = function(loc) { path = loc } 
      , self = this
      , endpoints = function(obj) { self.endpoints = obj }

    // this will set our suite's endpoints.
    fn(suite, endpoints, html)

    this.html_path = path
  } catch(err) {
    // if we encounter an error, we swallow it and attempt to
    // continue.
  }
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
    data = url.parse('/?'+data, true).query
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

proto.respond_media = function(req, resp, endpoint) {
  var self = this
    , mimetype = mime(endpoint)

  self.request.client.load_media(endpoint, function(err, data) {
    if(err) {
      resp.writeHead(404, {'Content-Type':'text/plain'})
      return resp.end('wat')
    }

    resp.writeHead(200, {'Content-Type':mimetype})

    if(self.request.want_repl && (mimetype === 'text/javascript' || mimetype === 'application/javascript')) {
      data = self.rewrite_with_repl(endpoint, data)
    }

    resp.end(data)
  })
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

proto.rewrite_with_repl = function(endpoint, data) {
  var self = this

  var uniq = []
  var src = burrito(data, function visit(node) {
    if(node.name === 'stat') {
      node.wrap('{ __repl('+JSON.stringify(endpoint+':'+node.start.line)+', function(__repl__, __x) { return eval(__repl__()) }); %s; }')
    } else if(node.name === 'call') {
      node.wrap('(function() { try { __repl.callenter(); return %s } finally { __repl.callexit() } }).call(this)')
    }
  })

  return src
}
