// Need to load jsdom first because of circular dependency
var jsdom = require('jsdom')

var Location = require('jsdom/lib/jsdom/browser/location')
  , URL = require('url')

module.exports = NodeLocation

function NodeLocation(window) {
  if(!(this instanceof NodeLocation)) {
    return new NodeLocation(window)
  }

  Location.call(this, window.location.toString(), window)
}

NodeLocation.prototype = Object.create(Location.prototype, {
    href: {
        configurable: false
      , get: get
      , set: set
    }
})

function get() {
  return this.toString()
}

function set(val) {
  var old_hash = this._url.hash || ''
    , old_url = this._url.href
    , same_path

  this._url = URL.parse(URL.resolve(old_url, val))
  same_path = old_url.split('#')[0] === this._url.href.split('#')[0]

  if(same_path && this._url.hash && old_hash !== this._url.hash || '') {
    this._signalHashChange(old_url, this._url.href)
  } else if(this._window.on_location_change) {
    this._window.on_location_change(this)
  }
}
