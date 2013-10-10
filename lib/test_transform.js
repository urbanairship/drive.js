var lang = require('cssauron-falafel')
  , falafel = require('falafel')
  , through = require('through')

var is_require_pass

is_require_pass = lang('call > id[name=suite]:first-child + literal ' +
    '~ function > id[name=require]')

module.exports = transform

function transform(file) {
  var tr = through(write, end)
    , data = ''

  return tr

  function write(buf) {
    data += buf
  }

  function end() {
    this.queue('' + falafel(data, process_function))
    this.queue(null)
  }

  function process_function(node) {
    if(is_require_pass(node)) {
      node.update('')
    }
  }
}
