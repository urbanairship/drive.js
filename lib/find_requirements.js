var falafel = require('falafel')
  , lang = require('cssauron-falafel')
  , fs = require('fs')
  , path = require('path')

var is_require = lang('function call id[name=require]:first-child + literal')
  , dir_regexp = new RegExp(process.cwd())

module.exports = find_requires

function parse_file(filename, requirements, cb) {
  fs.readFile(filename, 'utf8', onread)

  function onread(err, filedata) {
    if (err) {
      return cb(err)
    }
    falafel('' + filedata, function (node) {
      if (is_require(node)) {
        var req = node.source().replace(/[\'|\"]/g, '')
          , real_req = path.resolve(path.dirname(filename), req)
          , named_req = real_req.replace(dir_regexp, '')
        if (!requirements[req] && !/\.html$/.test(req) && /^\.+/.test(req)) {
          requirements[req] = { named: named_req, full: real_req }
        }
      }
    })
    cb(null, requirements)
  }
}

function find_requires(filenames, ready) {
  var requirements = {}
    , count = filenames.length

  while (filenames.length) {
    parse_file(filenames.shift(), requirements, onparsed)
  }

  function onparsed(err, parsed_reqs) {
    if (err) {
      return ready(err)
    }
    requirements = parsed_reqs
    !--count && ready(null, requirements)
  }

}
