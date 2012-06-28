// (c) 2012 Urban Airship and Contributors 

;(function() {
  var redirects = {}

  function stubxhr(xhr) {
    var old_open = XMLHttpRequest.prototype.open

    XMLHttpRequest.prototype.open = function() {
      var args = [].slice.call(arguments)
      if(args[1] && redirects[args[1]]) {
        args[1] = redirects[args[1]]
      }
      return old_open.apply(this, args)
    }
  }

  function stubactivex() {
    var RealActiveXObject = window.ActiveXObject
    window.ActiveXObject = function(progid) {
      var ax = new RealActiveXObject(progid)
      if(ax.open) {
        var old_open = ax.open
        ax.open = function() {
          var args = [].slice.call(arguments)
          if(args[1] && redirects[args[1]]) {
            args[1] = redirects[args[1]]
          }
          return old_open.apply(ax, args)
        }
      }
      return ax
    }
  }

  if(typeof ActiveXObject !== 'undefined')
    stubactivex()
  if(typeof XMLHttpRequest !== 'undefined')
    stubxhr()

  window.__redirect__ = function(r) {
    redirects = r
  }

})()
