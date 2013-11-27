// Need to load jsdom first because of circular dependency
var jsdom = require('jsdom')

var Location = require('jsdom/lib/jsdom/browser/location')
  , URL = require('url')

NodeLocation.prototype = Object.create(Location.prototype, {
    href: {
        configurable: false
      , get: get
      , set: set
    }
})

module.exports = NodeLocation

function NodeLocation(env) {
  if(!(this instanceof NodeLocation)) {
    return new NodeLocation(env)
  }

  Location.call(this, env.window.location.toString(), env.window)
}

function get() {
  return this.toString()
}

function set(val) {
  var oldHash = this._url.hash || ''
    , oldUrl = this._url.href

  this._url = URL.parse(URL.resolve(oldUrl, val))

  if(oldHash !== this._url.hash || '') {
    this._signalHashChange(oldUrl, this._url.href)
  }

  if(this._window.on_location_change) {
    this._window.on_location_change(this)
  }
}