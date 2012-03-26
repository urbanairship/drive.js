function driver(url) {
  var xhr = new XMLHttpRequest

  xhr.onreadystatechange = function() {
    if(xhr.readyState == 4) try { 
      xhr_continue(__JSON__.parse(xhr.responseText))
    } catch(err) {
      // attempt to reconnect in a second...
      console.error(err)
      setTimeout(function() {
        driver('/register/')
      }, 1000) 
    }
  }
  xhr.open('GET', url+"?user_agent=node")
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
