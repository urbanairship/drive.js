suite("Test of FilePicker2", function(require) {
  var FilePicker = require('./static/js/modules/datepicker')

  test("does something", function() {
    assert.equal(1, 1)
  })
})

endpoints({
  'test/endpoint':function(req, resp) {
    resp.writeHead(200, {'Content-Type':'application/json'})
    resp.end(JSON.stringify({
      'test':13
    }))
  } 
})

html('./path/to/dom.html')
