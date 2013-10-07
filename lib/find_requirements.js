var lang = require('cssauron-falafel')
  , falafel = require('falafel')
  , path = require('path')
  , fs = require('fs')

var is_require = lang('function call id[name=require]:first-child + literal')
  , dir_regexp = new RegExp(process.cwd())

module.exports = find_requires

function parse_file(filename, requirements, cb) {
  fs.readFile(filename, 'utf8', onread)

  function onread(err, filedata) {
    if(err) {
      return cb(err)
    }

    falafel('' + filedata, function(node) {
      if(is_require(node)) {
        var req = node.source().replace(/[\'|\"]/g, '')
          , real_req = path.resolve(path.dirname(filename), req)
          , named_req = real_req.replace(dir_regexp, '')

        if(!requirements[req] && !/\.html$/.test(req) && /^\.+/.test(req)) {
          requirements[req] = { named: named_req, full: real_req }
        }
      }
    })
    cb(null)
  }
}

function find_requires(filenames, ready) {
  var count = filenames.length
    , requirements = {}

  while(filenames.length) {
    parse_file(filenames.shift(), requirements, onparsed)
  }

  function onparsed(err) {
    if(err) {
      return ready(err)
    }

    !--count && ready(null, requirements)
  }

}
