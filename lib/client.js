module.exports = Client

var fs = require('fs')
  , path = require('path')

function Client(dnode) {
  this.dnode = dnode
}

var cons = Client
  , proto = cons.prototype

// server side

proto.send = function(message) {

}

proto.update = function(env_type, suite_name, msg) {
  this.dnode.update(env_type, suite_name, msg) 
}

proto.report = function(env, name, result_data, is_done) {
  this.dnode.report(env, name, result_data, is_done)
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

function Local(cli, files) {
  this.cwd = process.cwd()
  this.num_errors = 0
  this.cli = cli
  this.files = files

}

proto = Local.prototype

proto.output = function(data) {
  this.cli.write(data)
}

proto.update = function(type, name, msg) {
  this.cli.write(msg)

  msg !== '.' && ++this.num_errors
}

proto.load = function(name, ready) {
  fs.readFile(path.join(this.cwd, name), 'utf8', ready)
}

proto.report = function(env, suite_name, result_data, is_done) {
  var self = this
  self.cli.write('\n\n')
  self.files.forEach(function(file) {
    self.cli.write(file+': \n')
    Object.keys(result_data).forEach(function(browser) {
      var result = result_data[browser][file]
        , result_info

      self.cli.write('  '+browser+': \n')

      Object.keys(result.data).forEach(function(test_name) {
        var test_result = result.data[test_name]

        self.cli.write('    '+test_name+': '+(test_result.pass ? 'PASS in '+test_result.elapsed+'ms' : 'FAIL'))
        if(!test_result.pass) {
          console.log(test_result)
        }
        self.cli.write('\n')
      })
    })
  })

  if(is_done && this.cli.should_exit())
    process.exit(this.num_errors)
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
  for(var key in this.constructor.prototype) if(this.constructor.prototype.hasOwnProperty(key))
    out[key] = this[key].bind(this)
  return out
}

proto.environments = function(targets) {
  var self = this
  targets.forEach(function(target) {
    self.cli.write(target+'\n')
  })
}

Client.LocalClient = Local
