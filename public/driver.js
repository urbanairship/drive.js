// (c) 2012 Urban Airship and Contributors 

(function(exports) {

var xhr = new XMLHttpRequest()

function driver(url) {
  xhr.onreadystatechange = function() {
    if(xhr.readyState == 4) try { 
      xhr_continue(__JSON__.parse(xhr.responseText))
    } catch(err) {
      // attempt to reconnect in a second...
      setTimeout(function() {
        driver('/register/')
      }, 1000) 
    }
  }
  xhr.open('POST', url+"?user_agent=node")
  xhr.send(null)
}

function xhr_continue(info) {
  if(info.adverb === 'GET') {
    xhr_continue.timeout && clearTimeout(xhr_continue.timeout)
    window.location = info.action
  } else {
    xhr_continue.timeout = setTimeout(function() { driver(info.action) }, 200)
  }
}

xhr_continue.timeout = null

exports.xhr_continue = xhr_continue
exports.driver = driver

})(window)
