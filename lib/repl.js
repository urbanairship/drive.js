// (c) 2012 Urban Airship and Contributors 

var readline = require('readline')
  , EE = require('events').EventEmitter
  , fs = require('fs')

module.exports = REPL

var cache = {}

function REPL() {
  this.rl = readline.createInterface(process.stdin, process.stdout, null)

  EE.call(this)
}

var cons = REPL
  , proto = cons.prototype = new EE

proto.take = function(ident, ready) {
  var query = this.lookup(ident)+'\n'+'>'
  this.rl.question(query, ready)
}

proto.lookup = function(ident) {
  var bits = ident.split(':')
    , file = bits.slice(0, -1).join(':')
    , line = bits.slice(-1)[0]
    , src

  try {
    src = (cache[ident] = (cache[ident] || fs.readFileSync(file, 'utf8')))

    return src.split('\n')[line]
  } catch(err) {
    return '???'
  }
}
