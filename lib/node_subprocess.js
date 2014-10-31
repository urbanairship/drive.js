process.on('message', onmessage)

var mock_location = require('./node_location')
  , spawn = require('child_process').spawn
  , mock_xhr = require('./node_xhr')
  , request = require('request')
  , jsdom = require('jsdom')

var runs_remaining = 64
  , listener
  , event_names = [
        'onblur'
      , 'onchange'
      , 'onclick'
      , 'ondblclick'
      , 'onfocus'
      , 'onkeydown'
      , 'onkeypress'
      , 'onkeyup'
      , 'onmousedown'
      , 'onmouseenter'
      , 'onmouseleave'
      , 'onmouseout'
      , 'onmouseover'
      , 'onmouseup'
      , 'onresize'
      , 'onselect'
      , 'onsubmit'
    ]

function onmessage(msg) {
  if(!msg.url) {
    return process.exit(0)
  }

  request(msg.url, ondata)

  function ondata(err, response, body) {
    var features = {
        FetchExternalResources: ['script']
      , ProcessExternalResources: ['script']
    }

    var options = {
        features: features
      , url: msg.url
    }

    var document
      , window

    if(listener) {
      process.removeListener('uncaughtException', listener)
    }

    process.once('uncaughtException', listener = function(err) {
      runs_remaining = 1
      listener = null

      if(!window.onerror) {
        console.error(err.stack || err)

        return
      }

      window.onerror(err)
    })

    document = jsdom.jsdom(body, null, options)
    window = document.parentWindow
    window.console = console
    window.console.__node__ = true
    window.location = mock_location(window)
    window.XMLHttpRequest = mock_xhr(window)

    event_names.forEach(function(event_name) {
      window[event_name] = null
    })

    window.on_location_change = function(location) {
      --runs_remaining

      return process.send({url: location.pathname, kill: !runs_remaining})
    }
  }
}
