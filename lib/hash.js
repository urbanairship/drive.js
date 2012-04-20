// (c) 2012 Urban Airship and Contributors 

module.exports = create_hashmap

var crypto = require('crypto')

function create_hashmap(if_none_match, timeout_ms) {
  var hash_map = {}
    , ms = timeout_ms || 1000
    , hash

  return function(data) {
    var args = [].slice.call(arguments)

    hash = create_hashmap.hash(data)

    if(hash in hash_map) {
      clearTimeout(hash_map[hash].timeout)
      hash_map[hash].timeout = setTimeout(delete_hash, ms)
      return hash_map[hash].result
    } else {
      hash_map[hash] = {
        timeout:  setTimeout(delete_hash, ms)
      , result:   if_none_match.apply(null, args)
      }

      return hash_map[hash].result
    }

    function delete_hash() {
      delete hash_map[hash]
    }
  }
}

create_hashmap.hash = function(data) {
  return crypto.createHash('sha1').update(data).digest('hex')
}
