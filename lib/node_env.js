// (c) 2012 Urban Airship and Contributors

module.exports = NodeEnvironment

var fork = require('child_process').fork
  , url = require('url')

function NodeEnvironment(host, coverage_path) {
  this.host = host
  this.coverage_path = coverage_path || null
  this.child = null
}

var cons = NodeEnvironment
  , proto = cons.prototype

proto.connect = function(path) {
  var child = fork(__dirname + '/node_subprocess.js')
    , self = this

  child.on('message', function(msg) {
    if(msg.kill) {
      child.send({url: null})

      return self.connect(msg.url)
    }

    child.send({
        url: url.resolve(self.host, msg.url)
    })
  })

  child.send({url: url.resolve(this.host, path || '/')})

  self.child = child
}

proto.exit = function() {
  if(this.child) {
    this.child.send({url: null})
    this.child = null
  }
}
