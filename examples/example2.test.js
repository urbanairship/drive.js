suite("Test of FilePicker2", function(require) {
  var FilePicker = require('./static/js/modules/datepicker')

  test("does something", function() {
    assert.equal(1, 1)
  })

  test("does something else", function(done) {
    var xhr = new XMLHttpRequest

    xhr.onreadystatechange = function() {
      if(xhr.readyState === 4)
        got_xhr()
    } 

    xhr.open('GET', window.location.pathname + 'test/endpoint')
    xhr.send(null)

    function got_xhr() {
      throw new Error
      assert.equal(JSON.parse(xhr.responseText).test, 2)
      done()
    }
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
