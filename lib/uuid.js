function pad(str, len) {
  len = len || 16
  while(str.length < 16)
    str = '0'+str
  return str
}

module.exports = function() {
  return pad(parseInt(Math.random() * 0xFFFFFFFF).toString(16)) + '-' + pad(Date.now().toString(16))
}
