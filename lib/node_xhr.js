module.exports = create_xhr

var XMLHttpRequest = require('xmlhttprequest').XMLHttpRequest
  , path = require('path')

function create_xhr(env) {
  return StubbedXHR

  function StubbedXHR() {
    var xhr = new XMLHttpRequest
      , open = xhr.open
      , host = 'http://' + env.window.location.host

    xhr.open = function(method, url, async, user, password) {
      url = /^http(s)?:\/\//.test(url) ? url : 
            /^\//.test(url) ? host + url : 
            host + path.join(env.window.location.path, url)

      var result = open.call(this, method, url, async, user, password)
      this.setRequestHeader('User-Agent', 'node')
      return result 
    }
    
    return xhr
  }
}
